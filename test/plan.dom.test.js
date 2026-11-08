// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPlan } from '../src/views/plan.js';
import { defaultPlanOffset } from '../src/logic.js';

/* index.html #screen-plan 내부와 같은 id 골격 */
function mountSkeleton() {
  document.body.innerHTML = `
    <div id="planWeeks"></div>
    <p id="planInherit" hidden></p>
    <div id="planRows"></div>
    <span id="planCount"></span>`;
}
const SUN = '2026-11-08', MON = '2026-11-09', WED = '2026-11-11';
const base = { startDate: '2026-10-01', exerciseSlotStart: SUN, days: {} };
function handlers() { return { setOffset: vi.fn(), setPlanSlot: vi.fn(), setPlanMemo: vi.fn() }; }
const rows = () => [...document.querySelectorAll('#planRows .plan-row')];

describe('renderPlan — 주간 운동 시간표', () => {
  beforeEach(mountSkeleton);

  it('일요일에 열면 다음 주(W46 11.9–11.15)가 선택돼 있다 (완료 조건 1)', () => {
    const h = handlers();
    renderPlan(base, SUN, defaultPlanOffset(SUN), h);
    const weeks = [...document.querySelectorAll('#planWeeks .btn')];
    expect(weeks.map(b => b.textContent)).toEqual(['이번 주W45 11.2–11.8', '다음 주W46 11.9–11.15']);
    expect(weeks.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(rows().map(r => r.dataset.day)).toEqual(
      ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    weeks[0].click();
    expect(h.setOffset).toHaveBeenCalledWith(0);
  });

  it('계획이 없으면 전부 아침, 집계와 안내, 토일은 송은 시간(버튼과 메모 없음)', () => {
    renderPlan(base, SUN, 1, handlers());
    expect(document.getElementById('planCount').textContent).toBe('아침 5, 점심 0, 저녁런닝 0');
    const inherit = document.getElementById('planInherit');
    expect(inherit.hidden).toBe(false);
    expect(inherit.textContent).toContain('전부 아침');
    const [mon, , , , , sat, sun] = rows();
    expect([...mon.querySelectorAll('.btn')].map(b => b.textContent)).toEqual(['아침', '점심', '저녁런닝']);
    expect(mon.querySelector('[aria-pressed="true"]').dataset.slot).toBe('am');
    expect(mon.querySelector('input.plan-memo').placeholder).toBe('메모, 송은 일정');
    for (const we of [sat, sun]) {
      expect(we.className).toContain('we');
      expect(we.querySelector('.plan-note').textContent).toBe('송은 시간');
      expect(we.querySelectorAll('.btn').length).toBe(0);
      expect(we.querySelector('input')).toBe(null);
    }
    expect(document.body.textContent).not.toContain('·');
  });

  it('슬롯을 누르면 그 주 월요일, 요일 번호, 슬롯으로 저장 핸들러를 부르고 메모는 입력마다 저장', () => {
    const h = handlers();
    renderPlan(base, SUN, 1, h);
    rows()[1].querySelector('[data-slot="noon"]').click();
    expect(h.setPlanSlot).toHaveBeenCalledWith(MON, 2, 'noon');
    rows()[1].querySelector('[data-slot="am"]').click(); // 이미 선택된 슬롯은 다시 저장하지 않는다
    expect(h.setPlanSlot).toHaveBeenCalledTimes(1);
    const memo = rows()[0].querySelector('input');
    memo.value = '송은 회식';
    memo.dispatchEvent(new Event('input'));
    expect(h.setPlanMemo).toHaveBeenCalledWith(MON, 1, '송은 회식');
  });

  it('그 주 계획이 있으면 슬롯, 메모, 집계를 그대로 보여 주고 안내는 숨긴다', () => {
    const s = { ...base, plans: { [MON]: { 1: 'noon', 2: 'run', 3: 'am', 4: 'run', 5: 'am', m2: '송은 야근' } } };
    renderPlan(s, SUN, 1, handlers());
    expect(rows().slice(0, 5).map(r => r.querySelector('[aria-pressed="true"]').dataset.slot))
      .toEqual(['noon', 'run', 'am', 'run', 'am']);
    expect(rows()[1].querySelector('input').value).toBe('송은 야근');
    expect(document.getElementById('planCount').textContent).toBe('아침 2, 점심 1, 저녁런닝 2');
    expect(document.getElementById('planInherit').hidden).toBe(true);
  });

  it('계획 없는 주는 직전 계획의 슬롯만 물려받아 보여 준다(메모 제외)', () => {
    const s = { ...base, plans: { '2026-11-02': { 1: 'run', 2: 'run', 3: 'run', 4: 'run', 5: 'noon', m1: '지난주 메모' } } };
    renderPlan(s, SUN, 1, handlers());
    expect(rows().slice(0, 5).map(r => r.querySelector('[aria-pressed="true"]').dataset.slot))
      .toEqual(['run', 'run', 'run', 'run', 'noon']);
    expect(rows()[0].querySelector('input').value).toBe('');
    expect(document.getElementById('planInherit').textContent).toContain('직전 계획을 물려받았다');
  });

  it('이번 주(수요일): 지난 평일은 실제 슬롯을 계획과 비교해 남기고, 오늘은 표시만', () => {
    const s = {
      ...base,
      plans: { [MON]: { 1: 'am', 2: 'am', 3: 'run', 4: 'am', 5: 'am' } },
      days: { [MON]: { e: 'am' }, '2026-11-10': { e: 'noon' } }
    };
    renderPlan(s, WED, 0, handlers());
    const r = rows();
    expect(r[0].querySelector('.plan-note').textContent).toBe('계획대로 완료');
    expect(r[1].querySelector('.plan-note').textContent).toBe('실제 점심');
    expect(r[1].querySelector('.plan-note').className).toContain('moved');
    expect(r[2].className).toContain('today');
    expect(r[2].querySelector('.today-tag').textContent).toBe('오늘');
    expect(r[2].querySelector('.plan-note').textContent).toBe('');
    expect(r[0].className).toContain('past');
    expect(document.querySelectorAll('#planWeeks .btn')[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('지난 평일에 슬롯이 없으면 비었음, 시간표 시작 전 날짜엔 표시 없음', () => {
    const s = { ...base, exerciseSlotStart: '2026-11-10', days: {} };
    renderPlan(s, WED, 0, handlers());
    expect(rows()[0].querySelector('.plan-note').textContent).toBe(''); // 11-09는 시작 전
    expect(rows()[1].querySelector('.plan-note').textContent).toBe('슬롯 비었음');
  });
});
