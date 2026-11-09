// @vitest-environment happy-dom
/* 2026-11-09 묶음: 손익비 스냅샷 은퇴, 운동 안 함, 운동 판정과 추이 운동 행, 런닝 기록, 합친 캘린더 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  statusOf, weeklyStatus, RR_SNAPSHOT, habitMonthStats, exercisedOn, slotGuidance, dayRecorded, gapsOf
} from '../src/logic.js';
import { validateState, freshState } from '../src/storage.js';
import { renderRun, parseMinutes, paceText } from '../src/views/run.js';
import { renderTrends } from '../src/views/trends.js';
import { forgeMark, forgeItem } from '../src/forge.js';

const FULL = { p: 100, t: 20, r: 20, w: null };

describe('손익비 스냅샷 은퇴(rrSnapshotEnd)', () => {
  const s = (days) => ({
    startDate: '2026-10-01', investmentReviewStart: '2026-10-01', rrSnapshotStart: '2026-10-01', rrSnapshotEnd: '2026-11-09',
    pullupStart: '2026-10-01', squatEnd: '2026-10-01', days
  });
  it('종료일 전 금요일은 그대로 미달, 종료일 뒤 금요일은 판정하지 않는다', () => {
    const st = s({ '2026-11-06': { ...FULL, i: true }, '2026-11-13': { ...FULL, i: true } });
    expect(statusOf(st, '2026-11-06')).toBe('miss');           // 11-06 금, rr 없음 → 예전 판정 유지
    expect(weeklyStatus(st, '2026-11-13', RR_SNAPSHOT).active).toBe(false);
    expect(statusOf(st, '2026-11-13')).toBe('full');
    expect(gapsOf(st, '2026-11-13').full).not.toContain('손익비 스냅샷');
  });
  it('처음 연 날로 종료일을 채운다', () => {
    expect(freshState('2026-11-09').rrSnapshotEnd).toBe('2026-11-09');
  });
  it('은퇴 뒤 달에는 추이 행이 없다', () => {
    const st = s({ '2026-10-30': { rr: true } });
    const names = m => habitMonthStats(st, m, '2026-12-20').weeklies.map(r => r.name);
    expect(names('2026-10')).toContain('손익비 스냅샷(주)');
    expect(names('2026-12')).not.toContain('손익비 스냅샷(주)');
  });
});

describe('운동 안 함(e = off)', () => {
  const st = { startDate: '2026-11-01', exerciseSlotStart: '2026-11-01', pullupStart: '2026-11-01', squatEnd: '2026-11-01', days: { '2026-11-10': { ...FULL, e: 'off' } } };
  it('저장 검증 통과, 판정은 빈 슬롯과 같다', () => {
    expect(validateState(st)).toBe(null);
    expect(validateState({ ...st, days: { '2026-11-10': { e: 'nap' } } })).toMatch(/\.e/);
    expect(statusOf(st, '2026-11-10')).toBe('min');
    expect(exercisedOn(st, '2026-11-10')).toBe(null);
  });
  it('안내 문구와 기록 있음 처리', () => {
    expect(slotGuidance(st, '2026-11-10', 9, true).text).toContain('운동 안 함');
    expect(dayRecorded({ startDate: '2026-11-01', days: { '2026-11-10': { e: 'off' } } }, '2026-11-10')).toBe(true);
  });
});

describe('운동 판정과 추이 운동, 런닝 행', () => {
  const st = {
    startDate: '2026-11-01', exerciseSlotStart: '2026-11-02',
    days: {
      '2026-11-02': { e: 'am' }, '2026-11-03': { runs: [{ km: 5, min: 30 }, { km: 2.5 }] },
      '2026-11-04': { fx: true }, '2026-11-05': { e: 'off' }
    }
  };
  it('슬롯, 런닝, 담금질 O 순으로 인정', () => {
    expect(exercisedOn(st, '2026-11-02')).toBe('slot');
    expect(exercisedOn(st, '2026-11-03')).toBe('run');
    expect(exercisedOn(st, '2026-11-04')).toBe('manual');
    expect(exercisedOn(st, '2026-11-05')).toBe(null);
    expect(forgeMark(st, forgeItem('fx'), '2026-11-03')).toBe('run');
  });
  it('운동 행은 시간표 시작일부터, 런닝 행은 뛴 날과 km', () => {
    const stats = habitMonthStats(st, '2026-11', '2026-11-08');
    const ex = stats.exercise.find(r => r.key === 'ex');
    expect(ex).toMatchObject({ days: 6, full: 3, miss: 3, sum: 3, fullRate: 50 });
    expect(stats.exercise.find(r => r.key === 'run')).toMatchObject({ full: 1, sum: 7.5 });
  });
  it('시간표 시작일이 없으면 운동 행 없음, 런닝이 없으면 런닝 행 없음', () => {
    expect(habitMonthStats({ startDate: '2026-11-01', days: {} }, '2026-11', '2026-11-08').exercise).toEqual([]);
  });
});

describe('런닝 저장 검증', () => {
  const v = runs => validateState({ startDate: '2026-11-01', days: { '2026-11-03': { runs } } });
  it('km 필수, min 선택, 하루 10개까지', () => {
    expect(v([{ km: 5, min: 30 }, { km: 1.2 }])).toBe(null);
    expect(v([{ km: 0 }])).toMatch(/runs/);
    expect(v([{ km: 5, min: -1 }])).toMatch(/runs/);
    expect(v({ km: 5 })).toMatch(/runs/);
    expect(v(Array.from({ length: 11 }, () => ({ km: 1 })))).toMatch(/runs/);
  });
});

describe('런닝 화면', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="runScreen"></div>'; });
  it('시간 파싱과 페이스', () => {
    expect(parseMinutes('32:30')).toBe(32.5);
    expect(parseMinutes('30')).toBe(30);
    expect(parseMinutes('')).toBe(undefined);
    expect(paceText(5, 27.5)).toBe("5'30\"");
  });
  it('기록 버튼은 addRun, 목록과 요약, 삭제는 removeRun', () => {
    const h = { addRun: vi.fn(), removeRun: vi.fn() };
    const st = { startDate: '2026-11-01', days: { '2026-11-09': { runs: [{ km: 5, min: 27.5 }] } } };
    renderRun(st, '2026-11-10', h);
    document.getElementById('runKm').value = '6.2';
    document.getElementById('runMin').value = '33:00';
    document.getElementById('runAdd').click();
    expect(h.addRun).toHaveBeenCalledWith('2026-11-10', { km: 6.2, min: 33 });
    expect(document.querySelectorAll('#runList li').length).toBe(1);
    expect(document.querySelector('#runList li').textContent).toContain("5'30\"");
    expect(document.querySelector('.run-chips').textContent).toContain('5km');
    expect(document.querySelectorAll('#runBars .run-bar').length).toBe(8);
    vi.stubGlobal('confirm', () => true);
    document.querySelector('#runList .run-x').click();
    expect(h.removeRun).toHaveBeenCalledWith('2026-11-09', 0);
    vi.unstubAllGlobals();
  });
  it('거리 없이 누르면 기록하지 않고 안내', () => {
    const h = { addRun: vi.fn(), removeRun: vi.fn() };
    renderRun({ startDate: '2026-11-01', days: {} }, '2026-11-10', h);
    document.getElementById('runAdd').click();
    expect(h.addRun).not.toHaveBeenCalled();
    expect(document.getElementById('runErr').textContent).toContain('거리');
  });
});

describe('합친 캘린더', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <b id="curStreak"></b><b id="maxStreak"></b>
      <button id="calPrev"></button><span id="calLabel"></span><button id="calNext"></button>
      <div id="calWd"></div><div id="calGrid"></div><div id="reflectionDay" hidden></div>
      <span id="habitTitle"></span><table><tbody id="habitBody"></tbody></table><div id="wifeLine"></div>
      <div id="monthSection"><table><tbody id="monthBody"></tbody></table></div>`;
  });
  it('칸 하나에 루틴 색과 만족도 글자가 같이 있고, 누르면 둘 다 보인다', () => {
    const st = { startDate: '2026-07-20', days: { '2026-07-20': { p: 100, s: 100, r: 20, w: null, self: 'x', selfReason: '사유' } } };
    renderTrends(st, '2026-07-22', '2026-07');
    const cell = document.querySelector('#calGrid button[data-day="2026-07-20"]');
    expect(cell.className).toContain('full');
    expect(cell.className).toContain('self-x');
    expect(cell.textContent).toBe('20X');
    cell.click();
    const detail = document.getElementById('reflectionDay').textContent;
    expect(detail).toContain('루틴 정상');
    expect(detail).toContain('만족도 X');
  });
});
