// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderReflection, renderReflectionHistory, REFLECTION_QUESTION } from '../src/views/reflection.js';
import { importText, exportText, validateState } from '../src/storage.js';
import { statusOf, todayStr } from '../src/logic.js';

const day = '2026-09-17';
const full = { p: 100, s: 100, r: 20, w: 'o' };
const handlers = { setReflection: vi.fn(), setReflectionReason: vi.fn() };

describe('하루 만족도', () => {
  beforeEach(() => {
    document.body.innerHTML = '<section id="reflection"></section><section id="reflectionHistory"></section>';
    vi.clearAllMocks();
  });

  it('기존 기록에 소급 응답을 만들지 않고 미선택 O/X를 표시한다', () => {
    const state = { startDate: day, days: { [day]: full } };
    renderReflection(state, day, handlers);
    expect(document.querySelector('h2').textContent).toBe(REFLECTION_QUESTION);
    expect(document.querySelectorAll('[aria-pressed="false"]').length).toBe(2);
    expect(document.querySelector('textarea')).toBeNull();
    document.querySelector('[aria-label="X 만족하지 못했다"]').click();
    expect(handlers.setReflection).toHaveBeenCalledWith(day, 'x');
    expect(state.days[day]).toEqual(full);
  });

  it('X 이유의 한글 입력을 즉시 전달하며 선택 취소를 지원한다', () => {
    const state = { startDate: day, days: { [day]: { ...full, self: 'x', selfReason: '미뤘다' } } };
    renderReflection(state, day, handlers);
    const textarea = document.querySelector('textarea');
    expect(textarea.value).toBe('미뤘다');
    textarea.value = '하고 싶은 일을 미뤘다.\n내 기준에 부족했다.';
    textarea.dispatchEvent(new Event('input'));
    expect(handlers.setReflectionReason).toHaveBeenCalledWith(day, textarea.value);
    expect(document.querySelector('textarea')).toBe(textarea);
    document.querySelector('.reset').click();
    expect(handlers.setReflection).toHaveBeenCalledWith(day, null);
  });

  it('O/X·이유는 백업 왕복을 보존하고 기존 달성 판정은 바꾸지 않는다', () => {
    const state = { startDate: day, investmentReviewStart: day,
      days: { [day]: { ...full, self: 'x', selfReason: '핵심 일을 미룸' } } };
    expect(importText(exportText(state), day)).toEqual(state);
    expect(statusOf(state, day)).toBe('full');
    expect(validateState({ ...state, days: { [day]: { self: true } } })).toContain('.self');
    expect(validateState({ ...state, days: { [day]: { selfReason: {} } } })).toContain('.selfReason');
  });

  it('이전 달 기록과 HTML 입력을 안전하게 다시 보여준다', () => {
    const state = { startDate: day, days: {
      [day]: { self: 'x', selfReason: '<img src=x onerror=alert(1)>' },
      '2026-08-31': { self: 'o' }
    } };
    renderReflectionHistory(state, '2026-09');
    expect(document.querySelectorAll('details').length).toBe(1);
    expect(document.querySelector('details p').textContent).toContain('<img');
    expect(document.querySelector('img')).toBeNull();
    renderReflectionHistory(state, '2026-08');
    expect(document.querySelector('summary').textContent).toBe('08.31 · O');
  });

  it('한국 자정에 날짜가 바뀐다', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-17T14:59:59Z'));
      expect(todayStr()).toBe('2026-09-17');
      vi.setSystemTime(new Date('2026-09-17T15:00:00Z'));
      expect(todayStr()).toBe('2026-09-18');
    } finally { vi.useRealTimers(); }
  });
});
