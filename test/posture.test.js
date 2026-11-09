import { describe, it, expect } from 'vitest';
import { CHECKS, POSTURE, checksOf, checksMarked, statusOf, completion, streak, habitMonthStats, calMonth } from '../src/logic.js';
import { freshState, importText, exportText, validateState } from '../src/storage.js';

/* 가슴 펴기(c, 2026-11-03 추가)는 state.postureStart부터만 판정 — 턱걸이와 같은 활성일 규칙.
   O여야 그날 통과, X나 미응답은 미달(송은과 달리 해당없음이 없다). */
const START = '2026-11-03';
const FULL3 = { p: 100, t: 20, r: 20, w: null };   // 스쿼트 은퇴 후 세 습관 정상
const MIN3 = { p: 30, t: 5, r: 5, w: null };
function st(days, extra) {
  return { startDate: '2026-10-01', pullupStart: '2026-10-19', squatEnd: '2026-10-29', postureStart: START, days: days || {}, ...(extra || {}) };
}

describe('CHECKS — 가슴 펴기 정의', () => {
  it('키 c, 활성일 postureStart, 카드 문구', () => {
    expect(CHECKS).toEqual([POSTURE]);
    expect(POSTURE).toMatchObject({
      key: 'c', name: '가슴 펴기', sub: '당당히 펴고 있는가', startKey: 'postureStart', yes: 'O 폈다', no: 'X 움츠렸다', statName: '가슴 펴기'
    });
  });
  it('postureStart 없는 옛 상태엔 체크 항목이 없다', () => {
    const old = { startDate: '2026-10-01', days: {} };
    expect(checksOf(old)).toEqual([]);
    expect(checksOf(old, START)).toEqual([]);
  });
  it('활성일 전 날짜는 빠지고 활성일부터 들어간다', () => {
    expect(checksOf(st(), '2026-11-02')).toEqual([]);
    expect(checksOf(st(), START).map(c => c.key)).toEqual(['c']);
    expect(checksOf(st()).map(c => c.key)).toEqual(['c']);
  });
});

describe('statusOf — O여야 통과, X나 미응답은 미달, 활성일 전은 소급 없음', () => {
  it('활성일 전날: c 없이도 세 습관 기준 정상, 활성 전 X도 무시', () => {
    expect(statusOf(st({ '2026-11-02': FULL3 }), '2026-11-02')).toBe('full');
    expect(statusOf(st({ '2026-11-02': { ...FULL3, c: 'x' } }), '2026-11-02')).toBe('full');
  });
  it('활성일부터: 미응답이면 미달, X면 미달, O면 습관 기준대로', () => {
    expect(statusOf(st({ [START]: FULL3 }), START)).toBe('miss');
    expect(statusOf(st({ [START]: { ...FULL3, c: 'x' } }), START)).toBe('miss');
    expect(statusOf(st({ [START]: { ...FULL3, c: 'o' } }), START)).toBe('full');
    expect(statusOf(st({ [START]: { ...MIN3, c: 'o' } }), START)).toBe('min');
    expect(statusOf(st({ [START]: { ...MIN3, c: 'o', w: 'x' } }), START)).toBe('miss'); // 송은 X는 여전히 미달
    expect(statusOf(st({ [START]: { c: 'o' } }), START)).toBe('miss'); // O만 있고 습관이 비면 미달
  });
  it('스트릭: 활성일에 O가 없으면 오늘은 진행중, 다음날엔 미달 확정', () => {
    const days = { '2026-10-31': FULL3, '2026-11-01': FULL3, '2026-11-02': FULL3 };
    expect(streak(st({ ...days, [START]: FULL3 }), START)).toBe(3);
    expect(streak(st({ ...days, [START]: { ...FULL3, c: 'o' } }), START)).toBe(4);
    expect(streak(st({ ...days, [START]: FULL3 }), '2026-11-04')).toBe(0);
  });
});

describe('completion — 체크 항목은 0/1로 분모에 들어간다(활성일부터)', () => {
  it('활성일 전은 세 습관 평균, 활성일부터는 넷 평균', () => {
    expect(completion(st({ '2026-11-02': FULL3 }), '2026-11-02')).toBeCloseTo(1);
    expect(completion(st({ [START]: FULL3 }), START)).toBeCloseTo(0.75);
    expect(completion(st({ [START]: { ...FULL3, c: 'o' } }), START)).toBeCloseTo(1);
    expect(completion(st({ [START]: { c: 'o' } }), START)).toBeCloseTo(0.25);
  });
});

describe('기록 있음 판정 — O나 X만 눌러도 오늘은 진행중이 아니다', () => {
  it('checksMarked는 활성일부터 o/x만 본다', () => {
    expect(checksMarked(st({ [START]: { c: 'x' } }), START)).toBe(true);
    expect(checksMarked(st({ [START]: { c: 'o' } }), START)).toBe(true);
    expect(checksMarked(st({ [START]: FULL3 }), START)).toBe(false);
    expect(checksMarked(st({ '2026-11-02': { c: 'x' } }), '2026-11-02')).toBe(false);
  });
  it('calMonth: 오늘 X만 눌렀으면 pending이 아니라 miss', () => {
    const cells = calMonth(st({ [START]: { c: 'x' } }), '2026-11', START).cells;
    expect(cells[2]).toMatchObject({ ds: START, kind: 'miss' });
    const none = calMonth(st({}), '2026-11', START).cells;
    expect(none[2]).toMatchObject({ ds: START, kind: 'pending' });
  });
});

describe('habitMonthStats — 가슴 펴기 행은 활성일부터만, O 일수가 정상', () => {
  it('활성일을 걸친 달: 옛 습관은 전체 일수, 가슴 펴기는 자기 표본 일수', () => {
    const s = st({
      '2026-11-01': FULL3, '2026-11-02': FULL3, [START]: { ...FULL3, c: 'o' },
      '2026-11-04': { ...FULL3, c: 'x' }, '2026-11-05': FULL3
    });
    const stats = habitMonthStats(s, '2026-11', '2026-11-06');
    expect(stats.habits.map(h => h.key)).toEqual(['p', 't', 'r']); // 스쿼트는 종료 후라 행 없음
    expect(stats.habits[0]).toMatchObject({ days: 5, full: 5 });
    expect(stats.checks).toHaveLength(1);
    expect(stats.checks[0]).toMatchObject({
      key: 'c', name: '가슴 펴기', unit: '회', days: 3, full: 1, min: 0, miss: 2, sum: 1, fullRate: 33, minRate: 33
    });
  });
  it('활성일 전 달: 행은 있고 표본 0, 비율 null. 활성일이 없으면 행 자체가 없다', () => {
    const stats = habitMonthStats(st({ '2026-10-30': FULL3 }), '2026-10', '2026-11-06');
    expect(stats.checks[0]).toMatchObject({ key: 'c', days: 0, fullRate: null });
    const old = habitMonthStats({ startDate: '2026-10-01', days: { '2026-10-30': FULL3 } }, '2026-10', '2026-11-06');
    expect(old.checks).toEqual([]);
  });
});

describe('저장 스키마 — postureStart, c', () => {
  it('freshState에 postureStart', () => {
    expect(freshState(START).postureStart).toBe(START);
  });
  it('옛 백업 가져오기: postureStart를 오늘로 채우고 기록은 그대로, 옛 날짜 판정 불변', () => {
    const old = {
      startDate: '2026-06-29', investmentReviewStart: '2026-08-19', pullupStart: '2026-10-19', squatEnd: '2026-10-29',
      days: { '2026-11-02': FULL3 }
    };
    const s = importText(JSON.stringify(old), START);
    expect(s.postureStart).toBe(START);
    expect(s.days).toEqual(old.days);
    expect(statusOf(s, '2026-11-02')).toBe('full');
    expect(statusOf(s, START)).toBe('miss');
  });
  it('c는 o/x/null만, postureStart는 날짜 형식, 내보내기 왕복 보존', () => {
    const base = { startDate: '2026-06-29', days: {} };
    expect(validateState({ ...base, postureStart: START, days: { [START]: { ...FULL3, c: 'o' } } })).toBe(null);
    expect(validateState({ ...base, days: { [START]: { ...FULL3, c: null } } })).toBe(null);
    expect(validateState({ ...base, days: { [START]: { ...FULL3, c: true } } })).toContain('.c');
    expect(validateState({ ...base, days: { [START]: { ...FULL3, c: 'O' } } })).toContain('.c');
    expect(validateState({ ...base, postureStart: '2026/11/03' })).not.toBe(null);
    const s = st({ [START]: { ...FULL3, c: 'x' } }, { investmentReviewStart: START, rrSnapshotStart: START });
    expect(importText(exportText(s), START)).toEqual({ ...s, v: 2, exerciseSlotStart: START, rrSnapshotEnd: START }); // v2 필드만 덧붙는다
  });
});
