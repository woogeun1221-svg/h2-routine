import { describe, it, expect } from 'vitest';
import { buildStatePayload, applyServerPlans, daySummary } from '../src/botsync.js';
import { validateState } from '../src/storage.js';

const SUN = '2026-11-08', MON = '2026-11-09', TUE = '2026-11-10';
const FULL = { p: 100, t: 20, r: 20, w: null, c: 'o' };
function st(extra) {
  return {
    v: 2, startDate: '2026-10-01', pullupStart: '2026-10-19', squatEnd: '2026-10-29', postureStart: '2026-11-03',
    investmentReviewStart: '2026-11-03', rrSnapshotStart: '2026-11-03', exerciseSlotStart: SUN, days: {}, ...(extra || {})
  };
}

describe('buildStatePayload — 메인컨트롤 봇으로 보내는 요약', () => {
  it('오늘과 어제 요약, 이번 주와 다음 주 계획(물려받은 것은 u=0), 슬롯 시작일만 보낸다', () => {
    const s = st({
      plans: { '2026-11-02': { 1: 'noon', 2: 'run', 3: 'am', 4: 'am', 5: 'am', m1: '송은 생일', u: 11 } },
      days: { [SUN]: { ...FULL, self: 'x', selfReason: '비밀 사유' }, [MON]: { p: 60, t: 8, r: 10, c: 'o', e: 'am' } }
    });
    const body = buildStatePayload(s, MON);
    expect(Object.keys(body).sort()).toEqual(['days', 'plans', 'slotStart', 'today']);
    expect(body.today).toBe(MON);
    expect(body.slotStart).toBe(SUN);
    expect(body.days[MON]).toEqual({
      status: 'min', planned: 'noon', actual: 'am', slotRequired: true,
      full: ['푸쉬업 40', '턱걸이 12', '독서 10분'], min: [], wifeX: false
    });
    expect(body.days[SUN].status).toBe('full');
    expect(body.days[SUN].slotRequired).toBe(false);
    // 지난주 계획(직접 저장)과 이번 주, 다음 주(물려받음, u=0)
    expect(body.plans).toEqual({
      '2026-11-09': { 1: 'noon', 2: 'run', 3: 'am', 4: 'am', 5: 'am', u: 0 },
      '2026-11-16': { 1: 'noon', 2: 'run', 3: 'am', 4: 'am', 5: 'am', u: 0 },
      '2026-11-02': { 1: 'noon', 2: 'run', 3: 'am', 4: 'am', 5: 'am', u: 11 }
    });
    const text = JSON.stringify(body);
    for (const secret of ['송은 생일', '비밀 사유', 'selfReason', '"x"']) expect(text).not.toContain(secret);
    expect(text.length).toBeLessThan(4000); // 서버 POST 한도 8KB 안
  });

  it('시작일 전 어제는 빼고, 오래된 계획과 먼 미래 계획은 보내지 않는다', () => {
    const s = st({
      startDate: MON,
      plans: { '2026-09-07': { 1: 'run', 2: 'run', 3: 'run', 4: 'run', 5: 'run' }, '2026-12-28': { 1: 'am', 2: 'am', 3: 'am', 4: 'am', 5: 'am' } }
    });
    const body = buildStatePayload(s, MON);
    expect(Object.keys(body.days)).toEqual([MON]);
    expect(Object.keys(body.plans).sort()).toEqual(['2026-11-09', '2026-11-16']);
  });

  it('송은 X면 wifeX, 슬롯 시작 전 날은 slotRequired=false', () => {
    const s = st({ exerciseSlotStart: TUE, days: { [MON]: { ...FULL, w: 'x' } } });
    expect(daySummary(s, MON)).toMatchObject({ status: 'miss', wifeX: true, slotRequired: false });
  });
});

describe('applyServerPlans — 봇에서 바꾼 계획 받기(주 단위 마지막 수정 우선)', () => {
  it('서버 u가 더 크면 슬롯만 바꾸고 메모는 그대로, 같거나 작으면 그대로', () => {
    const s = st({ plans: { [MON]: { 1: 'am', 2: 'am', 3: 'am', 4: 'am', 5: 'am', m2: '송은 야근', u: 100 } } });
    expect(applyServerPlans(s, { [MON]: { 1: 'run', 2: 'noon', 3: 'am', 4: 'am', 5: 'am', u: 100 } })).toBe(0);
    expect(applyServerPlans(s, { [MON]: { 1: 'run', 2: 'noon', 3: 'am', 4: 'am', 5: 'am', u: 50 } })).toBe(0);
    expect(s.plans[MON][1]).toBe('am');
    expect(applyServerPlans(s, { [MON]: { 1: 'run', 2: 'noon', 3: 'am', 4: 'am', 5: 'am', u: 200 } })).toBe(1);
    expect(s.plans[MON]).toEqual({ 1: 'run', 2: 'noon', 3: 'am', 4: 'am', 5: 'am', m2: '송은 야근', u: 200 });
    expect(validateState(s)).toBe(null);
  });

  it('이 기기에 없던 주(물려받던 주)는 그 주 계획으로 만든다, 이상한 응답은 무시', () => {
    const s = st();
    expect(applyServerPlans(s, {
      '2026-11-16': { 1: 'noon', 2: 'noon', 3: 'noon', 4: 'noon', 5: 'noon', u: 1 },
      '2026-11-17': { 1: 'am', 2: 'am', 3: 'am', 4: 'am', 5: 'am', u: 9 },        // 월요일이 아님
      '2026-11-23': { 1: 'am', 2: 'am', 3: 'am', 4: 'am', 5: 'nap', u: 9 },       // 모르는 슬롯
      '2026-11-30': { 1: 'am', 2: 'am', 3: 'am', 4: 'am', 5: 'am', u: '9' }       // u 형식
    })).toBe(1);
    expect(Object.keys(s.plans)).toEqual(['2026-11-16']);
    expect(applyServerPlans(s, null)).toBe(0);
    expect(applyServerPlans(s, [])).toBe(0);
  });
});

describe('storage — plans.u 검증', () => {
  it('u는 0 이상 숫자만', () => {
    const s = st({ plans: { [MON]: { 1: 'am', u: 5 } } });
    expect(validateState(s)).toBe(null);
    expect(validateState(st({ plans: { [MON]: { 1: 'am', u: -1 } } }))).toContain('.u 값 오류');
    expect(validateState(st({ plans: { [MON]: { 1: 'am', u: '5' } } }))).toContain('.u 값 오류');
  });
});
