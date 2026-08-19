import { describe, it, expect } from 'vitest';
import {
  investmentReviewWindow, investmentReviewStatus, statusOf, completion
} from '../src/logic.js';

const FULL = { p: 100, s: 100, r: 20, w: null };

function st(start, days) {
  return { startDate: '2026-08-01', investmentReviewStart: start, days: days || {} };
}

describe('투자 원칙 주간 검토 — 언제든 체크, 금요일 판정', () => {
  it('월요일 시작 주간의 권장일과 마지막 날을 계산', () => {
    expect(investmentReviewWindow('2026-08-19')).toEqual({
      monday: '2026-08-17', thursday: '2026-08-20', friday: '2026-08-21', sunday: '2026-08-23'
    });
  });

  it('수요일 예정 → 목요일 진행 → 금요일 마감 → 토요일 미달', () => {
    const s = st('2026-08-19');
    expect(investmentReviewStatus(s, '2026-08-19').phase).toBe('upcoming');
    expect(investmentReviewStatus(s, '2026-08-20').phase).toBe('open');
    expect(investmentReviewStatus(s, '2026-08-21').phase).toBe('deadline');
    expect(investmentReviewStatus(s, '2026-08-22').phase).toBe('missed');
  });

  it('목요일 완료가 금요일에도 같은 주 완료로 공유', () => {
    const s = st('2026-08-19', { '2026-08-20': { ...FULL, i: true } });
    const thu = investmentReviewStatus(s, '2026-08-20');
    const fri = investmentReviewStatus(s, '2026-08-21');
    expect(thu).toMatchObject({ done: true, phase: 'done', reviewedOn: '2026-08-20' });
    expect(fri).toMatchObject({ done: true, phase: 'done', reviewedOn: '2026-08-20' });
  });

  it('월요일이나 수요일에 미리 완료해도 금요일 주간 완료로 인정', () => {
    const monday = st('2026-08-17', { '2026-08-17': { ...FULL, i: true } });
    expect(investmentReviewStatus(monday, '2026-08-21')).toMatchObject({
      done: true, reviewedOn: '2026-08-17'
    });

    const wednesday = st('2026-08-19', { '2026-08-19': { ...FULL, i: true } });
    expect(investmentReviewStatus(wednesday, '2026-08-21')).toMatchObject({
      done: true, reviewedOn: '2026-08-19'
    });
  });

  it('금요일에 처음 완료해도 주간 완료', () => {
    const s = st('2026-08-19', { '2026-08-21': { ...FULL, i: true } });
    expect(investmentReviewStatus(s, '2026-08-21')).toMatchObject({
      done: true, phase: 'done', reviewedOn: '2026-08-21'
    });
  });

  it('활성일 전 과거 금요일은 소급 미달 처리하지 않음', () => {
    const s = st('2026-08-19', { '2026-08-14': FULL });
    expect(investmentReviewStatus(s, '2026-08-14').active).toBe(false);
    expect(statusOf(s, '2026-08-14')).toBe('full');
  });

  it('활성 주 금요일 미완료면 전체 미달·달성률 75%, 완료하면 정상·100%', () => {
    const missed = st('2026-08-19', { '2026-08-21': FULL });
    expect(statusOf(missed, '2026-08-21')).toBe('miss');
    expect(completion(missed, '2026-08-21')).toBe(0.75);

    const done = st('2026-08-19', { '2026-08-21': { ...FULL, i: true } });
    expect(statusOf(done, '2026-08-21')).toBe('full');
    expect(completion(done, '2026-08-21')).toBe(1);
  });

  it('목요일은 미완료여도 일간 목표를 깎지 않음', () => {
    const s = st('2026-08-19', { '2026-08-20': FULL });
    expect(statusOf(s, '2026-08-20')).toBe('full');
    expect(completion(s, '2026-08-20')).toBe(1);
  });

  it('토요일에도 늦게 완료할 수 있지만 지난 금요일 미달은 소급 변경하지 않음', () => {
    const s = st('2026-08-19', {
      '2026-08-21': FULL,
      '2026-08-22': { ...FULL, i: true }
    });
    expect(investmentReviewStatus(s, '2026-08-22')).toMatchObject({
      done: true, reviewedOn: '2026-08-22'
    });
    expect(statusOf(s, '2026-08-21')).toBe('miss');
  });
});
