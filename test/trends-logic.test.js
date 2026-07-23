import { describe, it, expect } from 'vitest';
import {
  streak, longestStreak, shiftMonth, daysInMonth, monthList, calMonth, habitMonthStats
} from '../src/logic.js';

function st(startDate, days) { return { startDate, days: days || {} }; }
const FULL = { p: 100, s: 100, r: 20, w: null };
const MIN = { p: 30, s: 30, r: 5, w: null };
const ZERO = { p: 0, s: 0, r: 0, w: null };

describe('longestStreak', () => {
  it('미달로 끊긴 구간 중 최장을 찾는다 (미기록도 미달)', () => {
    // 07-01~03 (3일), 07-04 공백, 07-05~08 (4일), 오늘 07-10 미기록
    const s = st('2026-07-01', {
      '2026-07-01': MIN, '2026-07-02': MIN, '2026-07-03': MIN,
      '2026-07-05': MIN, '2026-07-06': FULL, '2026-07-07': MIN, '2026-07-08': MIN
    });
    expect(longestStreak(s, '2026-07-10')).toBe(4);
  });
  it('오늘이 최소 이상이면 연장에 포함 (현재 스트릭과 동일 규칙)', () => {
    const s = st('2026-07-05', {
      '2026-07-05': MIN, '2026-07-06': MIN, '2026-07-07': MIN, '2026-07-08': MIN, '2026-07-09': MIN
    });
    expect(longestStreak(s, '2026-07-09')).toBe(5);
    expect(streak(s, '2026-07-09')).toBe(5);
  });
  it('항상 최장 ≥ 현재 스트릭', () => {
    const s = st('2026-07-01', {
      '2026-07-02': MIN, '2026-07-03': MIN, '2026-07-04': MIN, // 최장 3
      '2026-07-08': MIN, '2026-07-09': MIN                      // 현재 2 (+오늘 미기록)
    });
    const cur = streak(s, '2026-07-10'), max = longestStreak(s, '2026-07-10');
    expect(cur).toBe(2);
    expect(max).toBe(3);
    expect(max).toBeGreaterThanOrEqual(cur);
  });
  it('시작 첫날: 기록 없으면 0, 최소 이상이면 1', () => {
    expect(longestStreak(st('2026-07-22'), '2026-07-22')).toBe(0);
    expect(longestStreak(st('2026-07-22', { '2026-07-22': MIN }), '2026-07-22')).toBe(1);
  });
});

describe('shiftMonth / daysInMonth / monthList', () => {
  it('연 경계를 넘는 월 이동', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-07', 0)).toBe('2026-07');
  });
  it('월별 일수 (윤년 포함)', () => {
    expect(daysInMonth('2026-07')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
  });
  it('monthList — 시작 월부터 이번 달까지, 연 롤오버', () => {
    expect(monthList(st('2026-11-15'), '2027-02-03')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthList(st('2026-07-01'), '2026-07-22')).toEqual(['2026-07']);
  });
});

describe('calMonth — 히트맵 셀 분류', () => {
  it('시작 전=out, 확정=상태, 오늘 미기록=pending, 이후=future', () => {
    const s = st('2026-07-20', { '2026-07-20': FULL, '2026-07-21': ZERO });
    const cal = calMonth(s, '2026-07', '2026-07-22');
    expect(cal.lead).toBe(3); // 2026-07-01 = 수요일
    expect(cal.cells.length).toBe(31);
    expect(cal.cells[18].kind).toBe('out');     // 19일: 시작 전
    expect(cal.cells[19].kind).toBe('full');    // 20일
    expect(cal.cells[20].kind).toBe('miss');    // 21일: 0 기록
    expect(cal.cells[21].kind).toBe('pending'); // 22일(오늘): 미기록 = 진행중
    expect(cal.cells[22].kind).toBe('future');  // 23일
  });
  it('오늘 일부라도 기록하면 현재 상태로 표시 (v1 스트립 규칙)', () => {
    const s = st('2026-07-01', { '2026-07-22': MIN });
    const cal = calMonth(s, '2026-07', '2026-07-22');
    expect(cal.cells[21].kind).toBe('min');
    const sx = st('2026-07-01', { '2026-07-22': { ...ZERO, w: 'x' } });
    expect(calMonth(sx, '2026-07', '2026-07-22').cells[21].kind).toBe('miss');
  });
  it('시작 월 이전 달은 전부 out', () => {
    const cal = calMonth(st('2026-07-10'), '2026-06', '2026-07-22');
    expect(cal.cells.every(c => c.kind === 'out')).toBe(true);
  });
});

describe('habitMonthStats — 어제까지 확정분, 습관별 자기 목표 기준', () => {
  it('습관별 정상/최소/미달·누적·정상률', () => {
    const s = st('2026-07-20', {
      '2026-07-20': { p: 100, s: 30, r: 0, w: 'o' },
      '2026-07-21': { p: 30, s: 100, r: 20, w: 'x' },
      '2026-07-22': { p: 0, s: 0, r: 5, w: null }
    });
    const stats = habitMonthStats(s, '2026-07', '2026-07-23');
    expect(stats.total).toBe(3);
    const [p, sq, r] = stats.habits;
    expect(p).toMatchObject({ full: 1, min: 1, miss: 1, sum: 130, fullRate: 33, minRate: 67 });
    expect(sq).toMatchObject({ full: 1, min: 1, miss: 1, sum: 130 });
    expect(r).toMatchObject({ full: 1, min: 1, miss: 1, sum: 25 });
    expect(stats.w).toEqual({ o: 1, x: 1, na: 1 });
  });
  it('오늘은 제외 (진행중) — 오늘 기록이 있어도 확정 통계엔 안 들어감', () => {
    const s = st('2026-07-21', { '2026-07-21': FULL, '2026-07-22': FULL });
    const stats = habitMonthStats(s, '2026-07', '2026-07-22');
    expect(stats.total).toBe(1);
    expect(stats.habits[0].full).toBe(1);
  });
  it('표본 없으면 total 0, 비율 null', () => {
    const stats = habitMonthStats(st('2026-07-22'), '2026-07', '2026-07-22');
    expect(stats.total).toBe(0);
    expect(stats.habits[0].fullRate).toBe(null);
  });
  it('월 경계: 지난달 통계는 지난달 일수만', () => {
    const s = st('2026-06-29', { '2026-06-29': FULL, '2026-06-30': MIN, '2026-07-01': FULL });
    const jun = habitMonthStats(s, '2026-06', '2026-07-22');
    expect(jun.total).toBe(2);
    expect(jun.habits[0]).toMatchObject({ full: 1, min: 1, fullRate: 50 });
  });
});
