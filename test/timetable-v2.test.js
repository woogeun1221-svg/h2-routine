import { describe, it, expect } from 'vitest';
import {
  SLOTS, SLOT_ORDER, EXERCISE_SLOT, isoWeek, mondayOf, isWeekend, dow, seoulHour, planFor, hasOwnPlan, plannedSlot,
  slotRequired, defaultPlanOffset, statusOf, completion, streak, monthFullRate, monthlyRows, calMonth, dayRecorded,
  gapsOf, slotGuidance
} from '../src/logic.js';
import { freshState, importText, exportText, validateState, mergeStates } from '../src/storage.js';

/* v2 주간 운동 시간표(2026-11-08). 평일은 슬롯 하나를 해야 정상, 최소엔 영향 없음, 주말은 조건 없음.
   exerciseSlotStart(처음 연 날)부터만 판정해 지난 평일 정상을 소급해 바꾸지 않는다.
   날짜: 2026-11-08 일(W45 끝), 11-09 월(W46), 11-14 토. */
const START = '2026-11-08';
const MON = '2026-11-09', TUE = '2026-11-10', WED = '2026-11-11', THU = '2026-11-12', FRI = '2026-11-13', SAT = '2026-11-14';
const FULL = { p: 100, t: 20, r: 20, w: null, c: 'o' };   // 스쿼트 은퇴, 턱걸이, 가슴 펴기 이후의 정상 하루
const MIN = { p: 30, t: 5, r: 5, w: null, c: 'o' };
function st(days, extra) {
  return {
    startDate: '2026-10-01', pullupStart: '2026-10-19', squatEnd: '2026-10-29', postureStart: '2026-11-03',
    exerciseSlotStart: START, days: days || {}, ...(extra || {})
  };
}

describe('ISO 주차 — 노션 플래너와 같은 번호 (완료 조건 5)', () => {
  it('2026-11-02~08 = 45주, 2026-11-09 = 46주', () => {
    expect(isoWeek('2026-11-02')).toBe(45);
    expect(isoWeek(START)).toBe(45);
    expect(isoWeek(MON)).toBe(46);
    expect(isoWeek('2026-11-15')).toBe(46);
  });
  it('연말연초 경계: 2026은 목요일 시작이라 53주까지, 2027-01-01은 2026년 53주', () => {
    expect(isoWeek('2025-12-29')).toBe(1);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2026-12-31')).toBe(53);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
  });
  it('요일, 월요일, 주말 헬퍼', () => {
    expect(dow(START)).toBe(0);
    expect(dow(MON)).toBe(1);
    expect(mondayOf(START)).toBe('2026-11-02');
    expect(mondayOf(MON)).toBe(MON);
    expect(mondayOf(SAT)).toBe(MON);
    expect(isWeekend(SAT)).toBe(true);
    expect(isWeekend(START)).toBe(true);
    expect(isWeekend(FRI)).toBe(false);
  });
  it('seoulHour는 기기 시간대와 무관하게 한국 시간', () => {
    expect(seoulHour(new Date('2026-11-09T01:30:00Z'))).toBe(10);
    expect(seoulHour(new Date('2026-11-08T15:00:00Z'))).toBe(0);
    expect(seoulHour(new Date('2026-11-09T12:59:00Z'))).toBe(21);
  });
});

describe('시간표 기본 주 — 토일에 열면 다음 주 (완료 조건 1)', () => {
  it('일요일, 토요일은 1(다음 주), 평일은 0(이번 주)', () => {
    expect(defaultPlanOffset(START)).toBe(1);
    expect(defaultPlanOffset(SAT)).toBe(1);
    expect(defaultPlanOffset(MON)).toBe(0);
    expect(defaultPlanOffset(FRI)).toBe(0);
  });
});

describe('planFor — 계획 없는 주는 직전 계획을 물려받고, 그것도 없으면 전부 아침', () => {
  it('계획이 하나도 없으면 전부 아침', () => {
    expect(planFor(st(), MON)).toEqual({ 1: 'am', 2: 'am', 3: 'am', 4: 'am', 5: 'am' });
    expect(planFor({ startDate: '2026-10-01', days: {} }, MON)).toEqual({ 1: 'am', 2: 'am', 3: 'am', 4: 'am', 5: 'am' });
    expect(hasOwnPlan(st(), MON)).toBe(false);
  });
  it('직전 주의 슬롯은 물려받고 메모는 물려받지 않는다', () => {
    const s = st({}, { plans: { '2026-11-02': { 1: 'noon', 2: 'run', 3: 'am', 4: 'am', 5: 'noon', m1: '송은 회식' } } });
    expect(planFor(s, MON)).toEqual({ 1: 'noon', 2: 'run', 3: 'am', 4: 'am', 5: 'noon' });
    expect(planFor(s, '2026-11-02')).toEqual({ 1: 'noon', 2: 'run', 3: 'am', 4: 'am', 5: 'noon', m1: '송은 회식' });
    expect(hasOwnPlan(s, '2026-11-02')).toBe(true);
  });
  it('가장 가까운 이전 계획을 쓰고, 이후 주의 계획은 영향이 없다', () => {
    const s = st({}, {
      plans: {
        '2026-10-26': { 1: 'run', 2: 'run', 3: 'run', 4: 'run', 5: 'run' },
        '2026-11-02': { 1: 'noon', 2: 'noon', 3: 'noon', 4: 'noon', 5: 'noon' },
        '2026-11-23': { 1: 'am', 2: 'run', 3: 'am', 4: 'run', 5: 'am' }
      }
    });
    expect(planFor(s, '2026-11-16')[1]).toBe('noon');
    expect(planFor(s, '2026-10-19')[1]).toBe('am'); // 그 전 계획 없음
    expect(planFor(s, '2026-11-30')[2]).toBe('run');
  });
  it('plannedSlot — 주말은 null, 평일은 그 요일 계획', () => {
    const s = st({}, { plans: { [MON]: { 1: 'am', 2: 'noon', 3: 'run', 4: 'am', 5: 'am' } } });
    expect(plannedSlot(s, TUE)).toBe('noon');
    expect(plannedSlot(s, WED)).toBe('run');
    expect(plannedSlot(s, SAT)).toBe(null);
    expect(plannedSlot(s, '2026-11-15')).toBe(null);
  });
  it('정의 — 슬롯 세 개와 활성일 키', () => {
    expect(SLOT_ORDER).toEqual(['am', 'noon', 'run']);
    expect(SLOTS).toEqual({ am: '아침', noon: '점심', run: '저녁런닝' });
    expect(EXERCISE_SLOT).toMatchObject({ key: 'e', startKey: 'exerciseSlotStart' });
  });
});

describe('statusOf — 평일 운동 슬롯은 정상 조건 (완료 조건 2)', () => {
  it('평일: 습관 모두 정상 + 슬롯 미완료 → 최소, 슬롯 완료 → 정상', () => {
    expect(statusOf(st({ [MON]: FULL }), MON)).toBe('min');
    expect(statusOf(st({ [MON]: { ...FULL, e: 'am' } }), MON)).toBe('full');
    expect(statusOf(st({ [MON]: { ...FULL, e: 'run' } }), MON)).toBe('full'); // 계획과 달라도 완료
  });
  it('토요일: 습관 모두 정상이면 슬롯 없이 정상', () => {
    expect(statusOf(st({ [SAT]: FULL }), SAT)).toBe('full');
    expect(statusOf(st({ [SAT]: { ...FULL, e: 'noon' } }), SAT)).toBe('full');
  });
  it('최소, 미달은 슬롯과 무관', () => {
    expect(statusOf(st({ [MON]: MIN }), MON)).toBe('min');
    expect(statusOf(st({ [MON]: { ...MIN, e: 'am' } }), MON)).toBe('min');
    expect(statusOf(st({ [MON]: { e: 'am' } }), MON)).toBe('miss');
    expect(statusOf(st({ [MON]: { ...FULL, e: 'am', w: 'x' } }), MON)).toBe('miss');
  });
  it('활성일 전 평일은 소급하지 않는다 — 슬롯 없이도 정상 그대로', () => {
    expect(statusOf(st({ '2026-11-06': FULL }), '2026-11-06')).toBe('full');
    expect(slotRequired(st(), '2026-11-06')).toBe(false);
    expect(slotRequired(st(), MON)).toBe(true);
    expect(slotRequired(st(), SAT)).toBe(false);
    expect(slotRequired({ startDate: '2026-10-01', days: {} }, MON)).toBe(false); // 활성일 없는 옛 상태
  });
  it('스트릭은 슬롯과 무관(슬롯은 미달을 만들지 않는다), 이달 정상률은 슬롯을 따른다', () => {
    const days = { [MON]: FULL, [TUE]: { ...FULL, e: 'noon' }, [WED]: FULL };
    expect(streak(st(days), THU)).toBe(3);
    expect(monthFullRate(st(days, { startDate: MON }), THU)).toBe(33); // 월 최소, 화 정상, 수 최소
  });
  it('completion: 평일 슬롯도 정상까지의 진척에 들어간다', () => {
    expect(completion(st({ [MON]: FULL }), MON)).toBeCloseTo(4 / 5);
    expect(completion(st({ [MON]: { ...FULL, e: 'am' } }), MON)).toBeCloseTo(1);
    expect(completion(st({ [SAT]: FULL }), SAT)).toBeCloseTo(1);
  });
  it('슬롯만 눌러도 오늘은 기록 있음 — 캘린더가 진행중이 아니라 현재 상태', () => {
    expect(dayRecorded(st({ [MON]: { e: 'am' } }), MON)).toBe(true);
    expect(dayRecorded(st({}), MON)).toBe(false);
    const cells = calMonth(st({ [MON]: { e: 'am' } }), '2026-11', MON).cells;
    expect(cells[8]).toMatchObject({ ds: MON, kind: 'miss' });
  });
});

describe('gapsOf — 정상까지, 최소까지', () => {
  it('평일 습관만 다 했으면 정상까지 = 운동 슬롯', () => {
    expect(gapsOf(st({ [MON]: FULL }), MON)).toEqual({ full: ['운동 슬롯'], min: [], wifeX: false });
  });
  it('빈 평일: 정상까지와 최소까지가 각각 남은 양', () => {
    expect(gapsOf(st(), MON)).toEqual({
      full: ['운동 슬롯', '푸쉬업 100', '턱걸이 20', '독서 20분', '가슴 펴기 O'],
      min: ['푸쉬업 30', '턱걸이 5', '독서 5분', '가슴 펴기 O'],
      wifeX: false
    });
  });
  it('토요일은 슬롯이 없고, 금요일 미완료 주간 항목은 둘 다에 들어간다', () => {
    expect(gapsOf(st({ [SAT]: { ...FULL, p: 90 } }), SAT).full).toEqual(['푸쉬업 10']);
    const fri = gapsOf(st({ [FRI]: { ...FULL, e: 'am' } }, { investmentReviewStart: START }), FRI);
    expect(fri.full).toEqual(['투자 원칙 검토']);
    expect(fri.min).toEqual(['투자 원칙 검토']);
  });
  it('송은 X면 표시', () => {
    expect(gapsOf(st({ [MON]: { ...FULL, w: 'x' } }), MON).wifeX).toBe(true);
  });
});

describe('slotGuidance — 시간 경과 안내(한국 시간)', () => {
  const plan = { [MON]: { 1: 'am', 2: 'noon', 3: 'run', 4: 'am', 5: 'am' } };
  const s = (days) => st(days, { plans: plan });
  it('아침 계획: 10시 전 대기, 10시 지나면 점심 → 퇴근 런닝, 14시 지나면 퇴근 런닝, 21시 지나면 마감', () => {
    expect(slotGuidance(s(), MON, 9, true)).toEqual({ tone: 'plan', text: '슬롯을 비우면 오늘은 최소 포지션까지만 찍힌다.' });
    expect(slotGuidance(s(), MON, 10, true)).toEqual({ tone: 'warn', text: '아침 슬롯 지남. 백업 순서: 점심 → 퇴근 런닝.' });
    expect(slotGuidance(s(), MON, 14, true)).toEqual({ tone: 'warn', text: '아침 슬롯 지남. 백업: 퇴근 런닝.' });
    expect(slotGuidance(s(), MON, 21, true)).toEqual({ tone: 'lost', text: '오늘 슬롯 비었음. 최소 포지션(푸쉬업, 턱걸이)으로 마감.' });
  });
  it('점심 계획 14시, 저녁런닝 계획 21시', () => {
    expect(slotGuidance(s(), TUE, 13, true).tone).toBe('plan');
    expect(slotGuidance(s(), TUE, 14, true)).toEqual({ tone: 'warn', text: '점심 슬롯 지남. 백업: 퇴근 런닝.' });
    expect(slotGuidance(s(), WED, 20, true).tone).toBe('plan');
    expect(slotGuidance(s(), WED, 21, true)).toEqual({ tone: 'lost', text: '오늘 슬롯 비었음. 최소 포지션(푸쉬업, 턱걸이)으로 마감.' });
  });
  it('완료: 계획대로, 또는 계획 아침 → 실제 점심', () => {
    expect(slotGuidance(s({ [MON]: { e: 'am' } }), MON, 22, true)).toEqual({ tone: 'done', text: '계획대로 완료.' });
    expect(slotGuidance(s({ [MON]: { e: 'noon' } }), MON, 12, true)).toEqual({ tone: 'done', text: '계획 아침 → 실제 점심.' });
  });
  it('주말은 시간표 없음, 지난 평일은 시각과 무관하게 비었음', () => {
    expect(slotGuidance(s(), SAT, 12, true)).toEqual({ tone: 'off', text: '시간표 없음. 했으면 기록만, 상태엔 영향 없음.' });
    expect(slotGuidance(s({ [SAT]: { e: 'noon' } }), SAT, 12, true)).toEqual({ tone: 'done', text: '점심 기록됨. 주말은 상태에 영향 없음.' });
    expect(slotGuidance(s(), MON, 3, false)).toEqual({ tone: 'lost', text: '슬롯 비었음. 그날은 최소 포지션까지만 찍힌다.' });
  });
  it('문구에 가운뎃점이 없다', () => {
    for (const hour of [0, 9, 10, 13, 14, 20, 21, 23]) {
      for (const ds of [MON, TUE, WED, SAT]) expect(slotGuidance(s(), ds, hour, true).text).not.toContain('·');
    }
  });
});

describe('월별 장부 — 운동 슬롯 n/N, 송은 X (확정일 기준, 오늘 제외)', () => {
  it('슬롯 조건이 있는 평일만 분모, 활성일 전과 주말, 오늘은 빠진다', () => {
    const s = st({
      '2026-11-06': FULL, [START]: FULL, [MON]: { ...FULL, e: 'am' }, [TUE]: FULL,
      [WED]: { ...FULL, e: 'noon', w: 'x' }, [THU]: { ...FULL, e: 'am' }
    });
    const nov = monthlyRows(s, THU)[0];
    expect(nov).toMatchObject({ label: '26.11', slotDone: 2, slotDays: 3, wifeX: 1 });
    const oct = monthlyRows(s, THU)[1];
    expect(oct).toMatchObject({ label: '26.10', slotDone: 0, slotDays: 0, wifeX: 0 });
  });
});

describe('저장 스키마 v2 — e, plans, exerciseSlotStart, v', () => {
  it('freshState와 옛 백업 가져오기에 v2 필드를 채우고 기록은 그대로', () => {
    expect(freshState(START)).toMatchObject({ v: 2, exerciseSlotStart: START });
    const old = { startDate: '2026-06-29', pullupStart: '2026-10-19', days: { '2026-06-29': { p: 100, s: 100, r: 20, w: 'o' } } };
    const s = importText(JSON.stringify(old), START);
    expect(s.v).toBe(2);
    expect(s.exerciseSlotStart).toBe(START);
    expect(s.days).toEqual(old.days);
    expect(s.plans).toBe(undefined);
  });
  it('e는 am, noon, run, null만', () => {
    const base = { startDate: '2026-06-29', days: {} };
    for (const e of ['am', 'noon', 'run', null]) expect(validateState({ ...base, days: { [MON]: { e } } })).toBe(null);
    expect(validateState({ ...base, days: { [MON]: { e: 'gym' } } })).toContain('.e');
    expect(validateState({ ...base, days: { [MON]: { e: 'toString' } } })).toContain('.e');
  });
  it('plans: 키는 월요일 날짜, 슬롯 값, 메모 문자열 검증', () => {
    const base = { startDate: '2026-06-29', days: {} };
    expect(validateState({ ...base, plans: { [MON]: { 1: 'am', 5: 'run', m3: '송은 병원' } } })).toBe(null);
    expect(validateState({ ...base, plans: { [TUE]: { 1: 'am' } } })).toContain('월요일');
    expect(validateState({ ...base, plans: { 'x': {} } })).toContain('plans');
    expect(validateState({ ...base, plans: { [MON]: { 2: 'gym' } } })).toContain(MON + '.2 ');
    expect(validateState({ ...base, plans: { [MON]: { m1: 3 } } })).toContain('.m1');
    expect(validateState({ ...base, plans: { [MON]: { m1: 'x'.repeat(501) } } })).toContain('.m1');
    expect(validateState({ ...base, plans: [] })).toContain('plans');
  });
  it('v는 없거나 1, 2만', () => {
    const base = { startDate: '2026-06-29', days: {} };
    expect(validateState({ ...base, v: 2 })).toBe(null);
    expect(validateState({ ...base, v: 1 })).toBe(null);
    expect(validateState({ ...base, v: 3 })).toContain('버전');
  });
  it('내보내기 왕복 보존', () => {
    const s = { ...st({ [MON]: { ...FULL, e: 'noon' } }, {
      investmentReviewStart: START, rrSnapshotStart: START,
      plans: { [MON]: { 1: 'am', 2: 'noon', 3: 'run', 4: 'am', 5: 'am', m1: '메모' } }
    }), v: 2 };
    expect(importText(exportText(s), THU)).toEqual(s);
  });
});

describe('가져오기 = 합치기 (v2 명세)', () => {
  const device = {
    v: 2, startDate: '2026-10-01', pullupStart: '2026-10-19', squatEnd: '2026-10-29', postureStart: '2026-11-03',
    investmentReviewStart: '2026-10-01', rrSnapshotStart: '2026-10-29', exerciseSlotStart: START,
    settings: { p: { target: 120, min: 40 } },
    days: {
      '2026-11-07': { p: 100, t: 20, r: 20, w: null, c: 'o', self: 'x', selfReason: '사유는 남아야 한다' },
      [START]: { p: 50, t: 10, r: 10, w: null, c: 'o' }
    },
    plans: { [MON]: { 1: 'noon', 2: 'noon', 3: 'noon', 4: 'noon', 5: 'noon', m1: '기기 메모' } }
  };

  it('v1 샘플을 합치면 월별 장부에 그 기록이 나타난다 (완료 조건 4)', () => {
    const v1 = JSON.stringify({
      startDate: '2026-07-01',
      days: {
        '2026-07-01': { p: 100, s: 100, r: 20, w: 'o' },
        '2026-07-02': { p: 30, s: 30, r: 5, w: null },
        '2026-07-03': { p: 0, s: 0, r: 0, w: 'x' }
      }
    });
    const merged = mergeStates(device, importText(v1, START));
    expect(merged.added).toBe(3);
    expect(merged.overwritten).toBe(0);
    expect(merged.state.startDate).toBe('2026-07-01');
    const rows = monthlyRows(merged.state, START);
    expect(rows.map(r => r.label)).toEqual(['26.11', '26.10', '26.09', '26.08', '26.07']);
    // 7월 31일이 전부 장부에 들어간다. 판정 기준은 이 기기 목표치(아래 테스트), 3일은 송은 X
    const jul = rows[4];
    expect(jul).toMatchObject({ label: '26.07', slotDays: 0, wifeX: 1 });
    expect(jul.full + jul.min + jul.miss).toBe(31);
  });

  it('목표치는 기기 설정을 유지하고(v1에는 settings가 없다) 그 기준으로 판정한다', () => {
    const v1 = JSON.stringify({ startDate: '2026-07-01', days: { '2026-07-01': { p: 100, s: 100, r: 20, w: 'o' } } });
    const merged = mergeStates(device, importText(v1, START)).state;
    expect(merged.settings).toEqual(device.settings);
    expect(statusOf(merged, '2026-07-01')).toBe('min'); // 기기 목표 120회 기준
  });

  it('같은 날짜는 가져온 값으로 덮어쓰되 가져온 쪽에 없는 항목(만족도 사유)은 남는다', () => {
    const backup = JSON.stringify({ startDate: '2026-11-01', days: { '2026-11-07': { p: 10, t: 0, r: 0, w: 'x', c: 'x' } } });
    const merged = mergeStates(device, importText(backup, START));
    expect(merged.overwritten).toBe(1);
    expect(merged.state.days['2026-11-07']).toEqual({ p: 10, t: 0, r: 0, w: 'x', c: 'x', self: 'x', selfReason: '사유는 남아야 한다' });
    expect(merged.state.days[START]).toEqual(device.days[START]);
    expect(merged.state.startDate).toBe('2026-10-01'); // 더 이른 쪽
  });

  it('활성일, 종료일은 더 이른 쪽 — 새 기기에 전체 백업을 들이면 백업의 날짜가 이긴다', () => {
    const fresh = freshState('2026-12-01');
    const merged = mergeStates(fresh, importText(exportText(device), '2026-12-01')).state;
    expect(merged.pullupStart).toBe('2026-10-19');
    expect(merged.squatEnd).toBe('2026-10-29');
    expect(merged.exerciseSlotStart).toBe(START);
    expect(merged.settings).toEqual(device.settings);
    expect(merged.plans).toEqual(device.plans);
    expect(merged.days).toEqual(device.days);
    // 옛 v1 JSON(활성일 없음 → 오늘로 채워짐)을 들여도 기기의 이른 활성일이 남는다
    const again = mergeStates(device, importText(JSON.stringify({ startDate: '2026-07-01', days: {} }), '2026-12-01')).state;
    expect(again.exerciseSlotStart).toBe(START);
    expect(again.pullupStart).toBe('2026-10-19');
  });

  it('routine-v2 프로토타입 JSON: e와 plans는 들어오고 targets는 버린다(목표치는 기기 설정)', () => {
    const proto = JSON.stringify({
      v: 2, startDate: START, targets: { p: 50, pm: 10, s: 100, sm: 30, r: 20, rm: 5 },
      days: { [MON]: { p: 100, s: 100, r: 20, w: null, e: 'noon' } },
      plans: { [MON]: { 1: 'am', 2: 'noon', 3: 'run', 4: 'am', 5: 'am', m2: '송은 야근' } }
    });
    const merged = mergeStates(device, importText(proto, MON));
    expect(merged.state.targets).toBe(undefined);
    expect(merged.state.settings).toEqual(device.settings);
    expect(merged.state.days[MON].e).toBe('noon');
    expect(merged.state.plans[MON]).toEqual({ 1: 'am', 2: 'noon', 3: 'run', 4: 'am', 5: 'am', m2: '송은 야근' });
    expect(validateState(merged.state)).toBe(null);
  });

  it('원본 state는 바꾸지 않는다', () => {
    const before = JSON.stringify(device);
    mergeStates(device, importText(JSON.stringify({ startDate: '2026-07-01', days: { [START]: { p: 1 } } }), START));
    expect(JSON.stringify(device)).toBe(before);
  });
});
