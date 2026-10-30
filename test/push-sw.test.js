import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* public/push-sw.js 를 가짜 self 에 올리고 push, notificationclick 핸들러를 직접 호출한다 */
function loadWorker({ windows = [], badge = true } = {}) {
  const listeners = {};
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: { scope: 'https://woogeun1221-svg.github.io/h2-routine/', showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow: vi.fn().mockResolvedValue(null) },
    navigator: badge ? { setAppBadge: vi.fn().mockResolvedValue(undefined) } : {}
  };
  vm.runInNewContext(readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8'), { self, Promise });
  return { self, listeners };
}

async function dispatch(listeners, type, event) {
  const pending = [];
  listeners[type]({ ...event, waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
}

describe('push-sw.js', () => {
  it('push 페이로드로 알림을 띄우고 앱 배지를 켠다', async () => {
    const { self, listeners } = loadWorker();
    await dispatch(listeners, 'push', { data: { json: () => ({ title: '하루 만족도', body: '아직 O/X 를 안 골랐다.', tag: 'h2-reflection', url: 'https://woogeun1221-svg.github.io/h2-routine/' }) } });
    expect(self.registration.showNotification).toHaveBeenCalledWith('하루 만족도', expect.objectContaining({
      body: '아직 O/X 를 안 골랐다.', tag: 'h2-reflection', icon: 'https://woogeun1221-svg.github.io/h2-routine/icons/icon-192.png',
      data: { url: 'https://woogeun1221-svg.github.io/h2-routine/' }
    }));
    expect(self.navigator.setAppBadge).toHaveBeenCalledWith(1);
  });

  it('JSON 이 아니거나 비어 있어도 항상 알림을 띄운다', async () => {
    const { self, listeners } = loadWorker({ badge: false });
    await dispatch(listeners, 'push', { data: { json: () => { throw new SyntaxError('bad'); }, text: () => '텍스트 푸시' } });
    expect(self.registration.showNotification).toHaveBeenCalledWith('H2 루틴', expect.objectContaining({ body: '텍스트 푸시', tag: 'h2-routine' }));
    await dispatch(listeners, 'push', { data: null });
    expect(self.registration.showNotification).toHaveBeenLastCalledWith('H2 루틴', expect.objectContaining({ body: '' }));
  });

  it('알림을 누르면 열린 창을 앞으로, 없으면 앱 URL 을 새로 연다', async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const open = loadWorker({ windows: [{ focus }] });
    const close = vi.fn();
    await dispatch(open.listeners, 'notificationclick', { notification: { close, data: { url: 'https://woogeun1221-svg.github.io/h2-routine/' } } });
    expect(close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(open.self.clients.openWindow).not.toHaveBeenCalled();

    const closed = loadWorker();
    await dispatch(closed.listeners, 'notificationclick', { notification: { close: vi.fn(), data: null } });
    expect(closed.self.clients.openWindow).toHaveBeenCalledWith('https://woogeun1221-svg.github.io/h2-routine/');
  });
});
