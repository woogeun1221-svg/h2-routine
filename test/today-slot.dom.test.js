// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToday, renderSlot } from '../src/views/today.js';

/* index.html 오늘 화면 골격 + v2(#weekNo, #bannerHead, #slotBlock, #posLine) */
function mountSkeleton() {
  document.body.innerHTML = `
    <span id="saveState"></span>
    <span id="dateStr"></span><span id="weekNo"></span><span id="dplus"></span>
    <button id="dayPrev"></button><button id="dayNext"></button>
    <div class="edit-notice" id="editNotice"><span id="editNoticeText"></span><button id="todayBtn">오늘로</button></div>
    <b id="streak"></b><b id="fullRate"></b>
    <div class="banner" id="banner"><b id="bannerHead">어제 미달.</b><span id="bannerMins"></span></div>
    <section id="slotBlock" class="card slot-card" hidden></section>
    <div id="posLine"></div>
    <span id="goalFullNums"></span><span id="goalMinNums"></span>
    <div id="cards"></div>
    <div id="strip"></div>`;
}

const SUN = '2026-11-08', MON = '2026-11-09', TUE = '2026-11-10', SAT = '2026-11-14';
const FULL = { p: 100, t: 20, r: 20, w: null, c: 'o' };
function st(days, extra) {
  return {
    startDate: '2026-10-01', pullupStart: '2026-10-19', squatEnd: '2026-10-29', postureStart: '2026-11-03',
    exerciseSlotStart: SUN, days: days || {}, ...(extra || {})
  };
}
function handlers(extra) {
  return {
    addVal: vi.fn(), undoVal: vi.fn(), setDirect: vi.fn(), toggleW: vi.fn(), toggleCheck: vi.fn(), toggleWeekly: vi.fn(),
    toggleSlot: vi.fn(), selectDay: vi.fn(), undoStack: { p: [], s: [], t: [], r: [] }, ...(extra || {})
  };
}
const slot = () => document.getElementById('slotBlock');
const pos = () => document.getElementById('posLine');

describe('오늘 — 운동 슬롯 블록', () => {
  beforeEach(mountSkeleton);

  it('평일: 계획 슬롯 표시, 누르면 toggleSlot, 카드 수는 그대로(블록은 #cards 밖)', () => {
    const h = handlers({ hour: 8 });
    const s = st({}, { plans: { [MON]: { 1: 'noon', 2: 'am', 3: 'am', 4: 'am', 5: 'am' } } });
    renderToday(s, MON, h);
    expect(slot().hidden).toBe(false);
    expect(slot().querySelector('.slot-plan').textContent).toBe('계획 점심');
    const buttons = [...slot().querySelectorAll('.btn')];
    expect(buttons.map(b => b.dataset.slot)).toEqual(['am', 'noon', 'run']);
    expect(buttons[1].className).toContain('planned');
    expect(buttons[1].querySelector('.slot-tag').textContent).toBe('계획');
    expect(buttons.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    buttons[2].click();
    expect(h.toggleSlot).toHaveBeenCalledWith('run');
    expect(slot().querySelector('.slot-note').textContent).toBe('슬롯을 비우면 오늘은 최소 포지션까지만 찍힌다.');
    expect(document.querySelectorAll('#cards .card').length).toBe(7); // 일간 3 + 송은 + 가슴 펴기 + 주간 2, 슬롯 블록은 세지 않는다
  });

  it('시간 경과 안내: 아침 계획 10시 → 백업 순서, 21시 → 최소 포지션 마감', () => {
    renderToday(st(), MON, handlers({ hour: 10 }));
    expect(slot().className).toContain('tone-warn');
    expect(slot().querySelector('.slot-note').textContent).toBe('아침 슬롯 지남. 백업 순서: 점심 → 퇴근 런닝.');
    renderSlot(st(), MON, handlers({ hour: 21 }));
    expect(slot().className).toContain('tone-lost');
    expect(slot().querySelector('.slot-note').textContent).toBe('오늘 슬롯 비었음. 최소 포지션(푸쉬업, 턱걸이)으로 마감.');
  });

  it('계획과 다른 슬롯을 하면 완료 플래그와 계획 아침 → 실제 점심', () => {
    renderToday(st({ [MON]: { e: 'noon' } }), MON, handlers({ hour: 12 }));
    expect(slot().querySelector('.done-flag').textContent).toBe('완료');
    expect(slot().querySelector('[data-slot="noon"]').getAttribute('aria-pressed')).toBe('true');
    expect(slot().querySelector('[data-slot="noon"]').className).toContain('sel-o');
    expect(slot().querySelector('.slot-note').textContent).toBe('계획 아침 → 실제 점심.');
  });

  it('주말: 송은 시간, 계획 표시 없음, 기록은 가능', () => {
    const h = handlers({ hour: 12 });
    renderToday(st(), SUN, h);
    expect(slot().hidden).toBe(false);
    expect(slot().className).toContain('weekend');
    expect(slot().querySelector('.card-sub').textContent).toBe('주말, 송은 시간');
    expect(slot().querySelector('.slot-plan').textContent).toBe('시간표 없음');
    expect(slot().querySelectorAll('.planned').length).toBe(0);
    expect(slot().querySelector('.slot-note').textContent).toBe('시간표 없음. 했으면 기록만, 상태엔 영향 없음.');
    slot().querySelector('[data-slot="am"]').click();
    expect(h.toggleSlot).toHaveBeenCalledWith('am');
  });

  it('슬롯 기능 시작 전 날짜(과거 보기)와 활성일 없는 옛 상태에서는 숨긴다', () => {
    renderToday(st(), MON, handlers({ hour: 9 }), '2026-11-06');
    expect(slot().hidden).toBe(true);
    expect(slot().children.length).toBe(0);
    renderToday({ startDate: '2026-10-01', days: {} }, MON, handlers({ hour: 9 }));
    expect(slot().hidden).toBe(true);
  });

  it('지난 평일 보기: 시각과 무관하게 비었음 안내', () => {
    renderToday(st(), TUE, handlers({ hour: 9 }), MON);
    expect(slot().querySelector('.slot-note').textContent).toBe('슬롯 비었음. 그날은 최소 포지션까지만 찍힌다.');
  });
});

describe('오늘 — 현재 포지션 줄 (완료 조건 2의 화면)', () => {
  beforeEach(mountSkeleton);

  it('평일 습관 정상 + 슬롯 미완료 → 최소 포지션, 정상까지 운동 슬롯', () => {
    renderToday(st({ [MON]: FULL }), MON, handlers({ hour: 12 }));
    expect(pos().querySelector('.pill').className).toBe('pill min');
    expect(pos().querySelector('.pill').textContent).toBe('최소 포지션');
    expect(pos().querySelector('.pos-gap').textContent).toBe('정상까지 운동 슬롯');
  });

  it('슬롯 완료 → 정상 포지션, 오늘 정상 마감', () => {
    renderToday(st({ [MON]: { ...FULL, e: 'am' } }), MON, handlers({ hour: 12 }));
    expect(pos().querySelector('.pill').textContent).toBe('정상 포지션');
    expect(pos().querySelector('.pos-gap').textContent).toBe('오늘 정상 마감.');
  });

  it('토요일 습관 정상 → 슬롯 없이 정상 포지션', () => {
    renderToday(st({ [SAT]: FULL }), SAT, handlers({ hour: 12 }));
    expect(pos().querySelector('.pill').textContent).toBe('정상 포지션');
  });

  it('미달이면 최소까지를 먼저, 정상까지를 다음 줄에', () => {
    renderToday(st({ [MON]: { p: 20, t: 5, r: 5, w: null } }), MON, handlers({ hour: 12 }));
    const gaps = [...pos().querySelectorAll('.pos-gap')].map(el => el.textContent);
    expect(pos().querySelector('.pill').textContent).toBe('미달 포지션');
    expect(gaps).toEqual(['최소까지 푸쉬업 10, 가슴 펴기 O', '정상까지 운동 슬롯, 푸쉬업 80, 턱걸이 15, 독서 15분, 가슴 펴기 O']);
    expect(pos().textContent).not.toContain('·');
  });

  it('송은 X면 그 자체로 미달 안내', () => {
    renderToday(st({ [MON]: { ...FULL, e: 'am', w: 'x' } }), MON, handlers({ hour: 12 }));
    expect(pos().querySelector('.pill').textContent).toBe('미달 포지션');
    expect(pos().querySelector('.pos-gap').textContent).toBe('송은 X는 그 자체로 그날 미달.');
  });
});

describe('오늘 — 배너와 주차 (완료 조건 3, 5)', () => {
  beforeEach(mountSkeleton);

  it('어제 미달 → 배너, 이틀 연속 미달 → 이틀 연속 배너, 어제 통과면 숨김', () => {
    renderToday(st({ [SUN]: FULL }), TUE, handlers({ hour: 9 })); // 월요일 무기록 = 미달, 일요일 정상
    expect(document.getElementById('banner').className).toBe('banner show');
    expect(document.getElementById('bannerHead').textContent).toBe('어제 미달.');

    renderToday(st(), TUE, handlers({ hour: 9 })); // 일, 월 모두 무기록
    expect(document.getElementById('banner').className).toBe('banner show twice');
    expect(document.getElementById('bannerHead').textContent).toBe('이틀 연속 미달.');

    renderToday(st({ [MON]: { p: 30, t: 5, r: 5, w: null, c: 'o' } }), TUE, handlers({ hour: 9 })); // 어제 최소
    expect(document.getElementById('banner').className).toBe('banner');
  });

  it('날짜 옆 ISO 주차: 11-08 W45, 11-09 W46', () => {
    renderToday(st(), SUN, handlers({ hour: 9 }));
    expect(document.getElementById('weekNo').textContent).toBe('W45');
    renderToday(st(), MON, handlers({ hour: 9 }));
    expect(document.getElementById('weekNo').textContent).toBe('W46');
  });

  it('14일 스트립: 토일 날짜 라벨은 황동(we), 오늘 라벨은 그대로', () => {
    renderToday(st(), SUN, handlers({ hour: 9 }));
    const labels = [...document.querySelectorAll('#strip .day-label')];
    expect(labels[13].textContent).toBe('오늘');
    expect(labels[13].className).toContain('today');
    expect(labels[12].className).toContain('we');   // 11-07 토
    expect(labels[11].className).not.toContain('we'); // 11-06 금
  });
});
