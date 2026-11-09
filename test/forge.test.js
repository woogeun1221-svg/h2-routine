// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FORGE, FORGE_ITEMS, forgeItem, forgeWindows, forgeWindowOf, forgeMark, forgeItemStatus, forgeActive } from '../src/forge.js';
import { statusOf } from '../src/logic.js';
import { validateState, mergeStates } from '../src/storage.js';
import { renderForge } from '../src/views/forge.js';

const base = (days = {}) => ({ startDate: '2026-07-01', days });

describe('27 담금질 구간', () => {
  it('기간은 2026-11-09 ~ 2026-12-31', () => {
    expect(FORGE.start).toBe('2026-11-09');
    expect(FORGE.end).toBe('2026-12-31');
    expect(forgeActive('2026-11-08')).toBe(false);
    expect(forgeActive('2026-12-31')).toBe(true);
    expect(forgeActive('2027-01-01')).toBe(false);
  });
  it('주 8개(마지막은 12.28~12.31), 격주 4개, 매일 53일', () => {
    const w = forgeWindows(forgeItem('bk'));
    expect(w.length).toBe(8);
    expect(w[0]).toEqual({ start: '2026-11-09', end: '2026-11-15' });
    expect(w[7]).toEqual({ start: '2026-12-28', end: '2026-12-31' });
    const b = forgeWindows(forgeItem('wr'));
    expect(b.map(x => x.start)).toEqual(['2026-11-09', '2026-11-23', '2026-12-07', '2026-12-21']);
    expect(b[3].end).toBe('2026-12-31');
    expect(forgeWindows(forgeItem('fx')).length).toBe(53);
  });
  it('격주 경계: 11-22는 첫 구간, 11-23은 둘째 구간', () => {
    expect(forgeWindowOf(forgeItem('wr'), '2026-11-22').start).toBe('2026-11-09');
    expect(forgeWindowOf(forgeItem('wr'), '2026-11-23').start).toBe('2026-11-23');
    expect(forgeWindowOf(forgeItem('bk'), '2027-01-01')).toBe(null);
  });
});

describe('27 담금질 판정', () => {
  it('운동은 fx 또는 운동 슬롯 기록이면 한 것', () => {
    const s = base({ '2026-11-09': { e: 'run' }, '2026-11-10': { fx: true }, '2026-11-11': {} });
    const fx = forgeItem('fx');
    expect(forgeMark(s, fx, '2026-11-09')).toBe('slot');
    expect(forgeMark(s, fx, '2026-11-10')).toBe('manual');
    expect(forgeMark(s, fx, '2026-11-11')).toBe(null);
  });
  it('구간 안 어느 날이든 기록하면 완료, 지난 빈 구간은 미달', () => {
    const s = base({ '2026-11-12': { bk: '원칙' } });
    const st = forgeItemStatus(s, forgeItem('bk'), '2026-11-15', '2026-11-25');
    expect(st.phase).toBe('done');
    expect(st.entries).toEqual([{ ds: '2026-11-12', title: '원칙' }]);
    expect(st.windows.map(w => w.state).slice(0, 4)).toEqual(['done', 'miss', 'open', 'future']);
    expect(st.doneN).toBe(1);
    expect(st.missN).toBe(1);
  });
  it('구간 마지막 날 미기록이면 last, 매일 항목은 last가 없다', () => {
    const s = base({});
    expect(forgeItemStatus(s, forgeItem('stk'), '2026-11-15', '2026-11-15').phase).toBe('last');
    expect(forgeItemStatus(s, forgeItem('fx'), '2026-11-15', '2026-11-15').phase).toBe('open');
  });
  it('빈 제목은 기록이 아니다', () => {
    expect(forgeMark(base({ '2026-11-10': { wr: '  ' } }), forgeItem('wr'), '2026-11-10')).toBe(null);
  });
  it('루틴 판정(statusOf)에는 영향이 없다', () => {
    const day = { p: 100, s: 100, r: 20, w: null };
    const a = base({ '2026-11-10': day });
    const b = base({ '2026-11-10': { ...day, bk: '책', wr: '글', stk: 'TSMC', fx: true } });
    expect(statusOf(b, '2026-11-10')).toBe(statusOf(a, '2026-11-10'));
  });
});

describe('27 담금질 저장', () => {
  it('제목 문자열과 fx 불리언은 통과, 이상한 값은 거부', () => {
    expect(validateState(base({ '2026-11-10': { bk: '책', wr: null, stk: 'TSMC', fx: true } }))).toBe(null);
    expect(validateState(base({ '2026-11-10': { bk: 3 } }))).toMatch(/bk/);
    expect(validateState(base({ '2026-11-10': { stk: 'x'.repeat(201) } }))).toMatch(/stk/);
    expect(validateState(base({ '2026-11-10': { fx: 'o' } }))).toMatch(/fx/);
  });
  it('가져오기 합치기에서 담금질 기록이 남는다', () => {
    const merged = mergeStates(base({ '2026-11-10': { bk: '원칙' } }), base({ '2026-11-10': { p: 50 } })).state;
    expect(merged.days['2026-11-10']).toMatchObject({ bk: '원칙', p: 50 });
  });
});

describe('27 담금질 블록 DOM', () => {
  beforeEach(() => { document.body.innerHTML = '<section id="forgeBlock" hidden></section>'; });

  it('기간 안에서 네 줄, D-day, 기록 버튼 동작', () => {
    const setForge = vi.fn();
    const s = base({ '2026-11-10': { bk: '원칙', fx: true } });
    renderForge(s, '2026-11-10', { setForge }, '2026-11-10');
    const root = document.getElementById('forgeBlock');
    expect(root.hidden).toBe(false);
    expect(root.querySelectorAll('.forge-row').length).toBe(FORGE_ITEMS.length);
    expect(root.querySelector('.forge-dday b').textContent).toBe('D-51');
    expect(root.querySelector('[data-forge="bk"] .forge-status').textContent).toBe('11.9–11.15, 원칙');
    expect(root.querySelector('[data-forge="bk"] .forge-btn').textContent).toBe('기록됨');
    expect(root.querySelector('[data-forge="wr"] .forge-status').textContent).toBe('11.9–11.22, 일요일까지 1편.');
    expect(root.querySelectorAll('[data-forge="fx"] .ft').length).toBe(53);

    vi.stubGlobal('prompt', () => '  TSMC  ');
    root.querySelector('[data-forge="stk"] .forge-btn').click();
    expect(setForge).toHaveBeenCalledWith('stk', 'TSMC');
    root.querySelector('[data-forge="fx"] .forge-btn').click();
    expect(setForge).toHaveBeenCalledWith('fx', null);
    vi.stubGlobal('confirm', () => true);
    root.querySelector('[data-forge="bk"] .forge-btn').click();
    expect(setForge).toHaveBeenCalledWith('bk', null);
    vi.unstubAllGlobals();
  });
  it('운동 슬롯을 기록한 날은 운동 버튼이 잠긴 완료', () => {
    renderForge(base({ '2026-11-10': { e: 'am' } }), '2026-11-10', { setForge: vi.fn() }, '2026-11-10');
    const b = document.querySelector('[data-forge="fx"] .forge-btn');
    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('슬롯 완료');
  });
  it('기간 밖 날짜에선 숨긴다', () => {
    renderForge(base({}), '2026-11-08', { setForge: vi.fn() }, '2026-11-08');
    expect(document.getElementById('forgeBlock').hidden).toBe(true);
  });
});

describe('추이 화면 담금질 장부', () => {
  beforeEach(() => { document.body.innerHTML = '<section id="forgeTrends" hidden></section>'; });
  it('항목별 달성률은 끝난 구간 기준, 기록 목록은 최신 먼저, 운동은 출처별', async () => {
    const { renderForgeTrends, forgeItemSummary } = await import('../src/views/forgeTrends.js');
    const s = base({
      '2026-11-10': { bk: '원칙', e: 'am' }, '2026-11-12': { bk: '돈의 심리학' },
      '2026-11-17': { runs: [{ km: 5 }] }, '2026-11-18': { fx: true }
    });
    const bk = forgeItemSummary(s, forgeItem('bk'), '2026-11-18');
    expect(bk.rate).toBe(100);                      // 1주차 완료, 2주차는 진행 중이라 분모에서 빠진다
    expect(bk.left).toBe(7);
    expect(forgeItemSummary(s, forgeItem('stk'), '2026-11-18').rate).toBe(0);   // 1주차 미달
    renderForgeTrends(s, '2026-11-18');
    const root = document.getElementById('forgeTrends');
    expect(root.hidden).toBe(false);
    expect(root.querySelectorAll('.ft-row').length).toBe(4);
    expect([...root.querySelectorAll('[data-forge="bk"] .ft-log b')].map(b => b.textContent)).toEqual(['돈의 심리학', '원칙']);
    expect(root.querySelector('[data-forge="fx"] .ft-counts').textContent).toContain('슬롯 1일, 런닝 1일, 직접 1일');
    expect(root.querySelector('[data-forge="wr"] .forge-rate').textContent).toBe('—');
  });
  it('시작 전엔 숨긴다', async () => {
    const { renderForgeTrends } = await import('../src/views/forgeTrends.js');
    renderForgeTrends(base({}), '2026-11-08');
    expect(document.getElementById('forgeTrends').hidden).toBe(true);
  });
});
