import { describe, it, expect, vi } from 'vitest';
import { createPushClient, pushStatusText } from '../src/push.js';

const KEY = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';

function storage() {
  const values = new Map();
  return { getItem: k => values.has(k) ? values.get(k) : null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
function fakeRegistration(existing = null) {
  const subscriptions = { current: existing };
  const pushManager = {
    getSubscription: vi.fn(async () => subscriptions.current),
    subscribe: vi.fn(async options => {
      subscriptions.current = fakeSubscription('https://web.push.apple.com/new', options.applicationServerKey);
      return subscriptions.current;
    })
  };
  return { pushManager, subscriptions };
}
function fakeSubscription(endpoint, keyBytes) {
  return {
    endpoint, options: { applicationServerKey: keyBytes ? keyBytes.buffer : null },
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn(async () => true)
  };
}
function setup({ permission = 'default', existing = null, connected = true, supported = true, apple = false, standalone = false } = {}) {
  const notifications = { permission, requestPermission: vi.fn(async () => { notifications.permission = 'granted'; return 'granted'; }) };
  const reminders = { connect: vi.fn(async () => {}), post: vi.fn(async () => ({ ok: true })), isConnected: () => connected };
  const registration = fakeRegistration(existing);
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ key: KEY }) }));
  const statuses = [];
  const store = storage();
  const client = createPushClient({
    reminders, storage: store, fetcher, notifications, pushSupported: () => supported, isApple: () => apple,
    isStandalone: () => standalone, getRegistration: async () => registration, onStatus: s => statuses.push(s)
  });
  return { client, notifications, reminders, registration, fetcher, statuses, store };
}

describe('푸시 구독 클라이언트', () => {
  it('코드와 함께 켜면 권한 요청, 서버 키 조회, 구독, 연결을 한 번에 한다', async () => {
    const t = setup({ connected: false });
    expect(t.client.getStatus()).toBe('off');
    await t.client.enable('a'.repeat(43));
    expect(t.notifications.requestPermission).toHaveBeenCalled();
    expect(t.fetcher.mock.calls[0][0]).toMatch(/\/push\/key$/);
    const options = t.registration.pushManager.subscribe.mock.calls[0][0];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey.length).toBe(65);
    expect(options.applicationServerKey[0]).toBe(4);
    expect(t.reminders.connect).toHaveBeenCalledWith('a'.repeat(43), { endpoint: 'https://web.push.apple.com/new', keys: { p256dh: 'p', auth: 'a' } });
    expect(t.reminders.post).not.toHaveBeenCalled();
    expect(t.store.getItem('h2-routine-push-endpoint')).toBe('https://web.push.apple.com/new');
    expect(t.statuses).toEqual(['working', 'enabled']);
  });

  it('이미 연결된 기기는 구독만 서버에 등록하고 끄면 해제한다', async () => {
    const t = setup({ permission: 'granted' });
    await t.client.enable(null);
    expect(t.notifications.requestPermission).not.toHaveBeenCalled();
    expect(t.reminders.post).toHaveBeenCalledWith('/push/subscribe', { subscription: { endpoint: 'https://web.push.apple.com/new', keys: { p256dh: 'p', auth: 'a' } } });
    expect(t.client.getStatus()).toBe('enabled');
    const subscription = t.registration.subscriptions.current;
    await t.client.disable();
    expect(t.reminders.post).toHaveBeenLastCalledWith('/push/unsubscribe', { endpoint: 'https://web.push.apple.com/new' });
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(t.client.getStatus()).toBe('off');
  });

  it('권한을 거부하면 구독하지 않고 denied 상태다', async () => {
    const t = setup();
    t.notifications.requestPermission = vi.fn(async () => { t.notifications.permission = 'denied'; return 'denied'; });
    await expect(t.client.enable(null)).rejects.toThrow(/권한/);
    expect(t.registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(t.client.getStatus()).toBe('denied');
  });

  it('iOS Safari 탭은 홈 화면 앱 안내, 그 밖의 미지원은 unsupported', async () => {
    const tab = setup({ supported: false, apple: true, standalone: false });
    expect(tab.client.getStatus()).toBe('not-standalone');
    await expect(tab.client.enable(null)).rejects.toThrow(/홈 화면/);
    expect(setup({ supported: false, apple: false }).client.getStatus()).toBe('unsupported');
    expect(setup({ supported: true, apple: true, standalone: true }).client.getStatus()).toBe('off');
  });

  it('서버 키가 바뀐 옛 구독은 풀고 새로 구독한다', async () => {
    const stale = fakeSubscription('https://web.push.apple.com/old', new Uint8Array([4, 1, 2, 3]));
    const t = setup({ permission: 'granted', existing: stale });
    await t.client.enable(null);
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(t.registration.pushManager.subscribe).toHaveBeenCalled();
    expect(t.store.getItem('h2-routine-push-endpoint')).toBe('https://web.push.apple.com/new');
  });

  it('resync 는 바뀐 구독을 다시 등록하고 사라진 구독은 켜짐 표시를 지운다', async () => {
    const t = setup({ permission: 'granted', existing: fakeSubscription('https://web.push.apple.com/rotated') });
    t.store.setItem('h2-routine-push-endpoint', 'https://web.push.apple.com/old');
    await t.client.resync();
    expect(t.reminders.post).toHaveBeenCalledWith('/push/subscribe', { subscription: { endpoint: 'https://web.push.apple.com/rotated', keys: { p256dh: 'p', auth: 'a' } } });
    expect(t.store.getItem('h2-routine-push-endpoint')).toBe('https://web.push.apple.com/rotated');
    const gone = setup({ permission: 'granted' });
    gone.store.setItem('h2-routine-push-endpoint', 'https://web.push.apple.com/old');
    await gone.client.resync();
    expect(gone.reminders.post).not.toHaveBeenCalled();
    expect(gone.client.getStatus()).toBe('off');
    const unlinked = setup({ permission: 'granted', connected: false, existing: fakeSubscription('https://web.push.apple.com/x') });
    await unlinked.client.resync();
    expect(unlinked.reminders.post).not.toHaveBeenCalled();
  });

  it('상태 문구에 가운뎃점과 괄호 병기가 없다', () => {
    for (const status of ['not-standalone', 'unsupported', 'denied', 'working', 'enabled', 'off']) {
      for (const connected of [true, false]) {
        const text = pushStatusText(status, connected);
        expect(text).not.toContain('·');
        expect(text).not.toMatch(/[가-힣]\s?\([A-Za-z]/);
      }
    }
  });
});
