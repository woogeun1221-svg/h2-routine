import { describe, it, expect } from 'vitest';
import { statusOf, completion, streak, monthFullRate, monthlyRows, shift, daysBetween } from '../src/logic.js';
import { validateState, importText } from '../src/storage.js';

function st(startDate, days) { return { startDate, days: days || {} }; }
const FULL = { p: 100, s: 100, r: 20, w: null };
const MIN = { p: 30, s: 30, r: 5, w: null };

describe('statusOf', () => {
  const T = '2026-07-22';
  it('미기록 = 미달', () => {
    expect(statusOf(st('2026-07-01'), T)).toBe('miss');
  });
  it('전부 정상 기준 충족 = 정상', () => {
    expect(statusOf(st('2026-07-01', { [T]: FULL }), T)).toBe('full');
  });
  it('전부 최소 이상 = 최소', () => {
    expect(statusOf(st('2026-07-01', { [T]: MIN }), T)).toBe('min');
  });
  it('하나라도 최소 미만 = 미달', () => {
    expect(statusOf(st('2026-07-01', { [T]: { p: 100, s: 100, r: 4, w: null } }), T)).toBe('miss');
  });
  it('송은 X = 수치가 정상이어도 그날 전체 미달', () => {
    expect(statusOf(st('2026-07-01', { [T]: { ...FULL, w: 'x' } }), T)).toBe('miss');
  });
  it('송은 O·해당없음(null)은 통과에 영향 없음', () => {
    expect(statusOf(st('2026-07-01', { [T]: { ...FULL, w: 'o' } }), T)).toBe('full');
    expect(statusOf(st('2026-07-01', { [T]: { ...MIN, w: null } }), T)).toBe('min');
  });
});

describe('completion', () => {
  const T = '2026-07-22';
  it('습관별 달성률 평균, 100% 초과분은 절삭', () => {
    // p 200/100→1, s 50/100→0.5, r 0/20→0 → 평균 0.5
    expect(completion(st('2026-07-01', { [T]: { p: 200, s: 50, r: 0, w: null } }), T)).toBeCloseTo(0.5);
  });
});

describe('streak — 최소 이상 연속일, 오늘 미기록은 진행중(어제까지 확정)', () => {
  it('오늘 미기록이면 어제부터 센다 (미달 취급 안 함)', () => {
    const s = st('2026-07-01', { '2026-07-19': MIN, '2026-07-20': FULL, '2026-07-21': MIN });
    expect(streak(s, '2026-07-22')).toBe(3);
  });
  it('오늘 최소 이상이면 오늘 포함', () => {
    const s = st('2026-07-01', { '2026-07-21': MIN, '2026-07-22': FULL });
    expect(streak(s, '2026-07-22')).toBe(2);
  });
  it('중간 미달에서 끊김', () => {
    const s = st('2026-07-01', { '2026-07-19': MIN, '2026-07-20': { p: 0, s: 0, r: 0, w: null }, '2026-07-21': MIN });
    expect(streak(s, '2026-07-22')).toBe(1);
  });
  it('startDate 이전으로는 세지 않음', () => {
    const s = st('2026-07-21', { '2026-07-21': MIN });
    expect(streak(s, '2026-07-22')).toBe(1);
  });
  it('기록 전무 = 0', () => {
    expect(streak(st('2026-07-01'), '2026-07-22')).toBe(0);
  });
});

describe('monthFullRate — 월초(또는 startDate)부터 어제까지 정상률', () => {
  it('기본 계산', () => {
    const s = st('2026-07-20', { '2026-07-20': FULL, '2026-07-21': MIN });
    expect(monthFullRate(s, '2026-07-22')).toBe(50);
  });
  it('이달 표본이 없으면 null (매월 1일)', () => {
    const s = st('2026-07-01', { '2026-07-31': FULL });
    expect(monthFullRate(s, '2026-08-01')).toBe(null);
  });
  it('시작 첫날도 null (어제가 startDate 이전)', () => {
    expect(monthFullRate(st('2026-07-22'), '2026-07-22')).toBe(null);
  });
});

describe('monthlyRows — startDate부터 어제까지, 최신 월부터', () => {
  it('월 경계를 나눠 집계하고 최신 월이 먼저', () => {
    const s = st('2026-06-29', {
      '2026-06-29': FULL, '2026-06-30': MIN,
      '2026-07-01': FULL, '2026-07-02': { p: 0, s: 0, r: 0, w: null }
    });
    const rows = monthlyRows(s, '2026-07-03');
    expect(rows.length).toBe(2);
    expect(rows[0].label).toBe('26.07');
    expect(rows[0]).toMatchObject({ full: 1, min: 0, miss: 1, rate: 50 });
    expect(rows[1].label).toBe('26.06');
    expect(rows[1]).toMatchObject({ full: 1, min: 1, miss: 0, rate: 50 });
  });
  it('어제가 startDate 이전이면 빈 배열', () => {
    expect(monthlyRows(st('2026-07-22'), '2026-07-22')).toEqual([]);
  });
});

describe('날짜 헬퍼', () => {
  it('shift는 월·연 경계를 넘는다', () => {
    expect(shift('2026-07-31', 1)).toBe('2026-08-01');
    expect(shift('2026-01-01', -1)).toBe('2025-12-31');
    expect(shift('2028-02-28', 1)).toBe('2028-02-29'); // 윤년
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-07-01', '2026-07-22')).toBe(21);
  });
});

describe('가져오기 검증 (v1 내보내기 JSON 호환)', () => {
  const valid = JSON.stringify({
    startDate: '2026-06-29',
    days: { '2026-06-29': { p: 100, s: 100, r: 20, w: 'o' }, '2026-06-30': { p: 30, s: 30, r: 5, w: null } }
  });
  it('v1 스키마 JSON은 그대로 통과', () => {
    const s = importText(valid);
    expect(s.startDate).toBe('2026-06-29');
    expect(Object.keys(s.days).length).toBe(2);
  });
  it('JSON이 아니면 throw', () => {
    expect(() => importText('{oops')).toThrow();
  });
  it('startDate 형식 오류 거부', () => {
    expect(() => importText(JSON.stringify({ startDate: '26-06-29', days: {} }))).toThrow();
  });
  it('날짜 키 형식 오류 거부', () => {
    expect(() => importText(JSON.stringify({ startDate: '2026-06-29', days: { 'x': { p: 0, s: 0, r: 0, w: null } } }))).toThrow();
  });
  it('w 값 오류 거부', () => {
    expect(() => importText(JSON.stringify({ startDate: '2026-06-29', days: { '2026-06-29': { p: 0, s: 0, r: 0, w: 'y' } } }))).toThrow();
  });
  it('음수 값 거부', () => {
    expect(validateState({ startDate: '2026-06-29', days: { '2026-06-29': { p: -1, s: 0, r: 0, w: null } } })).not.toBe(null);
  });
});
