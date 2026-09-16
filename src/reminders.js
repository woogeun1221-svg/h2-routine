/* 봇에는 날짜와 응답 여부만 전송한다. O/X 값·이유·다른 루틴 기록은 보내지 않는다. */
export const REMINDER_API = 'https://macmini.taile484c7.ts.net/routine-api';
const AUTH_KEY = 'h2-routine-reminder-auth';
const QUEUE_KEY = 'h2-routine-reminder-queue';

export function createReminderClient({ storage = localStorage, fetcher = fetch,
  endpoint = REMINDER_API, onStatus = () => {} } = {}) {
  let busy = false;
  let status = 'unlinked';
  let queue = {};
  try {
    const saved = JSON.parse(storage.getItem(QUEUE_KEY));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) queue = saved;
  } catch (_) { /* 루틴 기록과 별개인 재시도 큐 */ }

  function token() { try { return storage.getItem(AUTH_KEY); } catch (_) { return null; } }
  function report(value) { status = value; onStatus(value); }
  function persistQueue() { storage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
  async function request(path, body, credential) {
    const response = await fetcher(endpoint + path, {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: 'Bearer ' + credential } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const error = new Error('알림 서버 연결 실패');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function flush() {
    if (busy) return;
    const credential = token();
    if (!credential) { report('unlinked'); return; }
    busy = true;
    try {
      while (Object.keys(queue).length) {
        report('syncing');
        const day = Object.keys(queue).sort()[0];
        const answered = queue[day];
        try {
          await request('/answer', { day, answered }, credential);
        } catch (error) {
          // 오래된 오프라인 기록은 오늘의 알림 연결을 막지 않는다.
          if (error.status !== 422) throw error;
        }
        if (queue[day] === answered) delete queue[day];
        persistQueue();
      }
      report('synced');
    } catch (error) {
      report(error.status === 401 ? 'invalid' : 'offline');
    } finally { busy = false; }
  }

  function enqueue(day, answered) {
    queue[day] = Boolean(answered);
    try { persistQueue(); } catch (_) { report('offline'); }
    return flush();
  }

  async function connect(input) {
    let code = input.trim();
    if (code.startsWith('https://')) {
      code = new URLSearchParams(new URL(code).hash.slice(1)).get('reminder') || '';
    }
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(code)) throw new Error('봇이 보낸 연결 링크 또는 코드를 확인해주세요.');
    report('pairing');
    try {
      const result = await request('/pair', { code });
      if (typeof result.token !== 'string') throw new Error('연결 응답 오류');
      storage.setItem(AUTH_KEY, result.token);
      await flush();
    } catch (_) {
      report('unlinked');
      throw new Error('알림 연결에 실패했습니다. 연결 링크의 유효기간과 인터넷 연결을 확인해주세요.');
    }
  }

  return { connect, enqueue, flush, getStatus: () => status, isConnected: () => Boolean(token()) };
}

export function reminderStatusText(status, answered) {
  if (status === 'pairing') return '메인컨트롤 봇에 연결 중…';
  if (status === 'unlinked') return '밤 11시 알림 미연결 · 설정에서 연결';
  if (status === 'invalid') return '알림 연결을 다시 확인해주세요 · 설정';
  if (status === 'syncing') return '알림 서버에 응답 여부 전달 중…';
  if (status === 'offline') return '기록은 이 기기에 저장됨 · 알림 서버 연결 대기';
  return answered ? '오늘 응답 전달됨 · 재촉하지 않습니다' : '미응답이면 밤 11시 메인컨트롤 봇이 재촉합니다';
}
