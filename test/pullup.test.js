import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HABITS, goalsOf, statusOf, completion, streak, monthFullRate, habitMonthStats, calMonth } from '../src/logic.js';
import { validateState, importText, freshState } from '../src/storage.js';

/* 턱걸이(t, 2026-10-19 추가)는 state.pullupStart부터만 판정 — 투자 원칙과 같은 활성일 규칙.
   활성일 전 기록은 세 습관 기준 그대로여서 스트릭, 정상률, 장부가 소급해 깨지지 않는다. */
const START = '2026-10-19';
const FULL3 = { p: 100, s: 100, r: 20, w: null };
const MIN3 = { p: 30, s: 30, r: 5, w: null };
function st(days, extra) { return { startDate: '2026-10-01', pullupStart: START, days: days || {}, ...(extra || {}) }; }

describe('HABITS — 턱걸이 정의', () => {
  it('푸쉬업, 스쿼트, 턱걸이, 독서 순서, 20회/최소 5회', () => {
    expect(HABITS.map(h => h.key)).toEqual(['p', 's', 't', 'r']);
    expect(HABITS[2]).toMatchObject({ name: '턱걸이', unit: '회', target: 20, min: 5, steps: [5, 10, 20], startKey: 'pullupStart' });
  });
});

describe('goalsOf — 활성일 필터', () => {
  it('pullupStart 없는 옛 상태는 세 습관뿐', () => {
    expect(goalsOf({ startDate: '2026-07-01', days: {} }).map(g => g.key)).toEqual(['p', 's', 'r']);
    expect(goalsOf({ startDate: '2026-07-01', days: {} }, '2026-12-31').map(g => g.key)).toEqual(['p', 's', 'r']);
  });
  it('날짜 없이(설정 화면) 부르면 활성화된 습관 전부', () => {
    expect(goalsOf(st()).map(g => g.key)).toEqual(['p', 's', 't', 'r']);
    expect(goalsOf(st())[2]).toMatchObject({ target: 20, min: 5, since: START });
  });
  it('활성일 전날은 제외, 활성일부터 포함', () => {
    expect(goalsOf(st(), '2026-10-18').map(g => g.key)).toEqual(['p', 's', 'r']);
    expect(goalsOf(st(), START).map(g => g.key)).toEqual(['p', 's', 't', 'r']);
  });
  it('settings.t 오버라이드 적용', () => {
    const g = goalsOf(st({}, { settings: { t: { target: 10, min: 3 } } }), START);
    expect(g[2]).toMatchObject({ key: 't', target: 10, min: 3 });
  });
});

describe('statusOf, completion — 활성일 전후', () => {
  it('활성일 전날: t 없는 정상 기록은 그대로 정상', () => {
    expect(statusOf(st({ '2026-10-18': FULL3 }), '2026-10-18')).toBe('full');
    expect(completion(st({ '2026-10-18': FULL3 }), '2026-10-18')).toBe(1);
  });
  it('활성일부터: 턱걸이 0이면 미달, 5면 최소, 20이면 정상', () => {
    expect(statusOf(st({ [START]: FULL3 }), START)).toBe('miss');
    expect(statusOf(st({ [START]: { ...FULL3, t: 5 } }), START)).toBe('min');
    expect(statusOf(st({ [START]: { ...FULL3, t: 20 } }), START)).toBe('full');
    expect(statusOf(st({ [START]: { ...MIN3, t: 4 } }), START)).toBe('miss');
  });
  it('활성일부터 달성률은 네 습관 평균', () => {
    expect(completion(st({ [START]: { ...FULL3, t: 10 } }), START)).toBeCloseTo(0.875);
    expect(completion(st({ [START]: FULL3 }), START)).toBeCloseTo(0.75);
  });
});

describe('스트릭, 정상률, 캘린더 — 소급 없음', () => {
  const days = { '2026-10-16': FULL3, '2026-10-17': MIN3, '2026-10-18': FULL3, [START]: { ...FULL3, t: 20 } };
  it('활성일 전 연속일이 끊기지 않는다', () => {
    expect(streak(st(days), START)).toBe(4);
    expect(streak(st({ ...days, [START]: FULL3 }), START)).toBe(3); // 오늘 턱걸이 전 = 진행중, 어제까지 3
  });
  it('이달 정상률은 어제까지 세 습관 기준', () => {
    expect(monthFullRate(st({ '2026-10-17': FULL3, '2026-10-18': FULL3 }, { startDate: '2026-10-17' }), START)).toBe(100);
  });
  it('히트맵도 활성일 전날은 세 습관 기준', () => {
    const cal = calMonth(st(days), '2026-10', START);
    const kinds = Object.fromEntries(cal.cells.map(c => [c.ds, c.kind]));
    expect(kinds['2026-10-17']).toBe('min');
    expect(kinds['2026-10-18']).toBe('full');
    expect(kinds[START]).toBe('full');
  });
});

describe('habitMonthStats — 턱걸이 행은 활성일부터만 센다', () => {
  it('활성일을 걸친 달: 옛 습관은 전체 일수, 턱걸이는 자기 표본 일수로 비율', () => {
    const s = st({
      '2026-10-17': FULL3, '2026-10-18': MIN3,
      [START]: { ...FULL3, t: 20 }, '2026-10-20': { ...FULL3, t: 5 }
    }, { startDate: '2026-10-17' });
    const stats = habitMonthStats(s, '2026-10', '2026-10-21');
    expect(stats.total).toBe(4);
    const [p, , t, r] = stats.habits;
    expect(p).toMatchObject({ days: 4, full: 3, min: 1, miss: 0, fullRate: 75, minRate: 100 });
    expect(t).toMatchObject({ key: 't', name: '턱걸이', days: 2, full: 1, min: 1, miss: 0, sum: 25, fullRate: 50, minRate: 100 });
    expect(r).toMatchObject({ days: 4, fullRate: 75 });
  });
  it('활성일 전 달: 턱걸이 행은 표본 0, 비율 null (옛 습관은 영향 없음)', () => {
    const s = st({ '2026-09-29': FULL3, '2026-09-30': FULL3 }, { startDate: '2026-09-29' });
    const stats = habitMonthStats(s, '2026-09', '2026-10-21');
    expect(stats.total).toBe(2);
    expect(stats.habits[0]).toMatchObject({ days: 2, full: 2, fullRate: 100 });
    expect(stats.habits[2]).toMatchObject({ key: 't', days: 0, full: 0, min: 0, miss: 0, sum: 0, fullRate: null, minRate: null });
  });
});

describe('저장 스키마 — pullupStart, t, settings.t', () => {
  it('freshState에 pullupStart', () => {
    expect(freshState('2026-10-19')).toEqual({
      startDate: '2026-10-19', investmentReviewStart: '2026-10-19', rrSnapshotStart: '2026-10-19',
      pullupStart: '2026-10-19', squatEnd: '2026-10-19', days: {}
    });
  });
  it('옛 백업 가져오기: pullupStart를 오늘로 채우고 기록은 그대로', () => {
    const old = { startDate: '2026-06-29', investmentReviewStart: '2026-08-19', days: { '2026-06-29': FULL3 } };
    const s = importText(JSON.stringify(old), START);
    expect(s.pullupStart).toBe(START);
    expect(s.squatEnd).toBe(START);
    expect(s.investmentReviewStart).toBe('2026-08-19');
    expect(s.days).toEqual(old.days);
    expect(statusOf(s, '2026-06-29')).toBe('full');
  });
  it('t는 0 이상 숫자, pullupStart는 날짜 형식', () => {
    const base = { startDate: '2026-06-29', days: {} };
    expect(validateState({ ...base, pullupStart: START, days: { [START]: { ...FULL3, t: 20 } } })).toBe(null);
    expect(validateState({ ...base, days: { [START]: { ...FULL3, t: -1 } } })).not.toBe(null);
    expect(validateState({ ...base, days: { [START]: { ...FULL3, t: '20' } } })).not.toBe(null);
    expect(validateState({ ...base, pullupStart: '2026/10/19' })).not.toBe(null);
  });
  it('settings.t 통과 + 라운드트립, 모르는 키는 거부', () => {
    const s = { startDate: '2026-06-29', pullupStart: START, days: {}, settings: { t: { target: 10, min: 3 } } };
    expect(validateState(s)).toBe(null);
    expect(importText(JSON.stringify(s), START).settings).toEqual({ t: { target: 10, min: 3 } });
    expect(validateState({ ...s, settings: { u: { target: 1, min: 1 } } })).not.toBe(null);
  });
});
