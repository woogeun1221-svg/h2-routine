// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPlan, renderPlanClock, planDayRange } from '../src/views/plan.js';
import { defaultPlanOffset } from '../src/logic.js';

/* index.html #screen-plan 내부와 같은 id 골격 */
function mountSkeleton() {
  document.body.innerHTML = `
    <div id="planModes"><button data-mode="day"></button><button data-mode="week"></button></div>
    <div id="planWeekView">
      <div id="planWeeks"></div>
      <p id="planInherit" hidden></p>
      <div id="planGrid"></div>
      <div id="planMemos"></div>
      <span id="planCount"></span>
    </div>
    <div id="planDayView" hidden>
      <div id="planDayHead"></div><div id="planDayMemo"></div><div id="planTimeline"></div><div id="planDayStatus"></div>
    </div>`;
}
const SUN = '2026-11-08', MON = '2026-11-09', TUE = '2026-11-10', WED = '2026-11-11', SAT = '2026-11-14';
const WEEK46 = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const base = { startDate: '2026-10-01', exerciseSlotStart: SUN, days: {} };
function handlers() {
  return { setMode: vi.fn(), setOffset: vi.fn(), setDay: vi.fn(), openDay: vi.fn(), setPlanSlot: vi.fn(), setPlanMemo: vi.fn() };
}
const cell = (ds, slot) => document.querySelector(`#planGrid .tt-cell[data-day="${ds}"][data-slot="${slot}"]`);
const pressed = ds => document.querySelector(`#planGrid .tt-cell[data-day="${ds}"][aria-pressed="true"]`)?.dataset.slot;
const block = (ds, slot) => cell(ds, slot).querySelector('.tt-block');
const memo = ds => document.querySelector(`#planMemos input[data-day="${ds}"]`);
const tl = slot => document.querySelector(`#planTimeline .tl-block[data-slot="${slot}"]`);

describe('renderPlan — 주간 시간표(요일 x 아침, 점심, 저녁)', () => {
  beforeEach(mountSkeleton);

  it('일요일에 열면 다음 주(W46 11.9–11.15)가 선택돼 있다 (완료 조건 1)', () => {
    const h = handlers();
    renderPlan(base, SUN, { mode: 'week', offset: defaultPlanOffset(SUN) }, h);
    const weeks = [...document.querySelectorAll('#planWeeks [data-offset]')];
    expect(weeks.map(b => b.textContent)).toEqual(['이번 주W45 11.2–11.8', '다음 주W46 11.9–11.15']);
    expect(weeks.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect([...document.querySelectorAll('#planGrid .tt-day')].map(d => d.dataset.day)).toEqual(WEEK46);
    expect(document.getElementById('planWeekView').hidden).toBe(false);
    expect(document.getElementById('planDayView').hidden).toBe(true);
    weeks[0].click();
    expect(h.setOffset).toHaveBeenCalledWith(0);
  });

  it('계획이 없으면 전부 아침, 집계와 안내, 토일은 송은 시간 한 덩어리(칸과 메모 없음)', () => {
    renderPlan(base, SUN, 1, handlers());
    expect(document.getElementById('planCount').textContent).toBe('아침 5, 점심 0, 저녁런닝 0');
    const inherit = document.getElementById('planInherit');
    expect(inherit.hidden).toBe(false);
    expect(inherit.textContent).toContain('전부 아침');
    expect(document.querySelectorAll('#planGrid .tt-cell').length).toBe(15); // 평일 5일 x 슬롯 3
    for (const ds of WEEK46.slice(0, 5)) {
      expect(pressed(ds)).toBe('am');
      expect(block(ds, 'am').className).toBe('tt-block plan');
      expect(cell(ds, 'noon').querySelector('.tt-block')).toBe(null);
    }
    expect(memo(MON).placeholder).toBe('메모, 송은 일정');
    for (const ds of WEEK46.slice(5)) {
      expect(document.querySelector(`#planGrid .tt-day[data-day="${ds}"]`).className).toContain('we');
      expect(document.querySelector(`#planGrid .tt-we[data-day="${ds}"]`).textContent).toBe('송은시간');
      expect(document.querySelector(`#planGrid .tt-cell[data-day="${ds}"]`)).toBe(null);
      expect(memo(ds)).toBe(null);
    }
    expect(document.body.textContent).not.toContain('·');
  });

  it('칸을 누르면 그 주 월요일, 요일 번호, 슬롯으로 저장하고 메모는 입력마다 저장, 날짜를 누르면 일간', () => {
    const h = handlers();
    renderPlan(base, SUN, 1, h);
    cell(TUE, 'noon').click();
    expect(h.setPlanSlot).toHaveBeenCalledWith(MON, 2, 'noon');
    cell(TUE, 'am').click(); // 이미 계획인 칸은 다시 저장하지 않는다
    expect(h.setPlanSlot).toHaveBeenCalledTimes(1);
    memo(MON).value = '송은 회식';
    memo(MON).dispatchEvent(new Event('input'));
    expect(h.setPlanMemo).toHaveBeenCalledWith(MON, 1, '송은 회식');
    document.querySelector(`#planGrid .tt-day[data-day="${WED}"]`).click();
    expect(h.openDay).toHaveBeenCalledWith(WED);
  });

  it('그 주 계획이 있으면 칸, 메모, 집계를 그대로 보여 주고 안내는 숨긴다', () => {
    const s = { ...base, plans: { [MON]: { 1: 'noon', 2: 'run', 3: 'am', 4: 'run', 5: 'am', m2: '송은 야근', u: 5 } } };
    renderPlan(s, SUN, 1, handlers());
    expect(WEEK46.slice(0, 5).map(pressed)).toEqual(['noon', 'run', 'am', 'run', 'am']);
    expect(memo(TUE).value).toBe('송은 야근');
    expect(document.getElementById('planCount').textContent).toBe('아침 2, 점심 1, 저녁런닝 2');
    expect(document.getElementById('planInherit').hidden).toBe(true);
  });

  it('계획 없는 주는 직전 계획의 슬롯만 물려받아 보여 준다(메모 제외)', () => {
    const s = { ...base, plans: { '2026-11-02': { 1: 'run', 2: 'run', 3: 'run', 4: 'run', 5: 'noon', m1: '지난주 메모' } } };
    renderPlan(s, SUN, 1, handlers());
    expect(WEEK46.slice(0, 5).map(pressed)).toEqual(['run', 'run', 'run', 'run', 'noon']);
    expect(memo(MON).value).toBe('');
    expect(document.getElementById('planInherit').textContent).toContain('직전 계획을 물려받았다');
  });

  it('이번 주(수요일): 계획대로 한 날은 완료, 다른 칸에서 한 날은 실제 칸 완료와 계획 칸 옮김, 오늘 열 표시', () => {
    const s = {
      ...base,
      plans: { [MON]: { 1: 'am', 2: 'am', 3: 'run', 4: 'am', 5: 'am' } },
      days: { [MON]: { e: 'am' }, [TUE]: { e: 'noon' } }
    };
    renderPlan(s, WED, { mode: 'week', offset: 0, hour: 9 }, handlers());
    expect(block(MON, 'am').className).toBe('tt-block done');
    expect(block(MON, 'am').textContent).toBe('아침완료');
    expect(block(TUE, 'noon').className).toBe('tt-block done');
    expect(block(TUE, 'am').className).toBe('tt-block ghost');
    expect(block(TUE, 'am').textContent).toBe('아침옮김');
    expect(cell(WED, 'run').className).toContain('today');
    expect(block(WED, 'run').className).toBe('tt-block plan');
    const wedHead = document.querySelector(`#planGrid .tt-day[data-day="${WED}"]`);
    expect(wedHead.className).toContain('today');
    // 지난 날 머리에는 그날 포지션 막대(습관 기록이 없으니 미달)
    expect(document.querySelector(`#planGrid .tt-day[data-day="${MON}"] .tt-status`).className).toBe('tt-status miss');
    expect(wedHead.querySelector('.tt-status')).toBe(null);
    expect(document.querySelectorAll('#planWeeks [data-offset]')[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('지난 평일에 슬롯이 없으면 비었음, 오늘은 컷오프가 지나야 지남, 시간표 시작 전 날짜엔 표시 없음', () => {
    const s = { ...base, exerciseSlotStart: TUE, plans: { [MON]: { 1: 'am', 2: 'am', 3: 'noon', 4: 'am', 5: 'am' } } };
    renderPlan(s, WED, { mode: 'week', offset: 0, hour: 13 }, handlers());
    expect(block(MON, 'am').className).toBe('tt-block plan'); // 11-09는 시작 전
    expect(block(TUE, 'am').className).toBe('tt-block miss');
    expect(block(TUE, 'am').textContent).toBe('아침비었음');
    expect(block(WED, 'noon').className).toBe('tt-block plan');
    renderPlanClock(s, WED, { mode: 'week', offset: 0, hour: 14 }, handlers());
    expect(block(WED, 'noon').className).toBe('tt-block miss');
    expect(block(WED, 'noon').textContent).toBe('점심지남');
  });

  it('1분 갱신(renderPlanClock)은 칸만 다시 그리고 입력 중인 메모 칸은 그대로 둔다', () => {
    renderPlan(base, MON, { mode: 'week', offset: 0, hour: 9 }, handlers());
    const input = memo(MON);
    renderPlanClock(base, MON, { mode: 'week', offset: 0, hour: 11 }, handlers());
    expect(memo(MON)).toBe(input);
    expect(block(MON, 'am').className).toBe('tt-block miss');
  });

  it('보기 전환 버튼은 setMode를 부르고 지금 보기는 눌린 상태', () => {
    const h = handlers();
    renderPlan(base, MON, { mode: 'week', offset: 0 }, h);
    const [day, week] = document.querySelectorAll('#planModes [data-mode]');
    expect(week.getAttribute('aria-pressed')).toBe('true');
    expect(day.getAttribute('aria-pressed')).toBe('false');
    day.click();
    expect(h.setMode).toHaveBeenCalledWith('day');
    week.click();
    expect(h.setMode).toHaveBeenCalledTimes(1);
  });
});

describe('renderPlan — 일간 시간축(06~24시)', () => {
  beforeEach(mountSkeleton);
  const s = {
    ...base, pullupStart: '2026-10-19', squatEnd: '2026-10-29', postureStart: '2026-11-03',
    plans: { [MON]: { 1: 'noon', 2: 'am', 3: 'am', 4: 'am', 5: 'am', m1: '송은 생일' } },
    days: { [MON]: { p: 100, t: 20, r: 20, c: 'o' } }
  };

  it('오늘(월 15:00): 슬롯 창 위치, 계획 칸 지남, 지금 선, 취침 선, 그날 포지션과 안내', () => {
    renderPlan(s, MON, { mode: 'day', day: MON, hour: 15, minute: 30 }, handlers());
    expect(document.getElementById('planDayView').hidden).toBe(false);
    expect(document.getElementById('planWeekView').hidden).toBe(true);
    expect(document.querySelector('#planDayHead .day-title').textContent).toBe('11.9 월W46, 오늘');
    expect(document.querySelector('#planDayMemo input').value).toBe('송은 생일');
    expect(tl('am').style.top).toBe('0.000%');
    expect(tl('am').style.height).toBe('22.222%');
    expect(tl('noon').style.top).toBe('33.333%');
    expect(tl('run').style.top).toBe('66.667%');
    expect(tl('noon').className).toBe('tl-block miss');
    expect(tl('noon').querySelector('em').textContent).toBe('지남');
    expect(tl('am').className).toBe('tl-block free');
    const now = document.querySelector('#planTimeline .tl-now');
    expect(now.textContent).toBe('15:30');
    expect(now.style.top).toBe('52.778%');
    expect(document.querySelector('#planTimeline .tl-bed').style.top).toBe('94.444%');
    expect(document.querySelector('#planDayStatus .pill').textContent).toBe('최소 포지션');
    expect(document.querySelector('#planDayStatus .day-gap').textContent).toBe('정상까지 운동 슬롯');
    expect(document.querySelector('#planDayStatus .day-guide').textContent).toBe('점심 슬롯 지남. 백업: 퇴근 런닝.');
    expect(document.body.textContent).not.toContain('·');
  });

  it('블록을 누르면 그날 계획이 바뀌고(이미 계획이면 그대로) 앞뒤 이동은 이번 주 월요일~다음 주 일요일', () => {
    const h = handlers();
    renderPlan(s, MON, { mode: 'day', day: MON, hour: 8 }, h);
    tl('run').click();
    expect(h.setPlanSlot).toHaveBeenCalledWith(MON, 1, 'run');
    tl('noon').click();
    expect(h.setPlanSlot).toHaveBeenCalledTimes(1);
    const [prev, next] = document.querySelectorAll('#planDayHead .icon-btn');
    expect(prev.disabled).toBe(true); // 이번 주 월요일이 처음
    next.click();
    expect(h.setDay).toHaveBeenCalledWith(TUE);
    expect(planDayRange(MON)).toEqual({ first: MON, last: '2026-11-22' });
    renderPlan(s, MON, { mode: 'day', day: '2026-11-22', hour: 8 }, h);
    expect(document.querySelectorAll('#planDayHead .icon-btn')[1].disabled).toBe(true);
  });

  it('완료한 날은 실제 칸이 완료, 계획 칸은 다른 칸에서 함', () => {
    const done = { ...s, days: { [MON]: { ...s.days[MON], e: 'run' } } };
    renderPlan(done, MON, { mode: 'day', day: MON, hour: 21 }, handlers());
    expect(tl('run').className).toBe('tl-block done');
    expect(tl('run').querySelector('em').textContent).toBe('완료');
    expect(tl('noon').className).toBe('tl-block ghost');
    expect(document.querySelector('#planDayStatus .pill').textContent).toBe('정상 포지션');
    expect(document.querySelector('#planDayStatus .day-guide').textContent).toBe('계획 점심 → 실제 저녁런닝.');
  });

  it('주말은 송은 시간 바탕, 버튼과 메모 없이 기록한 슬롯만 보인다', () => {
    const we = { ...s, days: { [SAT]: { e: 'noon' } } };
    renderPlan(we, SAT, { mode: 'day', day: SAT, hour: 12 }, handlers());
    expect(document.querySelector('#planTimeline .tl-we').textContent).toBe('송은 시간');
    expect(document.querySelectorAll('#planTimeline button').length).toBe(0);
    expect(tl('noon').className).toBe('tl-block done');
    expect(tl('am')).toBe(null);
    expect(document.querySelector('#planDayMemo input')).toBe(null);
    expect(document.querySelector('#planDayMemo .day-note').textContent).toContain('송은 시간');
  });

  it('앞날은 포지션 없이 계획 안내만, 지금 선도 없다', () => {
    renderPlan(s, MON, { mode: 'day', day: WED, hour: 9 }, handlers());
    expect(document.querySelector('#planDayStatus .pill')).toBe(null);
    expect(document.querySelector('#planDayStatus .day-guide').textContent).toBe('계획 아침, 10시까지.');
    expect(document.querySelector('#planTimeline .tl-now')).toBe(null);
    expect(tl('am').className).toBe('tl-block plan');
  });
});
