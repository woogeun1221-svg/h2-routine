import { describe, it, expect } from 'vitest';
import { goalsOf, statusOf, completion, habitMonthStats } from '../src/logic.js';
import { validateState, importText } from '../src/storage.js';

function st(startDate, days, settings) {
  var s = { startDate, days: days || {} };
  if (settings) s.settings = settings;
  return s;
}

describe('goalsOf — 목표치 오버라이드', () => {
  it('settings 없으면 기본값', () => {
    const g = goalsOf(st('2026-07-01'));
    expect(g.map(x => [x.target, x.min])).toEqual([[100, 30], [100, 30], [20, 5]]);
  });
  it('부분 오버라이드 — 지정한 습관만 바뀜', () => {
    const g = goalsOf(st('2026-07-01', {}, { p: { target: 50, min: 10 } }));
    expect(g[0]).toMatchObject({ target: 50, min: 10 });
    expect(g[1]).toMatchObject({ target: 100, min: 30 });
    expect(g[2]).toMatchObject({ target: 20, min: 5 });
  });
  it('이상한 값은 무시하고 기본값 (v1 데이터 방어)', () => {
    const g = goalsOf(st('2026-07-01', {}, { p: { target: '50', min: -3 } }));
    expect(g[0]).toMatchObject({ target: 100, min: 30 });
  });
  it('최소 > 정상이 되는 조합은 최소를 정상으로 클램프', () => {
    const g = goalsOf(st('2026-07-01', {}, { r: { target: 3 } }));
    expect(g[2]).toMatchObject({ target: 3, min: 3 }); // 기본 min 5 > target 3 → 3
  });
});

describe('목표치가 상태 판정에 반영', () => {
  const T = '2026-07-22';
  it('낮춘 목표로 정상 판정', () => {
    const s = st('2026-07-01', { [T]: { p: 50, s: 50, r: 10, w: null } },
      { p: { target: 50, min: 20 }, s: { target: 50, min: 20 }, r: { target: 10, min: 3 } });
    expect(statusOf(s, T)).toBe('full');
    expect(completion(s, T)).toBe(1);
  });
  it('같은 기록이 기본 목표로는 미달·최소', () => {
    const s = st('2026-07-01', { [T]: { p: 50, s: 50, r: 10, w: null } });
    expect(statusOf(s, T)).toBe('min'); // 50≥30, 50≥30, 10≥5 → 최소
  });
  it('습관별 통계도 목표치를 따름', () => {
    const s = st('2026-07-20', { '2026-07-20': { p: 50, s: 0, r: 0, w: null } }, { p: { target: 50, min: 25 } });
    const stats = habitMonthStats(s, '2026-07', '2026-07-21');
    expect(stats.habits[0]).toMatchObject({ full: 1, fullRate: 100 });
  });
});

describe('settings 스키마 검증', () => {
  const base = { startDate: '2026-07-01', days: {} };
  it('settings 없는 v1 JSON 통과', () => {
    expect(validateState(base)).toBe(null);
  });
  it('유효한 settings 통과 + 라운드트립 보존', () => {
    const s = { ...base, settings: { p: { target: 50, min: 10 } } };
    expect(validateState(s)).toBe(null);
    expect(importText(JSON.stringify(s)).settings).toEqual({ p: { target: 50, min: 10 } });
  });
  it('알 수 없는 키 거부', () => {
    expect(validateState({ ...base, settings: { w: { target: 1, min: 1 } } })).not.toBe(null);
  });
  it('target 0·음수·문자열 거부', () => {
    expect(validateState({ ...base, settings: { p: { target: 0, min: 1 } } })).not.toBe(null);
    expect(validateState({ ...base, settings: { p: { target: '50', min: 1 } } })).not.toBe(null);
  });
  it('최소 > 정상 거부', () => {
    expect(validateState({ ...base, settings: { p: { target: 30, min: 50 } } })).not.toBe(null);
  });
  it('settings가 배열/문자열이면 거부', () => {
    expect(validateState({ ...base, settings: [] })).not.toBe(null);
    expect(validateState({ ...base, settings: 'x' })).not.toBe(null);
  });
});
