import { describe, it, expect } from 'vitest';
import { reflectionMonthStats, reflectionMonths, reflectionArchive, reflectionArchiveText } from '../src/reflection.js';

const state = { startDate: '2026-08-01', days: {
  '2026-08-31': { self: 'x', selfReason: '지난달의 사유\n두 번째 문장' },
  '2026-09-01': { self: 'o', selfReason: 'O로 수정하기 전에 남긴 사유' },
  '2026-09-15': { self: null },
  '2026-09-16': { p: 100 },
  '2026-09-17': { self: 'x', selfReason: '' },
  '2026-09-18': { self: 'x', selfReason: '미래 날짜' }
} };

describe('만족도 추이와 아카이브', () => {
  it('오늘은 포함하고 미응답과 미래 날짜는 O 비율 분모에서 제외한다', () => {
    expect(reflectionMonthStats(state, '2026-09', '2026-09-17')).toEqual({
      month: '2026-09', o: 1, x: 1, total: 2, rate: 50
    });
    expect(reflectionMonthStats(state, '2026-07', '2026-09-17').rate).toBeNull();
    expect(reflectionMonths(state, '2026-09-17').map(row => row.month)).toEqual(['2026-09', '2026-08']);
  });

  it('월을 넘어 누적하고 O로 바꾼 날의 사유와 사유 없는 X도 보존한다', () => {
    const before = JSON.stringify(state);
    const entries = reflectionArchive(state, '2026-09-17');
    expect(entries.map(entry => entry.day)).toEqual(['2026-09-17', '2026-09-01', '2026-08-31']);
    expect(entries[0].reason).toBe('');
    expect(entries[1].answer).toBe('o');
    expect(entries[2].reason).toContain('\n두 번째 문장');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('전체 사유를 읽을 수 있는 파일로 내보내며 다른 루틴과 미래 기록은 제외한다', () => {
    const text = reflectionArchiveText(state, '2026-09-17');
    expect(text).toContain('전체 3건');
    expect(text).toContain('현재 O · 보관된 X 사유');
    expect(text).toContain('> 지난달의 사유\n> 두 번째 문장');
    expect(text).toContain('사유를 아직 적지 않았습니다.');
    expect(text).not.toContain('미래 날짜');
    expect(text).not.toContain('2026-09-16');
  });
});
