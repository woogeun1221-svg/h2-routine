// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderSettings } from '../src/views/settings.js';

/* index.html #screen-settings 내부와 동일한 id 골격 */
function mountSkeleton() {
  document.body.innerHTML = `
    <div id="goalRows"></div>
    <div id="settingsInfo"></div>`;
}

function st(settings) {
  var s = { startDate: '2026-07-01', days: { '2026-07-20': { p: 100, s: 100, r: 20, w: null } } };
  if (settings) s.settings = settings;
  return s;
}

describe('renderSettings DOM 스모크', () => {
  beforeEach(mountSkeleton);

  it('습관 3행 + 현재 목표값이 입력칸에 반영', () => {
    renderSettings(st({ p: { target: 50, min: 10 } }), { setGoal: () => {} });
    const rows = document.querySelectorAll('#goalRows .goal-row');
    expect(rows.length).toBe(3);
    const pInputs = rows[0].querySelectorAll('input');
    expect(pInputs[0].value).toBe('50');
    expect(pInputs[1].value).toBe('10');
    const rInputs = rows[2].querySelectorAll('input');
    expect(rInputs[0].value).toBe('20'); // 독서는 기본값
    expect(document.getElementById('settingsInfo').textContent).toContain('저장된 기록');
  });

  it('유효한 변경이면 setGoal(key, target, min) 호출', () => {
    const setGoal = vi.fn();
    renderSettings(st(), { setGoal });
    const inputs = document.querySelectorAll('#goalRows .goal-row')[0].querySelectorAll('input');
    inputs[0].value = '80';
    inputs[0].dispatchEvent(new Event('change'));
    expect(setGoal).toHaveBeenCalledWith('p', 80, 30);
  });

  it('최소 > 정상이면 alert 후 원복, setGoal 미호출', () => {
    const setGoal = vi.fn();
    vi.stubGlobal('alert', vi.fn());
    renderSettings(st(), { setGoal });
    const inputs = document.querySelectorAll('#goalRows .goal-row')[0].querySelectorAll('input');
    inputs[1].value = '200'; // min 200 > target 100
    inputs[1].dispatchEvent(new Event('change'));
    expect(setGoal).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
    expect(inputs[1].value).toBe('30');
    vi.unstubAllGlobals();
  });

  it('숫자가 아니거나 1 미만이면 원복', () => {
    const setGoal = vi.fn();
    vi.stubGlobal('alert', vi.fn());
    renderSettings(st(), { setGoal });
    const inputs = document.querySelectorAll('#goalRows .goal-row')[1].querySelectorAll('input');
    inputs[0].value = '0';
    inputs[0].dispatchEvent(new Event('change'));
    expect(setGoal).not.toHaveBeenCalled();
    expect(inputs[0].value).toBe('100');
    vi.unstubAllGlobals();
  });

  it('값이 그대로면 setGoal 미호출 (재렌더 루프 방지)', () => {
    const setGoal = vi.fn();
    renderSettings(st(), { setGoal });
    const inputs = document.querySelectorAll('#goalRows .goal-row')[0].querySelectorAll('input');
    inputs[0].dispatchEvent(new Event('change'));
    expect(setGoal).not.toHaveBeenCalled();
  });
});
