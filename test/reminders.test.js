import { describe, it, expect, vi } from 'vitest';
import { createReminderClient } from '../src/reminders.js';

function storage() {
  const values = new Map([['h2-routine-reminder-auth', 'test-device']]);
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}
const ok = () => ({ ok: true, json: async () => ({ ok: true }) });

describe('알림 응답 동기화', () => {
  it('날짜와 응답 여부만 보내고 오프라인 실패는 다음 실행에서 재시도한다', async () => {
    const store = storage();
    const offline = createReminderClient({ storage: store, fetcher: vi.fn().mockRejectedValue(new Error('offline')) });
    await offline.enqueue('2026-09-17', true);
    expect(offline.getStatus()).toBe('offline');
    const fetcher = vi.fn().mockResolvedValue(ok());
    const online = createReminderClient({ storage: store, fetcher });
    await online.flush();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ day: '2026-09-17', answered: true });
    expect(store.getItem('h2-routine-reminder-queue')).toBe('{}');
    expect(online.getStatus()).toBe('synced');
  });

  it('전송 도중 선택을 취소하면 마지막 미응답까지 서버에 전달한다', async () => {
    let release;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockResolvedValue(ok());
    const client = createReminderClient({ storage: storage(), fetcher });
    const sending = client.enqueue('2026-09-17', true);
    await client.enqueue('2026-09-17', false);
    release(ok());
    await sending;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).answered).toBe(false);
  });

  it('만료된 과거 큐 때문에 오늘 응답이 막히지 않는다', async () => {
    const store = storage();
    store.setItem('h2-routine-reminder-queue', JSON.stringify({ '2026-08-01': false }));
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 422 }).mockResolvedValue(ok());
    const client = createReminderClient({ storage: store, fetcher });
    await client.enqueue('2026-09-17', true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.getStatus()).toBe('synced');
  });

  it('연결 전에는 외부 요청을 보내지 않는다', async () => {
    const store = storage();
    store.setItem('h2-routine-reminder-auth', '');
    const fetcher = vi.fn();
    const client = createReminderClient({ storage: store, fetcher });
    await client.enqueue('2026-09-17', true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe('unlinked');
  });

  it('연결 링크를 교환하고 인증정보를 루틴 백업 키와 분리한다', async () => {
    const store = storage();
    const code = 'a'.repeat(43);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'paired-device' }) });
    const client = createReminderClient({ storage: store, fetcher });
    await client.connect('https://woogeun1221-svg.github.io/h2-routine/#reminder=' + code);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ code });
    expect(store.getItem('h2-routine-reminder-auth')).toBe('paired-device');
    expect(store.getItem('h2-routine-v1')).toBeNull();
  });
});
