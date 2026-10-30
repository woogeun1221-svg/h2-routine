import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createPublicKey, verify } from 'node:crypto';

const push = createRequire(import.meta.url)('../scripts/web_push.cjs');

/* RFC 8291 5절과 부록 A 의 예제 — 입력을 고정하면 본문이 바이트 단위로 같아야 한다 */
const rfc = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
};

describe('web_push.cjs 암호화', () => {
  it('RFC 8291 검증 벡터와 본문이 바이트 단위로 같다', () => {
    const body = push.encrypt(rfc.plaintext, { p256dh: rfc.uaPublic, auth: rfc.auth }, { salt: rfc.salt, asPrivate: rfc.asPrivate });
    expect(body.length).toBe(144); // 5절 본문 192자 base64url = 144바이트 (예제 헤더의 Content-Length 145는 알려진 정오표)
    expect(push.b64u(body)).toBe(rfc.body);
    expect(push.b64u(body.subarray(21, 86))).toBe(rfc.asPublic);
    expect(body.readUInt32BE(16)).toBe(4096);
    expect(body[20]).toBe(65);
  });

  it('무작위 salt 와 임시 키로 암호화한 본문을 수신 키로 복호화하면 원문이다', () => {
    const payload = JSON.stringify({ title: 'H2 루틴', body: '밤 9시. 오늘 루틴이 아직 미달이다.' });
    const first = push.encrypt(payload, { p256dh: rfc.uaPublic, auth: rfc.auth });
    const second = push.encrypt(payload, { p256dh: rfc.uaPublic, auth: rfc.auth });
    expect(first.equals(second)).toBe(false);
    expect(push.decrypt(first, rfc.uaPrivate, rfc.auth)).toBe(payload);
    expect(push.decrypt(second, rfc.uaPrivate, rfc.auth)).toBe(payload);
  });

  it('잘못된 키 길이는 거부한다', () => {
    expect(() => push.encrypt('x', { p256dh: rfc.uaPublic.slice(0, 40), auth: rfc.auth })).toThrow(/p256dh/);
    expect(() => push.encrypt('x', { p256dh: rfc.uaPublic, auth: 'short' })).toThrow(/auth/);
    expect(() => push.encrypt('x'.repeat(4100), { p256dh: rfc.uaPublic, auth: rfc.auth })).toThrow(/too large/);
  });
});

describe('web_push.cjs VAPID', () => {
  const vapid = push.generateVapid();
  const endpoint = 'https://web.push.apple.com/QABCdef123';
  const subject = 'https://woogeun1221-svg.github.io/h2-routine/';

  it('키 쌍은 65바이트 공개 포인트와 32바이트 비밀키다', () => {
    expect(push.unb64u(vapid.publicKey).length).toBe(65);
    expect(push.unb64u(vapid.publicKey)[0]).toBe(4);
    expect(push.unb64u(vapid.privateKey).length).toBe(32);
  });

  it('JWT 는 ES256 raw 서명이고 aud 는 엔드포인트 origin, exp 는 24시간 이내다', () => {
    const now = Date.UTC(2026, 9, 30, 12, 0, 0);
    const jwt = push.vapidJwt(endpoint, vapid, { subject, now });
    const [header, payload, signature] = jwt.split('.');
    expect(JSON.parse(push.unb64u(header).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(push.unb64u(payload).toString());
    expect(claims.aud).toBe('https://web.push.apple.com');
    expect(claims.sub).toBe(subject);
    expect(claims.exp - Math.floor(now / 1000)).toBe(12 * 3600);
    const raw = push.unb64u(vapid.publicKey);
    const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: push.b64u(raw.subarray(1, 33)), y: push.b64u(raw.subarray(33)) } });
    expect(push.unb64u(signature).length).toBe(64);
    expect(verify('sha256', Buffer.from(header + '.' + payload), { key: publicKey, dsaEncoding: 'ieee-p1363' }, push.unb64u(signature))).toBe(true);
    // ECDSA 서명은 호출마다 달라지므로 헤더 형식과 공개키 부분만 비교한다.
    const authorization = push.vapidAuthorization(endpoint, vapid, { subject, now });
    expect(authorization.startsWith('vapid t=' + header + '.' + payload + '.')).toBe(true);
    expect(authorization.endsWith(', k=' + vapid.publicKey)).toBe(true);
  });

  it('send 는 aes128gcm 본문과 VAPID 헤더로 POST 하고 상태 코드를 돌려준다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 201 });
    const subscription = { endpoint, p256dh: rfc.uaPublic, auth: rfc.auth };
    const result = await push.send(subscription, { title: 'H2 루틴', body: '테스트' }, vapid, { subject, ttl: 60, fetchImpl });
    expect(result).toEqual({ endpoint, status: 201 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(endpoint);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Encoding']).toBe('aes128gcm');
    expect(init.headers.TTL).toBe('60');
    expect(init.headers.Authorization.startsWith('vapid t=')).toBe(true);
    expect(push.decrypt(init.body, rfc.uaPrivate, rfc.auth)).toBe(JSON.stringify({ title: 'H2 루틴', body: '테스트' }));
  });

  it('sendAll 은 구독마다 결과를 내고 네트워크 오류는 status 0 으로 보고한다', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ status: 410 })
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    try {
      const output = await push.sendAll({
        subscriptions: [{ endpoint: endpoint + '1', p256dh: rfc.uaPublic, auth: rfc.auth }, { endpoint: endpoint + '2', p256dh: rfc.uaPublic, auth: rfc.auth }],
        payload: { title: 't' }, ttl: 10, subject
      }, vapid);
      expect(output.results).toEqual([{ endpoint: endpoint + '1', status: 410 }, { endpoint: endpoint + '2', status: 0, error: 'TimeoutError' }]);
    } finally { globalThis.fetch = original; }
  });
});
