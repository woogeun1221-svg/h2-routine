import { describe, it, expect } from 'vitest';
import { HABITS, habitSpans, goalsOf, statusOf, completion, streak, monthFullRate, habitMonthStats, calMonth, monthlyRows } from '../src/logic.js';
import { validateState, importText, freshState } from '../src/storage.js';

/* 스쿼트(s)는 2026-10-29 은퇴 — state.squatEnd부터 판정에서 빠진다(턱걸이 활성일 규칙의 거울).
   종료일 전 기록은 네 습관(또는 세 습관) 기준 그대로라 스트릭, 정상률, 장부, 히트맵이 소급해 바뀌지 않는다.
   정의 자체는 HABITS에 남긴다 — 지우면 settings.s가 검증에서 거부돼 기록 전체가 fresh로 떨어진다. */
const END = '2026-10-29';
const FULL4 = { p: 100, s: 100, t: 20, r: 20, w: null };   // 은퇴 전(턱걸이 활성 후) 정상
const FULL3 = { p: 100, t: 20, r: 20, w: null };           // 은퇴 후 정상 (s 없음)
const MIN3 = { p: 30, t: 5, r: 5, w: null };
function st(days, extra) {
  return { startDate: '2026-10-01', pullupStart: '2026-10-19', squatEnd: END, days: days || {}, ...(extra || {}) };
}

describe('HABITS — 푸쉬업 단계와 스쿼트 종료 키', () => {
  it('푸쉬업은 +5 +10 +25, 스쿼트 정의는 남아 있고 endKey만 붙는다', () => {
    expect(HABITS.map(h => h.key)).toEqual(['p', 's', 't', 'r']);
    expect(HABITS[0].steps).toEqual([5, 10, 25]);
    expect(HABITS[1]).toMatchObject({ key: 's', name: '스쿼트', endKey: 'squatEnd', target: 100, min: 30 });
  });
});

describe('goalsOf — 종료일 필터', () => {
  it('squatEnd 없는 옛 상태(테스트 픽스처, 옛 백업)는 스쿼트 계속 활성', () => {
    expect(goalsOf({ startDate: '2026-07-01', days: {} }).map(g => g.key)).toEqual(['p', 's', 'r']);
    expect(goalsOf({ startDate: '2026-07-01', days: {} }, '2027-01-01').map(g => g.key)).toEqual(['p', 's', 'r']);
  });
  it('날짜 없이(설정 화면) 부르면 은퇴한 스쿼트는 빠진다', () => {
    expect(goalsOf(st()).map(g => g.key)).toEqual(['p', 't', 'r']);
  });
  it('종료일 전날은 포함, 종료일부터 제외', () => {
    expect(goalsOf(st(), '2026-10-28').map(g => g.key)).toEqual(['p', 's', 't', 'r']);
    expect(goalsOf(st(), END).map(g => g.key)).toEqual(['p', 't', 'r']);
    expect(goalsOf(st(), '2026-10-18').map(g => g.key)).toEqual(['p', 's', 'r']); // 턱걸이 전, 스쿼트 중
  });
  it('habitSpans는 은퇴 포함 전부, since/until 보고', () => {
    const spans = habitSpans(st());
    expect(spans.map(g => g.key)).toEqual(['p', 's', 't', 'r']);
    expect(spans[1]).toMatchObject({ until: END, since: null });
    expect(spans[2]).toMatchObject({ since: '2026-10-19', until: null });
  });
});

describe('statusOf, completion — 종료일 전후', () => {
  it('종료일 전날: 스쿼트 0이면 여전히 미달 (소급 구제 없음)', () => {
    expect(statusOf(st({ '2026-10-28': FULL3 }), '2026-10-28')).toBe('miss');
    expect(statusOf(st({ '2026-10-28': FULL4 }), '2026-10-28')).toBe('full');
    expect(completion(st({ '2026-10-28': FULL3 }), '2026-10-28')).toBeCloseTo(0.75);
  });
  it('종료일부터: 스쿼트 없이 세 습관으로 정상, 기록에 s가 남아 있어도 무시', () => {
    expect(statusOf(st({ [END]: FULL3 }), END)).toBe('full');
    expect(statusOf(st({ [END]: { ...FULL3, s: 0 } }), END)).toBe('full');
    expect(statusOf(st({ [END]: MIN3 }), END)).toBe('min');
    expect(completion(st({ [END]: { p: 50, t: 20, r: 20, s: 100 } }), END)).toBeCloseTo((0.5 + 1 + 1) / 3);
  });
});

describe('스트릭, 정상률, 장부, 캘린더 — 소급 없음', () => {
  const days = {
    '2026-10-26': FULL4, '2026-10-27': FULL3 /* 스쿼트 빠뜨림 = 미달 */, '2026-10-28': FULL4, [END]: FULL3
  };
  it('종료 전 미달일은 그대로 미달이라 스트릭이 거기서 끊긴다', () => {
    expect(streak(st(days), END)).toBe(2); // 28, 29
    const cal = calMonth(st(days), '2026-10', END);
    const kinds = Object.fromEntries(cal.cells.map(c => [c.ds, c.kind]));
    expect(kinds['2026-10-27']).toBe('miss');
    expect(kinds['2026-10-28']).toBe('full');
    expect(kinds[END]).toBe('full');
  });
  it('이달 정상률과 장부는 어제까지 그날 기준', () => {
    const s = st(days, { startDate: '2026-10-26' });
    expect(monthFullRate(s, END)).toBe(67); // 26 full, 27 miss, 28 full
    expect(monthlyRows(s, '2026-10-30')[0]).toMatchObject({ full: 3, miss: 1 });
  });
});

describe('habitMonthStats — 스쿼트 행은 종료일 전 표본만, 표본 없는 달은 행 제거', () => {
  it('종료일을 걸친 달: 스쿼트는 종료 전 일수로, 다른 습관은 전체 일수로', () => {
    const s = st({ '2026-10-27': FULL4, '2026-10-28': { ...FULL4, s: 30 }, [END]: FULL3, '2026-10-30': MIN3 },
      { startDate: '2026-10-27' });
    const stats = habitMonthStats(s, '2026-10', '2026-10-31');
    expect(stats.total).toBe(4);
    expect(stats.habits.map(h => h.key)).toEqual(['p', 's', 't', 'r']);
    expect(stats.habits[1]).toMatchObject({ days: 2, full: 1, min: 1, miss: 0, sum: 130, fullRate: 50, minRate: 100 });
    expect(stats.habits[0]).toMatchObject({ days: 4, full: 3, min: 1 });
  });
  it('종료 다음 달: 스쿼트 행 자체가 없다', () => {
    const s = st({ '2026-11-01': FULL3, '2026-11-02': MIN3 });
    const stats = habitMonthStats(s, '2026-11', '2026-11-03');
    expect(stats.habits.map(h => h.key)).toEqual(['p', 't', 'r']);
  });
  it('아직 활성일 전인 습관(턱걸이)은 기존처럼 0 행으로 남는다', () => {
    const s = st({ '2026-10-10': { p: 100, s: 100, r: 20, w: null } }, { startDate: '2026-10-10' });
    const stats = habitMonthStats(s, '2026-10', '2026-10-12');
    expect(stats.habits.map(h => h.key)).toEqual(['p', 's', 't', 'r']);
    expect(stats.habits[2]).toMatchObject({ days: 0, fullRate: null });
  });
});

describe('저장 스키마 — squatEnd', () => {
  it('freshState와 옛 백업 가져오기에 squatEnd를 오늘로 채운다', () => {
    expect(freshState(END).squatEnd).toBe(END);
    const old = { startDate: '2026-06-29', investmentReviewStart: '2026-08-19', pullupStart: '2026-10-19',
      days: { '2026-10-28': FULL4 }, settings: { s: { target: 80, min: 20 } } };
    const s = importText(JSON.stringify(old), END);
    expect(s.squatEnd).toBe(END);
    expect(s.settings).toEqual({ s: { target: 80, min: 20 } }); // 은퇴해도 settings.s는 거부되지 않는다
    expect(statusOf(s, '2026-10-28')).toBe('full');
  });
  it('이미 있는 squatEnd는 덮어쓰지 않고, 형식 오류는 거부', () => {
    const s = importText(JSON.stringify(st({})), '2026-12-01');
    expect(s.squatEnd).toBe(END);
    expect(validateState({ startDate: '2026-06-29', squatEnd: '2026/10/29', days: {} })).not.toBe(null);
    expect(validateState({ startDate: '2026-06-29', squatEnd: END, days: { [END]: { p: 1, s: 0 } } })).toBe(null);
  });
});
