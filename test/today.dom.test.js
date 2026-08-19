// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToday } from '../src/views/today.js';

/* index.html의 #main 내부와 동일한 id 골격 */
function mountSkeleton() {
  document.body.innerHTML = `
    <span id="saveState"></span>
    <span id="dateStr"></span><span id="dplus"></span>
    <b id="streak"></b><b id="fullRate"></b>
    <div class="banner" id="banner"><span id="bannerMins"></span></div>
    <span id="goalFullNums"></span><span id="goalMinNums"></span>
    <div id="cards"></div>
    <div id="strip"></div>
    <div id="monthSection" style="display:none">
      <table><tbody id="monthBody"></tbody></table>
    </div>`;
}

const noop = () => {};
const handlers = {
  addVal: noop, undoVal: noop, setDirect: noop, toggleW: noop,
  toggleInvestmentReview: noop, undoStack: { p: [], s: [], r: [] }
};
const FULL = { p: 100, s: 100, r: 20, w: null };

describe('renderToday DOM 스모크', () => {
  beforeEach(mountSkeleton);

  it('카드 5개(일간 4 + 투자 원칙 주간 1), 14일 스트립, 날짜/D+ 렌더', () => {
    const state = { startDate: '2026-07-01', investmentReviewStart: '2026-07-22', days: { '2026-07-21': FULL } };
    renderToday(state, '2026-07-22', handlers);
    expect(document.querySelectorAll('#cards .card').length).toBe(5);
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

  it('수요일에도 완료할 수 있고 금요일에 같은 주 완료 상태를 공유', () => {
    var clicked = 0;
    const h = { ...handlers, toggleInvestmentReview: () => { clicked++; } };
    const wedState = { startDate: '2026-08-01', investmentReviewStart: '2026-08-19', days: {} };
    renderToday(wedState, '2026-08-19', h);
    const button = document.querySelector('.weekly-btn');
    expect(button.textContent).toBe('정독·검토 완료');
    expect(button.disabled).toBe(false);
    button.click();
    expect(clicked).toBe(1);

    const doneState = {
      startDate: '2026-08-01', investmentReviewStart: '2026-08-19',
      days: { '2026-08-19': { ...FULL, i: true } }
    };
    renderToday(doneState, '2026-08-21', handlers);
    expect(document.querySelector('.weekly-status').textContent).toContain('08.19 수요일 완료');
    expect(document.querySelector('.weekly-btn').textContent).toBe('이번 주 완료 취소');
  });

  it('주말에도 늦은 완료 버튼을 활성화', () => {
    const state = { startDate: '2026-08-01', investmentReviewStart: '2026-08-19', days: {} };
    renderToday(state, '2026-08-22', handlers);
    const button = document.querySelector('.weekly-btn');
    expect(button.textContent).toBe('늦게라도 완료');
    expect(button.disabled).toBe(false);
  });
});
