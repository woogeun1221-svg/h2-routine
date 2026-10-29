import { describe, it, expect } from 'vitest';
import {
  WEEKLIES, INVESTMENT_REVIEW, RR_SNAPSHOT, weeklyStatus, investmentReviewStatus, statusOf, completion, calMonth, habitMonthStats
} from '../src/logic.js';
import { validateState, importText, freshState } from '../src/storage.js';

/* 손익비 스냅샷(rr, 2026-10-29 추가)은 투자 원칙과 같은 주간 규칙(월요일 시작, 아무 날 완료, 금요일 마감)을 따르되
   완전히 독립이다 — 자기 활성일(rrSnapshotStart)부터 판정하고, 한쪽 완료가 다른 쪽에 영향을 주지 않는다. */
const FULL = { p: 100, t: 20, r: 20, w: null };
const WEEK = { monday: '2026-11-02', thursday: '2026-11-05', friday: '2026-11-06', sunday: '2026-11-08' };
function st(days, extra) {
  return { startDate: '2026-10-01', pullupStart: '2026-10-19', squatEnd: '2026-10-29',
    investmentReviewStart: '2026-10-29', rrSnapshotStart: '2026-10-29', days: days || {}, ...(extra || {}) };
}

describe('WEEKLIES 정의', () => {
  it('투자 원칙 다음에 손익비 스냅샷, 키 rr, 활성일 rrSnapshotStart, 대시보드 링크는 /rr/ 슬래시 포함', () => {
    expect(WEEKLIES.map(w => w.key)).toEqual(['i', 'rr']);
    expect(RR_SNAPSHOT).toMatchObject({ key: 'rr', name: '손익비 스냅샷', startKey: 'rrSnapshotStart', action: '스냅샷 완료', statName: '손익비 스냅샷(주)' });
    expect(RR_SNAPSHOT.link.endsWith('/rr/')).toBe(true);
    expect(INVESTMENT_REVIEW.startKey).toBe('investmentReviewStart');
  });
});

describe('weeklyStatus — 독립 판정', () => {
  it('활성일 없으면 inactive, 투자 원칙은 영향 없음', () => {
    const s = st({}, { rrSnapshotStart: undefined });
    expect(weeklyStatus(s, WEEK.thursday, RR_SNAPSHOT).active).toBe(false);
    expect(investmentReviewStatus(s, WEEK.thursday).active).toBe(true);
  });
  it('rr=true 가 있는 날이 완료일, i=true 는 세지 않는다', () => {
    const s = st({ [WEEK.monday]: { ...FULL, i: true }, '2026-11-04': { ...FULL, rr: true } });
    expect(weeklyStatus(s, WEEK.friday, RR_SNAPSHOT)).toMatchObject({ active: true, done: true, phase: 'done', reviewedOn: '2026-11-04' });
    expect(weeklyStatus(s, WEEK.friday, INVESTMENT_REVIEW)).toMatchObject({ done: true, reviewedOn: WEEK.monday });
    const only = st({ [WEEK.monday]: { ...FULL, i: true } });
    expect(weeklyStatus(only, WEEK.friday, RR_SNAPSHOT)).toMatchObject({ done: false, phase: 'deadline' });
  });
});

describe('statusOf, completion — 금요일에 두 주간 항목이 각각 걸린다', () => {
  it('투자 원칙만 완료하면 금요일은 여전히 미달', () => {
    const s = st({ [WEEK.friday]: { ...FULL, i: true } });
    expect(statusOf(s, WEEK.friday)).toBe('miss');
    expect(statusOf(st({ [WEEK.friday]: { ...FULL, i: true, rr: true } }), WEEK.friday)).toBe('full');
    expect(statusOf(st({ [WEEK.friday]: { ...FULL, rr: true } }), WEEK.friday)).toBe('miss');
  });
  it('금요일 달성률 분모에 주간 2개가 더해진다', () => {
    expect(completion(st({ [WEEK.friday]: { ...FULL, i: true } }), WEEK.friday)).toBeCloseTo(4 / 5);
    expect(completion(st({ [WEEK.friday]: { ...FULL, i: true, rr: true } }), WEEK.friday)).toBe(1);
    expect(completion(st({ [WEEK.thursday]: FULL }), WEEK.thursday)).toBe(1); // 목요일은 일간만
  });
  it('활성일 전 금요일은 영향 없음(소급 없음)', () => {
    const s = st({ '2026-10-23': { p: 100, s: 100, t: 20, r: 20, i: true, w: null } });
    expect(statusOf(s, '2026-10-23')).toBe('full');
  });
  it('오늘 rr만 눌러도 히트맵은 pending이 아니라 확정 상태로 본다', () => {
    const s = st({ [WEEK.thursday]: { rr: true } });
    const kinds = Object.fromEntries(calMonth(s, '2026-11', WEEK.thursday).cells.map(c => [c.ds, c.kind]));
    expect(kinds[WEEK.thursday]).toBe('miss');
  });
});

describe('habitMonthStats.weeklies', () => {
  it('두 행이 투자 원칙, 손익비 순이고 각자 집계', () => {
    const s = st({ '2026-11-04': { ...FULL, i: true }, '2026-11-07': { ...FULL, rr: true } });
    const stats = habitMonthStats(s, '2026-11', '2026-11-10');
    expect(stats.weeklies.map(r => r.name)).toEqual(['투자 원칙(주)', '손익비 스냅샷(주)']);
    expect(stats.weeklies[0]).toMatchObject({ full: 1, min: 0, miss: 0 });
    expect(stats.weeklies[1]).toMatchObject({ full: 0, min: 1, miss: 0 }); // 토요일 완료 = 최소
    expect(stats.investment).toEqual(stats.weeklies[0]);
  });
  it('활성일 없는 항목은 행이 없다', () => {
    const stats = habitMonthStats(st({}, { rrSnapshotStart: undefined }), '2026-11', '2026-11-10');
    expect(stats.weeklies.map(r => r.key)).toEqual(['i']);
  });
});

describe('저장 스키마 — rrSnapshotStart, rr', () => {
  it('freshState와 옛 백업 가져오기에 rrSnapshotStart를 오늘로 채운다', () => {
    expect(freshState('2026-10-29').rrSnapshotStart).toBe('2026-10-29');
    const s = importText(JSON.stringify({ startDate: '2026-06-29', investmentReviewStart: '2026-08-19', days: {} }), '2026-10-29');
    expect(s.rrSnapshotStart).toBe('2026-10-29');
    expect(s.investmentReviewStart).toBe('2026-08-19');
  });
  it('rr은 boolean만, rrSnapshotStart는 날짜 형식', () => {
    const base = { startDate: '2026-06-29', days: {} };
    expect(validateState({ ...base, rrSnapshotStart: '2026-10-29', days: { '2026-10-30': { rr: true } } })).toBe(null);
    expect(validateState({ ...base, days: { '2026-10-30': { rr: 'yes' } } })).not.toBe(null);
    expect(validateState({ ...base, rrSnapshotStart: '20261029' })).not.toBe(null);
  });
});
