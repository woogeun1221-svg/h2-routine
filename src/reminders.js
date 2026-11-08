/* 알림 보고(/answer)에는 날짜, 만족도 응답 여부, 오늘 루틴이 최소 포지션 이상인지(routine)만 보낸다.
   메인컨트롤 봇 동기화(/state, 2026-11-08)는 botsync.js 가 만든 요약(포지션, 남은 항목, 슬롯 계획)을 보낸다.
   O/X 값, 이유, 메모, 운동 수치 원본은 어느 쪽으로도 보내지 않는다. 푸시 구독은 push.js 가 이 클라이언트의 post 로 등록한다. */
export const REMINDER_API = 'https://macmini.taile484c7.ts.net/routine-api';
const AUTH_KEY = 'h2-routine-reminder-auth';
const QUEUE_KEY = 'h2-routine-reminder-queue';

/* 연결 링크(#reminder=코드) 또는 코드 자체 → 코드. 형식이 아니면 throw. */
export function parseConnectCode(input) {
  let code = String(input || '').trim();
  if (code.startsWith('https://')) {
    try { code = new URLSearchParams(new URL(code).hash.slice(1)).get('reminder') || ''; } catch (_) { code = ''; }
  }
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(code)) throw new Error('봇이 보낸 연결 링크 또는 코드를 확인해주세요.');
  return code;
}

export function createReminderClient({ storage = localStorage, fetcher = fetch,
  endpoint = REMINDER_API, onStatus = () => {} } = {}) {
  let busy = false;
  let status = 'unlinked';
  let queue = {};
  try {
    const saved = JSON.parse(storage.getItem(QUEUE_KEY));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      // 예전 큐는 날짜 → boolean 이었다. 한 번만 객체로 바꾼다(flush 는 같은 객체인지로 처리 여부를 본다).
      for (const day of Object.keys(saved)) {
        queue[day] = typeof saved[day] === 'object' && saved[day] ? saved[day] : { answered: Boolean(saved[day]) };
      }
    }
  } catch (_) { /* 루틴 기록과 별개인 재시도 큐 */ }

  function token() { try { return storage.getItem(AUTH_KEY); } catch (_) { return null; } }
  function report(value) { status = value; onStatus(value); }
  function persistQueue() { storage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
  async function request(path, body, credential) {
    const response = await fetcher(endpoint + path, {
      method: 'POST', credentials: 'omit', cache: 'no-store', keepalive: true,
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
        const entry = queue[day];
        const body = { day, answered: Boolean(entry.answered) };
        if (typeof entry.routine === 'boolean') body.routine = entry.routine;
        try {
          await request('/answer', body, credential);
        } catch (error) {
          // 오래된 오프라인 기록은 오늘의 알림 연결을 막지 않는다.
          if (error.status !== 422) throw error;
        }
        if (queue[day] === entry) delete queue[day];
        persistQueue();
      }
      report('synced');
    } catch (error) {
      report(error.status === 401 ? 'invalid' : 'offline');
    } finally { busy = false; }
  }

  function enqueue(day, answered, routine) {
    const entry = { answered: Boolean(answered) };
    if (typeof routine === 'boolean') entry.routine = routine;
    queue[day] = entry;
    try { persistQueue(); } catch (_) { report('offline'); }
    return flush();
  }

  /* subscription(선택): 연결과 동시에 이 기기의 푸시 구독을 등록한다 */
  async function connect(input, subscription) {
    const code = parseConnectCode(input);
    report('pairing');
    try {
      const result = await request('/pair', subscription ? { code, subscription } : { code });
      if (typeof result.token !== 'string') throw new Error('연결 응답 오류');
      storage.setItem(AUTH_KEY, result.token);
      await flush();
    } catch (_) {
      report('unlinked');
      throw new Error('알림 연결에 실패했습니다. 연결 링크의 유효기간과 인터넷 연결을 확인해주세요.');
    }
  }

  /* 연결된 기기 인증으로 보내는 요청(푸시 구독 등록, 해제) */
  async function post(path, body) {
    const credential = token();
    if (!credential) throw new Error('먼저 이 기기를 연결해주세요.');
    try {
      return await request(path, body, credential);
    } catch (error) {
      if (error.status === 401) report('invalid');
      throw error;
    }
  }

  /* 메인컨트롤 봇과 시간표, 오늘 포지션 주고받기. 연결 전이면 null, 응답은 { ok, plans } */
  async function syncState(body) {
    const credential = token();
    if (!credential) return null;
    try {
      return await request('/state', body, credential);
    } catch (error) {
      if (error.status === 401) report('invalid');
      throw error;
    }
  }

  return { connect, enqueue, flush, post, syncState, getStatus: () => status, isConnected: () => Boolean(token()) };
}

export function reminderStatusText(status, answered) {
  if (status === 'pairing') return '메인컨트롤 봇에 연결 중…';
  if (status === 'unlinked') return '알림 미연결, 설정에서 연결';
  if (status === 'invalid') return '알림 연결을 다시 확인해주세요, 설정';
  if (status === 'syncing') return '알림 서버에 응답 여부 전달 중…';
  if (status === 'offline') return '기록은 이 기기에 저장됨, 알림 서버 연결 대기';
  return answered ? '오늘 응답 전달됨, 재촉하지 않습니다' : '미응답이면 밤 11시에 재촉합니다';
}
