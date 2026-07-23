// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderTrends } from '../src/views/trends.js';

/* index.html #screen-trends 내부와 동일한 id 골격 */
function mountSkeleton() {
  document.body.innerHTML = `
    <b id="curStreak"></b><b id="maxStreak"></b>
    <button id="calPrev"></button><span id="calLabel"></span><button id="calNext"></button>
    <div id="calWd"></div>
    <div id="calGrid"></div>
    <span id="habitTitle"></span>
    <table><tbody id="habitBody"></tbody></table>
    <div id="wifeLine"></div>
    <div id="monthSection" style="display:none">
      <table><tbody id="monthBody"></tbody></table>
    </div>`;
}

const FULL = { p: 100, s: 100, r: 20, w: null };
const MIN = { p: 30, s: 30, r: 5, w: 'o' };

describe('renderTrends DOM 스모크', () => {
  beforeEach(mountSkeleton);

  it('스트릭 칩, 캘린더 그리드(lead+일수), 요일 헤더, 습관 3행', () => {
    const state = { startDate: '2026-07-20', days: { '2026-07-20': FULL, '2026-07-21': MIN } };
    renderTrends(state, '2026-07-22', '2026-07');

    expect(document.getElementById('curStreak').textContent).toBe('2일');
    expect(document.getElementById('maxStreak').textContent).toBe('2일');
    expect(document.getElementById('calLabel').textContent).toBe('2026.07');
    expect(document.getElementById('calWd').children.length).toBe(7);
    // 2026-07-01은 수요일 → lead 3 + 31일 = 34칸
    expect(document.getElementById('calGrid').children.length).toBe(34);
    expect(document.querySelectorAll('#habitBody tr').length).toBe(3);
    expect(document.getElementById('wifeLine').textContent).toContain('O 1');
    expect(document.getElementById('habitTitle').textContent).toBe('습관별 — 26.07');
  });

  it('히트맵 셀 상태 클래스 — 확정/오늘 진행중/미래', () => {
    const state = { startDate: '2026-07-20', days: { '2026-07-20': FULL } };
    renderTrends(state, '2026-07-22', '2026-07');
    const cells = document.querySelectorAll('#calGrid .cal-cell:not(.out)');
    // 20일=full, 21일=miss(미기록), 22일=pending+today, 23일~=future
    expect(cells[0].className).toContain('full');
    expect(cells[1].className).toContain('miss');
    expect(cells[2].className).toContain('pending');
    expect(cells[2].className).toContain('today');
    expect(cells[3].className).toContain('future');
  });

  it('단일 월이면 prev/next 모두 disabled', () => {
    const state = { startDate: '2026-07-20', days: {} };
    renderTrends(state, '2026-07-22', '2026-07');
    expect(document.getElementById('calPrev').disabled).toBe(true);
    expect(document.getElementById('calNext').disabled).toBe(true);
  });

  it('여러 달이면 중간 달에서 양쪽 활성, 월별 장부 표시', () => {
    const state = { startDate: '2026-05-10', days: { '2026-06-15': FULL, '2026-07-21': FULL } };
    renderTrends(state, '2026-07-22', '2026-06');
    expect(document.getElementById('calPrev').disabled).toBe(false);
    expect(document.getElementById('calNext').disabled).toBe(false);
    expect(document.getElementById('monthSection').style.display).toBe('block');
    expect(document.querySelectorAll('#monthBody tr').length).toBe(3); // 5·6·7월
  });

  it('확정 기록 없으면 습관 테이블에 빈 표시', () => {
    const state = { startDate: '2026-07-22', days: {} };
    renderTrends(state, '2026-07-22', '2026-07');
    expect(document.querySelector('#habitBody td.empty')).not.toBe(null);
    expect(document.getElementById('wifeLine').textContent).toBe('');
  });
});
