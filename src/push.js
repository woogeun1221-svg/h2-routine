/* 앱 푸시 알림 — iOS 16.4 이상 홈 화면 앱과 데스크톱 브라우저의 Web Push 구독.
   서버에는 브라우저가 만든 구독 정보(엔드포인트, 공개키, 인증 비밀)만 보낸다. 루틴 기록은 보내지 않는다.
   enable 은 반드시 탭 핸들러 안에서 호출한다 — 권한 요청은 사용자 동작 안에서만 열린다. */
import { REMINDER_API } from './reminders.js';

const ENDPOINT_KEY = 'h2-routine-push-endpoint';

function keyBytes(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function keyText(buffer) {
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function defaultNotifications() { return typeof Notification === 'undefined' ? null : Notification; }
function defaultSupported() {
  return typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator && !!defaultNotifications();
}
function defaultApple() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
function defaultStandalone() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.standalone === true) return true;
  return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
}

export function createPushClient({ reminders, storage = localStorage, fetcher = fetch, endpoint = REMINDER_API,
  notifications = defaultNotifications(), pushSupported = defaultSupported, isApple = defaultApple,
  isStandalone = defaultStandalone, getRegistration = () => navigator.serviceWorker.ready,
  onStatus = () => {} } = {}) {
  let busy = false;
  let keyPromise = null;

  function report() { onStatus(getStatus()); }
  function known() { try { return storage.getItem(ENDPOINT_KEY); } catch (_) { return null; } }

  /* 'ok' | 'not-standalone'(iOS 는 홈 화면 앱에서만) | 'unsupported' */
  function support() {
    if (pushSupported() && notifications) return 'ok';
    return isApple() && !isStandalone() ? 'not-standalone' : 'unsupported';
  }

  function getStatus() {
    const s = support();
    if (s !== 'ok') return s;
    if (notifications.permission === 'denied') return 'denied';
    if (busy) return 'working';
    return known() ? 'enabled' : 'off';
  }

  function publicKey() {
    if (!keyPromise) {
      keyPromise = fetcher(endpoint + '/push/key', { method: 'GET', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000) })
        .then(response => { if (!response.ok) throw new Error('알림 서버 연결 실패'); return response.json(); })
        .then(result => {
          if (typeof result.key !== 'string' || result.key.length < 80) throw new Error('알림 서버 키 오류');
          return result.key;
        })
        .catch(error => { keyPromise = null; throw error; });
    }
    return keyPromise;
  }

  function requestPermission() {
    return new Promise(resolve => {
      const result = notifications.requestPermission(resolve);
      if (result && typeof result.then === 'function') result.then(resolve);
    });
  }

  async function subscribe(registration) {
    const key = await publicKey();
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const current = subscription.options && subscription.options.applicationServerKey;
      if (current && keyText(current) !== key) { await subscription.unsubscribe(); subscription = null; } // 서버 키가 바뀐 옛 구독
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    }
    return subscription;
  }

  /* code 가 있으면 연결과 구독 등록을 한 번에, 없으면 연결된 기기에 구독만 추가 */
  async function enable(code) {
    const s = support();
    if (s !== 'ok') throw new Error(pushStatusText(s, reminders.isConnected()));
    busy = true; report();
    try {
      let permission = notifications.permission;
      if (permission !== 'granted') permission = await requestPermission();
      if (permission !== 'granted') throw new Error('알림 권한이 허용되지 않았습니다. iOS 설정의 알림에서 H2 루틴을 허용해주세요.');
      const registration = await getRegistration();
      const subscription = await subscribe(registration);
      const json = subscription.toJSON();
      if (code) await reminders.connect(code, json);
      else await reminders.post('/push/subscribe', { subscription: json });
      storage.setItem(ENDPOINT_KEY, subscription.endpoint);
    } finally { busy = false; report(); }
  }

  async function disable() {
    busy = true; report();
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        try { await reminders.post('/push/unsubscribe', { endpoint: subscription.endpoint }); }
        catch (_) { /* 서버가 모르는 구독은 발송 실패 때 정리된다 */ }
        await subscription.unsubscribe();
      }
      storage.removeItem(ENDPOINT_KEY);
    } finally { busy = false; report(); }
  }

  /* 앱을 열 때 — 브라우저가 구독을 바꿨으면 서버에 다시 등록하고, 사라졌으면 켜짐 표시를 지운다 */
  async function resync() {
    if (support() !== 'ok' || !reminders.isConnected() || notifications.permission !== 'granted') return;
    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();
    const last = known();
    if (!subscription) {
      if (last) { storage.removeItem(ENDPOINT_KEY); report(); }
      return;
    }
    if (subscription.endpoint !== last) {
      await reminders.post('/push/subscribe', { subscription: subscription.toJSON() });
      storage.setItem(ENDPOINT_KEY, subscription.endpoint);
      report();
    }
  }

  function prefetch() { if (support() === 'ok') publicKey().catch(() => {}); }

  return { support, getStatus, enable, disable, resync, prefetch };
}

export function pushStatusText(status, connected) {
  if (status === 'not-standalone') return '앱 알림은 홈 화면에 추가한 앱에서만 켤 수 있습니다. Safari 공유 메뉴에서 홈 화면에 추가한 뒤 그 앱의 설정에서 켜주세요.';
  if (status === 'unsupported') return '이 브라우저는 앱 알림을 지원하지 않습니다. 연결하면 메인컨트롤 봇이 대신 알립니다.';
  if (status === 'denied') return '알림 권한이 꺼져 있습니다. iOS 설정의 알림에서 H2 루틴을 허용한 뒤 다시 켜주세요.';
  if (status === 'working') return '알림 설정 중…';
  if (status === 'enabled') return '이 기기로 앱 알림이 옵니다. 오전 9시부터 밤 9시까지 두 시간마다 루틴 미달 때, 밤 11시 만족도 미응답 때.';
  if (!connected) return '연결하면 이 기기로 앱 알림이 옵니다. 연결 전에는 알리지 않습니다.';
  return '이 기기 앱 알림 꺼짐. 켜기 전까지는 메인컨트롤 봇이 대신 알립니다.';
}
