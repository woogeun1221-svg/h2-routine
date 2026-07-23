// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToday } from '../src/views/today.js';

/* index.html의 #main 내부와 동일한 id 골격 */
function mountSkeleton() {
  document.body.innerHTML = `
    <span id="saveState"></span>
    <span id="dateStr"></span><span id="dplus"></span>
    <b id="streak"></b><b id="fullRate"></b>
    <div class="banner" id="banner"></div>
    <div id="cards"></div>
    <div id="strip"></div>
    <div id="monthSection" style="display:none">
      <table><tbody id="monthBody"></tbody></table>
    </div>`;
}

const noop = () => {};
const handlers = { addVal: noop, undoVal: noop, setDirect: noop, toggleW: noop, undoStack: { p: [], s: [], r: [] } };
const FULL = { p: 100, s: 100, r: 20, w: null };

describe('renderToday DOM 스모크', () => {
  beforeEach(mountSkeleton);

  it('카드 4개(습관 3 + 송은), 14일 스트립, 날짜/D+ 렌더', () => {
    const state = { startDate: '2026-07-01', days: { '2026-07-21': FULL } };
    renderToday(state, '2026-07-22', handlers);
    expect(document.querySelectorAll('#cards .card').length).toBe(4);
    expect(document.querySelectorAll('#strip .day').length).toBe(14);
    expect(document.getElementById('dateStr').textContent).toBe('2026.07.22 수');
    expect(document.getElementById('dplus').textContent).toBe('D+22');
    expect(document.getElementById('streak').textContent).toBe('1일');
  });

  it('어제 미달이면 배너 표시, 아니면 숨김', () => {
    const state = { startDate: '2026-07-01', days: {} };
    renderToday(state, '2026-07-22', handlers);
    expect(document.getElementById('banner').className).toContain('show');

    const ok = { startDate: '2026-07-01', days: { '2026-07-21': FULL } };
    renderToday(ok, '2026-07-22', handlers);
    expect(document.getElementById('banner').className).not.toContain('show');
  });

  it('송은 X면 오늘 캔들이 미달색', () => {
    const state = { startDate: '2026-07-01', days: { '2026-07-22': { ...FULL, w: 'x' } } };
    renderToday(state, '2026-07-22', handlers);
    const todayCandle = document.querySelectorAll('#strip .candle')[13];
    expect(todayCandle.className).toContain('miss');
  });
});
