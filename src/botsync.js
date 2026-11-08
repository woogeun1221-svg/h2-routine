/* 메인컨트롤 봇과 주고받는 상태(2026-11-08) — 알림 서버 POST /state 로 보내는 요약과, 서버가 돌려준 계획을 적용하는 규칙.
   보내는 것: 오늘과 어제의 포지션(정상, 최소, 미달)과 남은 항목 문구, 그날 계획 슬롯과 실제 슬롯,
             이번 주와 다음 주 계획 슬롯(물려받은 계획도), 최근 직접 저장한 주의 계획 슬롯, 슬롯 조건 시작일.
   보내지 않는 것: 메모(송은 일정), 하루 만족도 O/X와 사유, 수치 원본.
   계획은 주 단위로 마지막 슬롯 수정이 이긴다: plans[월요일].u(밀리초)가 큰 쪽, 메모 수정은 u를 바꾸지 않는다. 봇에서 바꾼 계획은 서버 u가 커서
   앱이 다음 동기화(앱을 열 때, 화면이 켜진 동안 1분마다) 때 받아 적용한다. 메모는 이 기기 것을 그대로 둔다. */
import { EXERCISE_SLOT, shift, mondayOf, planFor, plannedSlot, statusOf, gapsOf, slotRequired, getDay, isSlot } from './logic.js';

var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var GAP_MAX = 12;

export function daySummary(state, ds) {
  var gaps = gapsOf(state, ds), e = getDay(state, ds).e;
  return {
    status: statusOf(state, ds),
    planned: plannedSlot(state, ds),
    actual: isSlot(e) ? e : null,
    slotRequired: slotRequired(state, ds),
    full: gaps.full.slice(0, GAP_MAX),
    min: gaps.min.slice(0, GAP_MAX),
    wifeX: gaps.wifeX
  };
}

function planEntry(state, monday) {
  var plan = planFor(state, monday), own = state.plans && state.plans[monday];
  var entry = { u: own && typeof own.u === 'number' ? own.u : 0 };
  for (var wd = 1; wd <= 5; wd++) entry[wd] = plan[wd];
  return entry;
}

export function buildStatePayload(state, t) {
  var days = {};
  [t, shift(t, -1)].forEach(function (ds) { if (ds >= state.startDate) days[ds] = daySummary(state, ds); });
  var thisMonday = mondayOf(t), plans = {};
  // 이번 주와 다음 주는 물려받은 계획이라도 보낸다(u=0). 봇이 앱과 같은 시간표를 보여 주도록.
  [thisMonday, shift(thisMonday, 7)].forEach(function (m) { plans[m] = planEntry(state, m); });
  // 지난주부터 4주 뒤까지 직접 저장한 계획
  var from = shift(thisMonday, -7), to = shift(thisMonday, 28);
  Object.keys(state.plans || {}).sort().forEach(function (m) {
    if (m >= from && m <= to && !plans[m]) plans[m] = planEntry(state, m);
  });
  var since = state[EXERCISE_SLOT.startKey];
  return { today: t, days: days, plans: plans, slotStart: typeof since === 'string' ? since : null };
}

/* 서버 계획 적용 — 서버 u가 이 기기 u보다 클 때만 그 주 슬롯을 바꾼다. 바뀐 주 수를 돌려준다. */
export function applyServerPlans(state, plans) {
  if (!plans || typeof plans !== 'object' || Array.isArray(plans)) return 0;
  var changed = 0;
  Object.keys(plans).forEach(function (monday) {
    var sp = plans[monday], wd;
    if (!DATE_RE.test(monday) || mondayOf(monday) !== monday) return;
    if (!sp || typeof sp !== 'object' || typeof sp.u !== 'number' || !isFinite(sp.u)) return;
    for (wd = 1; wd <= 5; wd++) if (!isSlot(sp[wd])) return;
    var own = state.plans && state.plans[monday];
    var localU = own && typeof own.u === 'number' ? own.u : 0;
    if (sp.u <= localU) return;
    var next = own ? Object.assign({}, own) : {};
    for (wd = 1; wd <= 5; wd++) next[wd] = sp[wd];
    next.u = sp.u;
    if (!state.plans) state.plans = {};
    state.plans[monday] = next;
    changed++;
  });
  return changed;
}
