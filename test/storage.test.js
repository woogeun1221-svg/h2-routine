import { describe, it, expect, beforeEach, vi } from 'vitest';

/* Node 25의 자체 localStorage 전역(비활성 상태)과 충돌하지 않도록
   인메모리 목을 명시적으로 주입 — storage.js 로직 자체를 검증한다. */
const mem = new Map();
vi.stubGlobal('localStorage', {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }
});

const { load, save } = await import('../src/storage.js');
const KEY = 'h2-routine-v1';

describe('load — 손상 데이터 처리', () => {
  beforeEach(() => mem.clear());

  it('정상 데이터는 그대로 로드', () => {
    const state = { startDate: '2026-06-29', days: { '2026-06-29': { p: 100, s: 100, r: 20, w: 'o' } } };
    mem.set(KEY, JSON.stringify(state));
    expect(load('2026-07-23')).toEqual(state);
    expect(mem.has(KEY + '.bak')).toBe(false);
  });

  it('저장된 게 없으면 fresh state (백업 없음)', () => {
    const s = load('2026-07-23');
    expect(s.startDate).toBe('2026-07-23');
    expect(s.days).toEqual({});
    expect(mem.has(KEY + '.bak')).toBe(false);
  });

  it('깨진 JSON이면 원본을 .bak에 보존하고 fresh 반환', () => {
    mem.set(KEY, '{broken');
    const s = load('2026-07-23');
    expect(s.days).toEqual({});
    expect(mem.get(KEY + '.bak')).toBe('{broken');
  });

  it('스키마 불일치도 .bak에 보존', () => {
    const bad = JSON.stringify({ startDate: 'nope', days: {} });
    mem.set(KEY, bad);
    load('2026-07-23');
    expect(mem.get(KEY + '.bak')).toBe(bad);
  });

  it('save 후 load 라운드트립', () => {
    const state = { startDate: '2026-07-01', days: { '2026-07-22': { p: 30, s: 30, r: 5, w: null } } };
    save(state);
    expect(load('2026-07-23')).toEqual(state);
  });
});
