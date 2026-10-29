// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToday } from '../src/views/today.js';

/* index.html의 #main 내부와 동일한 id 골격 */
function mountSkeleton() {
  document.body.innerHTML = `
    <span id="saveState"></span>
    <span id="dateStr"></span><span id="dplus"></span>
    <button id="dayPrev"></button><button id="dayNext"></button>
    <div class="edit-notice" id="editNotice"><span id="editNoticeText"></span><button id="todayBtn">오늘로</button></div>
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
  toggleWeekly: noop, undoStack: { p: [], s: [], r: [] }
};
const FULL = { p: 100, s: 100, r: 20, w: null };

describe('renderToday DOM 스모크', () => {
  beforeEach(mountSkeleton);

  it('카드 6개(일간 3 + 송은 + 주간 2), 14일 스트립, 날짜/D+ 렌더', () => {
    const state = { startDate: '2026-07-01', investmentReviewStart: '2026-07-22', days: { '2026-07-21': FULL } };
    renderToday(state, '2026-07-22', handlers);
    expect(document.querySelectorAll('#cards .card').length).toBe(6);
    expect(document.querySelectorAll('#cards .weekly-card').length).toBe(2);
    expect(document.querySelector('[data-weekly="rr"] .weekly-btn').textContent).toBe('기록 시작 전'); // 활성일 없음
    expect(document.querySelectorAll('#strip .day').length).toBe(14);
    expect(document.getElementById('dateStr').textContent).toBe('2026.07.22 수');
    expect(document.getElementById('dplus').textContent).toBe('D+22');
    expect(document.getElementById('streak').textContent).toBe('1일');
  });

  it('턱걸이 활성일부터 카드 7개, 활성 전날 기록은 소급 미달 없음', () => {
    const state = {
      startDate: '2026-07-01', investmentReviewStart: '2026-07-22', pullupStart: '2026-07-22',
      days: { '2026-07-21': FULL, '2026-07-22': { ...FULL, t: 5 } }
    };
    renderToday(state, '2026-07-22', handlers); // undoStack에 t가 없어도 렌더
    const cards = document.querySelectorAll('#cards .card');
    expect(cards.length).toBe(7);
    expect(cards[2].querySelector('.card-name').textContent).toContain('턱걸이');
    expect(cards[2].querySelector('.done-flag').textContent).toBe('최소');
    expect(document.getElementById('goalFullNums').textContent).toBe('100 · 100 · 20 · 20');
    expect(document.getElementById('bannerMins').textContent).toBe('30·30·5·5');
    expect(document.getElementById('banner').className).not.toContain('show'); // 어제는 세 습관 기준 정상
    expect(document.getElementById('streak').textContent).toBe('2일');
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

  it('오늘 보기: 다음날 버튼 비활성, 수정 안내 숨김, 스트립 칸은 버튼이고 시작일 전은 비활성', () => {
    const selectDay = vi.fn();
    const state = { startDate: '2026-07-15', days: {} };
    renderToday(state, '2026-07-22', { ...handlers, selectDay });
    expect(document.getElementById('dayNext').disabled).toBe(true);
    expect(document.getElementById('dayPrev').disabled).toBe(false);
    expect(document.getElementById('editNotice').className).toBe('edit-notice');
    const days = document.querySelectorAll('#strip button.day');
    expect(days.length).toBe(14);
    expect(days[0].disabled).toBe(true);   // 07-09는 시작일 전
    expect(days[6].disabled).toBe(false);  // 07-15 시작일
    days[12].click();                      // 어제
    expect(selectDay).toHaveBeenCalledWith('2026-07-21');
    expect(document.querySelectorAll('#strip .day.selected').length).toBe(0);
  });

  it('과거 날짜 보기: 날짜/D+는 그날, 요약 칩과 배너는 오늘 기준, 카드는 그날 활성 습관(은퇴 전 스쿼트 포함)', () => {
    const state = {
      startDate: '2026-07-01', investmentReviewStart: '2026-07-22', pullupStart: '2026-07-22', squatEnd: '2026-07-22',
      days: { '2026-07-20': { ...FULL, s: 40 }, '2026-07-21': FULL, '2026-07-22': { p: 100, t: 20, r: 20, w: null } }
    };
    renderToday(state, '2026-07-22', handlers, '2026-07-20');
    expect(document.getElementById('dateStr').textContent).toBe('2026.07.20 월');
    expect(document.getElementById('dplus').textContent).toBe('D+20');
    expect(document.getElementById('editNotice').className).toBe('edit-notice show');
    expect(document.getElementById('editNoticeText').textContent).toContain('07.20 월요일 기록을 수정하는 중');
    expect(document.getElementById('dayNext').disabled).toBe(false);
    expect(document.getElementById('dayPrev').disabled).toBe(false);
    // 요약은 오늘(07-22) 기준: 어제(07-21) 정상이라 배너 없음, 스트릭은 20, 21, 22 모두 최소 이상
    expect(document.getElementById('banner').className).not.toContain('show');
    expect(document.getElementById('streak').textContent).toBe('3일');
    // 카드는 07-20 기준: 푸쉬업, 스쿼트(은퇴 전), 독서 + 송은 + 투자 원칙(활성 전) = 5
    const names = [...document.querySelectorAll('#cards .card-name')].map(el => el.textContent);
    expect(names[0]).toContain('푸쉬업');
    expect(names[1]).toContain('스쿼트');
    expect(names[2]).toContain('독서');
    expect(names.some(n => n.includes('턱걸이'))).toBe(false);
    expect(document.querySelectorAll('#cards .card')[1].querySelector('.card-val').textContent).toContain('40');
    expect(document.querySelectorAll('#strip .day.selected').length).toBe(1);
    expect(document.querySelector('#strip .day.selected').getAttribute('aria-label')).toBe('2026-07-20 기록 보기');
    // 오늘(07-22) 카드는 스쿼트 없이 턱걸이
    renderToday(state, '2026-07-22', handlers);
    const today = [...document.querySelectorAll('#cards .card-name')].map(el => el.textContent);
    expect(today[1]).toContain('턱걸이');
    expect(today.some(n => n.includes('스쿼트'))).toBe(false);
  });

  it('과거 날짜의 +N, 직접 입력, 송은, 투자 원칙 버튼이 핸들러를 호출한다 (대상 날짜는 main.js가 정한다)', () => {
    const addVal = vi.fn(), toggleW = vi.fn(), toggleWeekly = vi.fn();
    const state = { startDate: '2026-07-01', investmentReviewStart: '2026-07-13', days: {} };
    renderToday(state, '2026-07-22', { ...handlers, addVal, toggleW, toggleWeekly }, '2026-07-18'); // 지난주 토요일
    const cards = document.querySelectorAll('#cards .card');
    expect(cards[0].querySelectorAll('.btn')[0].textContent).toBe('+5'); // 푸쉬업 +5 +10 +25
    cards[0].querySelectorAll('.btn')[2].click();
    expect(addVal).toHaveBeenCalledWith('p', 25);
    cards[3].querySelectorAll('.btn')[2].click();
    expect(toggleW).toHaveBeenCalledWith('x');
    expect(document.querySelector('.weekly-btn').textContent).toBe('늦게라도 완료'); // 주간 판정도 그날(07-18 토) 기준
    document.querySelector('.weekly-btn').click();
    expect(toggleWeekly).toHaveBeenCalledWith('i');
  });

  it('수요일에도 완료할 수 있고 금요일에 같은 주 완료 상태를 공유', () => {
    var clicked = 0;
    const h = { ...handlers, toggleWeekly: (key) => { if (key === 'i') clicked++; } };
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

  it('손익비 스냅샷 카드 — 투자 원칙과 독립, 완료 토글은 rr 키, 대시보드 링크', () => {
    const toggleWeekly = vi.fn();
    const state = {
      startDate: '2026-08-01', investmentReviewStart: '2026-08-19', rrSnapshotStart: '2026-08-19',
      days: { '2026-08-19': { ...FULL, i: true } }
    };
    renderToday(state, '2026-08-20', { ...handlers, toggleWeekly });
    const rr = document.querySelector('[data-weekly="rr"]');
    expect(rr.querySelector('.card-name').textContent).toContain('손익비 스냅샷');
    expect(rr.querySelector('.card-sub').textContent).toBe('매주 1회, 금요일까지');
    expect(rr.querySelector('.weekly-btn').textContent).toBe('스냅샷 완료'); // 목요일 = open, 투자 원칙 완료와 무관
    expect(rr.querySelector('.weekly-link').getAttribute('href')).toBe('https://macmini.taile484c7.ts.net/rr/');
    expect(document.querySelector('[data-weekly="i"] .weekly-btn').textContent).toBe('이번 주 완료 취소');
    rr.querySelector('.weekly-btn').click();
    expect(toggleWeekly).toHaveBeenCalledWith('rr');

    renderToday({ ...state, days: { '2026-08-19': { ...FULL, i: true, rr: true } } }, '2026-08-22', handlers);
    expect(document.querySelector('[data-weekly="rr"] .weekly-status').textContent).toContain('08.19 수요일 완료');
    expect(document.querySelector('[data-weekly="rr"] .done-flag').textContent).toBe('주간 완료');
  });

  it('주말에도 늦은 완료 버튼을 활성화', () => {
    const state = { startDate: '2026-08-01', investmentReviewStart: '2026-08-19', days: {} };
    renderToday(state, '2026-08-22', handlers);
    const button = document.querySelector('.weekly-btn');
    expect(button.textContent).toBe('늦게라도 완료');
    expect(button.disabled).toBe(false);
  });
});
