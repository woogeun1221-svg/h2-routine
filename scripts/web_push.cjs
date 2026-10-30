#!/usr/bin/env node
/* Web Push 발송기 — 외부 패키지 없이 Node 내장 crypto 만 쓴다.
   RFC 8291(aes128gcm 콘텐츠 암호화)과 RFC 8292(VAPID, ES256)를 그대로 구현했고
   test/web-push.test.js 가 RFC 8291 부록 A 의 검증 벡터와 바이트 단위로 비교한다.

   사용:
     node web_push.cjs keygen
       → stdout JSON {publicKey, privateKey} (base64url). reminder_service.py 가 data/vapid.json 으로 저장한다.
     node web_push.cjs send --vapid data/vapid.json
       ← stdin JSON {subscriptions:[{endpoint, p256dh, auth}], payload:{title, body, tag, url}, ttl, subject}
       → stdout JSON {results:[{endpoint, status}]}  (status 0 = 네트워크 오류)
   구독 엔드포인트와 키는 출력 JSON 외에 어디에도 남기지 않는다. */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');

const CURVE = 'prime256v1';
const RECORD_SIZE = 4096;

function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function unb64u(text) { return Buffer.from(String(text).replace(/\s+/g, ''), 'base64url'); }

/* VAPID 키 쌍 — 공개키는 비압축 포인트 65바이트(0x04 || x || y), 비밀키는 d 32바이트 */
function generateVapid() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: CURVE });
  const jwk = privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
  return { publicKey: b64u(publicKey), privateKey: jwk.d };
}

function privateKeyObject(vapid) {
  const publicKey = unb64u(vapid.publicKey);
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('vapid publicKey must be a 65-byte uncompressed point');
  if (unb64u(vapid.privateKey).length !== 32) throw new Error('vapid privateKey must be 32 bytes');
  return crypto.createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: b64u(publicKey.subarray(1, 33)), y: b64u(publicKey.subarray(33)), d: vapid.privateKey }
  });
}

function hkdf(ikm, salt, info, length) {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));
}

/* RFC 8291 3.x — ua 공개키, auth 비밀, 송신측 ECDH 공유 비밀에서 IKM → CEK, NONCE */
function deriveKeys(ecdhSecret, authSecret, uaPublic, asPublic, salt) {
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), uaPublic, asPublic]);
  const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32);
  return {
    ikm,
    cek: hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16),
    nonce: hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12)
  };
}

/* 평문 → aes128gcm 본문(헤더 21바이트 + 송신 공개키 65바이트 + 암호문). options.salt, options.asPrivate 는 테스트용 고정값. */
function encrypt(plaintext, keys, options = {}) {
  const uaPublic = unb64u(keys.p256dh), authSecret = unb64u(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh must be a 65-byte uncompressed point');
  if (authSecret.length !== 16) throw new Error('auth must be 16 bytes');
  const salt = options.salt ? unb64u(options.salt) : crypto.randomBytes(16);
  if (salt.length !== 16) throw new Error('salt must be 16 bytes');
  const ecdh = crypto.createECDH(CURVE);
  if (options.asPrivate) ecdh.setPrivateKey(unb64u(options.asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const { cek, nonce } = deriveKeys(ecdh.computeSecret(uaPublic), authSecret, uaPublic, asPublic, salt);
  const record = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([2])]); // 0x02 = 마지막 레코드 구분자
  if (record.length + 16 > RECORD_SIZE) throw new Error('payload too large for a single record');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, ciphertext]);
}

/* 수신측 복호화 — 테스트의 왕복 검증용. 구분자 0x02 가 아니면 버린다(RFC 8291 4절). */
function decrypt(body, uaPrivate, auth) {
  const salt = body.subarray(0, 16), idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen), ciphertext = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH(CURVE);
  ecdh.setPrivateKey(unb64u(uaPrivate));
  const { cek, nonce } = deriveKeys(ecdh.computeSecret(asPublic), unb64u(auth), ecdh.getPublicKey(), asPublic, salt);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const record = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  let end = record.length - 1;
  while (end > 0 && record[end] === 0) end--;
  if (record[end] !== 2) throw new Error('invalid padding delimiter');
  return record.subarray(0, end).toString('utf8');
}

/* RFC 8292 — aud 는 푸시 서비스 origin, exp 는 24시간 이내(12시간), sub 는 연락처 URL */
function vapidJwt(endpoint, vapid, { subject, now = Date.now(), expiresIn = 12 * 3600 } = {}) {
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + expiresIn, sub: subject };
  const data = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) + '.' + b64u(JSON.stringify(claims));
  const signature = crypto.sign('sha256', Buffer.from(data), { key: privateKeyObject(vapid), dsaEncoding: 'ieee-p1363' });
  return data + '.' + b64u(signature);
}

function vapidAuthorization(endpoint, vapid, options) {
  return 'vapid t=' + vapidJwt(endpoint, vapid, options) + ', k=' + b64u(unb64u(vapid.publicKey));
}

async function send(subscription, payload, vapid, { ttl = 3600, subject, urgency = 'normal', timeout = 15000, fetchImpl = fetch } = {}) {
  const body = encrypt(typeof payload === 'string' ? payload : JSON.stringify(payload), subscription);
  const response = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(ttl), Urgency: urgency,
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      Authorization: vapidAuthorization(subscription.endpoint, vapid, { subject })
    },
    body, signal: AbortSignal.timeout(timeout)
  });
  return { endpoint: subscription.endpoint, status: response.status };
}

async function sendAll(input, vapid) {
  const results = await Promise.all((input.subscriptions || []).map(subscription =>
    send(subscription, input.payload, vapid, { ttl: input.ttl, subject: input.subject || vapid.subject })
      .catch(error => ({ endpoint: subscription.endpoint, status: 0, error: error && error.name ? error.name : 'error' }))));
  return { results };
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'keygen') {
    process.stdout.write(JSON.stringify(generateVapid()) + '\n');
    return Promise.resolve(0);
  }
  if (command === 'send') {
    const at = rest.indexOf('--vapid');
    if (at < 0 || !rest[at + 1]) { process.stderr.write('usage: web_push.cjs send --vapid FILE < input.json\n'); return Promise.resolve(2); }
    const vapid = JSON.parse(fs.readFileSync(rest[at + 1], 'utf8'));
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    return sendAll(input, vapid).then(output => { process.stdout.write(JSON.stringify(output) + '\n'); return 0; });
  }
  process.stderr.write('usage: web_push.cjs keygen | send --vapid FILE\n');
  return Promise.resolve(2);
}

module.exports = { b64u, unb64u, generateVapid, encrypt, decrypt, vapidJwt, vapidAuthorization, send, sendAll };

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    process.stderr.write((error && error.message ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}
