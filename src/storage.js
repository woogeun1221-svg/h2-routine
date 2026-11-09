/* localStorage 저장 + JSON 내보내기/가져오기. v1 스키마에 선택 필드만 추가:
   { v?, startDate, investmentReviewStart?, rrSnapshotStart?, pullupStart?, squatEnd?, postureStart?, exerciseSlotStart?,
     days: { date: { p, s, t?, r, w, c?, i?, rr?, e? } }, plans?: { 월요일: { 1..5, m1..m5 } }, settings? }
   i=true는 그날 투자 원칙 주간 검토를, rr=true는 그날 손익비 스냅샷(2026-10-29 추가)을 완료했다는 뜻이며 요일 제한은 없다.
   t는 턱걸이(2026-10-19 추가). pullupStart는 턱걸이가 판정에 들어가는 첫날로, 처음 연 날에 채운다.
   squatEnd는 스쿼트(2026-10-29 은퇴)가 판정에서 빠지는 첫날로, 역시 처음 연 날에 채운다. 그 전 기록의 s는 그대로 판정한다.
   c는 가슴 펴기(2026-11-03 추가) o/x/null 체크이며 postureStart(처음 연 날)부터 O여야 통과한다.
   self=o/x/null, selfReason은 하루 만족도 선택/이유이며 기존 루틴 판정과 별개다.
   v2(2026-11-08): e는 그날 실제로 한 운동 슬롯(am, noon, run), plans는 월요일 날짜를 키로 한 주간 시간표,
   exerciseSlotStart는 평일 슬롯이 정상 조건에 들어가는 첫날(처음 연 날). 저장 키는 그대로 두고 필드만 덧붙인다.
   27 담금질(2026-11-09, src/forge.js): bk, wr, stk는 그날 끝낸 책, 글, 종목 제목(문자열), fx는 그날 운동 O(불리언). 판정과 무관. */
import { HABITS, WEEKLIES, CHECKS, EXERCISE_SLOT, isSlot, mondayOf } from './logic.js';
import { FORGE_TEXT_KEYS, FORGE_TITLE_MAX } from './forge.js';

var STORE_KEY = 'h2-routine-v1';
export var SCHEMA_VERSION = 2;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var MEMO_MAX = 500;
var HABIT_KEYS = HABITS.map(function (h) { return h.key; });
/* 기능 활성일, 종료일 필드 — 없으면 처음 연 날로 채워 기존 기록을 소급 판정하지 않는다 */
var WEEKLY_KEYS = WEEKLIES.map(function (w) { return w.key; });
var CHECK_KEYS = CHECKS.map(function (c) { return c.key; });
var START_KEYS = WEEKLIES.map(function (w) { return w.startKey; }).concat(
  HABITS.filter(function (h) { return h.startKey; }).map(function (h) { return h.startKey; }),
  HABITS.filter(function (h) { return h.endKey; }).map(function (h) { return h.endKey; }),
  CHECKS.map(function (c) { return c.startKey; }),
  [EXERCISE_SLOT.startKey]);

export function freshState(today) {
  var state = { v: SCHEMA_VERSION, startDate: today, days: {} };
  START_KEYS.forEach(function (k) { state[k] = today; });
  return state;
}

/* v1 → v2 이행: 빠진 활성일만 채우고 버전 표시. 기존 기록과 목표치는 손대지 않는다. */
function activateFeatures(state, today) {
  if (today) START_KEYS.forEach(function (k) { if (!state[k]) state[k] = today; });
  state.v = SCHEMA_VERSION;
  return state;
}

/* 유효하면 null, 아니면 오류 메시지 반환 */
export function validateState(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '객체 형식이 아님';
  if (obj.v !== undefined && obj.v !== 1 && obj.v !== SCHEMA_VERSION) return '지원하지 않는 버전: ' + obj.v;
  if (typeof obj.startDate !== 'string' || !DATE_RE.test(obj.startDate)) return 'startDate 형식 오류';
  for (var si = 0; si < START_KEYS.length; si++) {
    var sv = obj[START_KEYS[si]];
    if (sv !== undefined && (typeof sv !== 'string' || !DATE_RE.test(sv))) return START_KEYS[si] + ' 형식 오류';
  }
  if (!obj.days || typeof obj.days !== 'object' || Array.isArray(obj.days)) return 'days 없음';
  var keys = Object.keys(obj.days);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!DATE_RE.test(k)) return '날짜 키 형식 오류: ' + k;
    var d = obj.days[k];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return k + ' 기록 형식 오류';
    var nums = HABIT_KEYS;
    for (var j = 0; j < nums.length; j++) {
      var v = d[nums[j]];
      if (v !== undefined && v !== null && (typeof v !== 'number' || isNaN(v) || v < 0)) {
        return k + '.' + nums[j] + ' 값 오류';
      }
    }
    if (d.w !== undefined && d.w !== null && d.w !== 'o' && d.w !== 'x') return k + '.w 값 오류';
    for (var ci = 0; ci < CHECK_KEYS.length; ci++) {
      var cv = d[CHECK_KEYS[ci]];
      if (cv !== undefined && cv !== null && cv !== 'o' && cv !== 'x') return k + '.' + CHECK_KEYS[ci] + ' 값 오류';
    }
    for (var wi = 0; wi < WEEKLY_KEYS.length; wi++) {
      var wk = WEEKLY_KEYS[wi];
      if (d[wk] !== undefined && typeof d[wk] !== 'boolean') return k + '.' + wk + ' 값 오류';
    }
    if (d.e !== undefined && d.e !== null && !isSlot(d.e)) return k + '.e 값 오류';
    for (var fi = 0; fi < FORGE_TEXT_KEYS.length; fi++) {
      var fv = d[FORGE_TEXT_KEYS[fi]];
      if (fv !== undefined && fv !== null && (typeof fv !== 'string' || fv.length > FORGE_TITLE_MAX)) return k + '.' + FORGE_TEXT_KEYS[fi] + ' 값 오류';
    }
    if (d.fx !== undefined && typeof d.fx !== 'boolean') return k + '.fx 값 오류';
    if (d.self !== undefined && d.self !== null && d.self !== 'o' && d.self !== 'x') return k + '.self 값 오류';
    if (d.selfReason !== undefined && (typeof d.selfReason !== 'string' || d.selfReason.length > 4000)) {
      return k + '.selfReason 값 오류';
    }
  }
  if (obj.plans !== undefined) {
    var pe = validatePlans(obj.plans);
    if (pe) return pe;
  }
  if (obj.settings !== undefined) {
    var e = validateSettings(obj.settings);
    if (e) return e;
  }
  return null;
}

/* plans: { 'YYYY-MM-DD'(월요일): { 1..5?: 'am'|'noon'|'run', m1..m5?: 문자열, u?: 마지막 수정 밀리초 } } — 모르는 키는 무시.
   u는 메인컨트롤 봇 동기화에서 주 단위로 더 최근 쪽을 고르는 데 쓴다(2026-11-08). */
function validatePlans(plans) {
  if (!plans || typeof plans !== 'object' || Array.isArray(plans)) return 'plans 형식 오류';
  var keys = Object.keys(plans);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!DATE_RE.test(k) || mondayOf(k) !== k) return 'plans 키 오류(월요일 날짜가 아님): ' + k;
    var p = plans[k];
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 'plans.' + k + ' 형식 오류';
    for (var wd = 1; wd <= 5; wd++) {
      var s = p[wd], m = p['m' + wd];
      if (s !== undefined && s !== null && !isSlot(s)) return 'plans.' + k + '.' + wd + ' 값 오류';
      if (m !== undefined && (typeof m !== 'string' || m.length > MEMO_MAX)) return 'plans.' + k + '.m' + wd + ' 값 오류';
    }
    if (p.u !== undefined && (typeof p.u !== 'number' || !isFinite(p.u) || p.u < 0)) return 'plans.' + k + '.u 값 오류';
  }
  return null;
}

/* settings: { p?: {target, min}, s?: {...}, t?: {...}, r?: {...} } — 있으면 둘 다 양의 정수, 최소 ≤ 정상 */
function validateSettings(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return 'settings 형식 오류';
  var keys = Object.keys(s);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (HABIT_KEYS.indexOf(k) < 0) return 'settings 키 오류: ' + k;
    var g = s[k];
    if (!g || typeof g !== 'object' || Array.isArray(g)) return 'settings.' + k + ' 형식 오류';
    if (typeof g.target !== 'number' || !isFinite(g.target) || g.target < 1) return 'settings.' + k + '.target 값 오류';
    if (typeof g.min !== 'number' || !isFinite(g.min) || g.min < 1) return 'settings.' + k + '.min 값 오류';
    if (g.min > g.target) return 'settings.' + k + ' 최소가 정상보다 큼';
  }
  return null;
}

export function load(today) {
  var raw = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
    var state = JSON.parse(raw);
    if (validateState(state)) throw new Error('invalid');
    return activateFeatures(state, today);
  } catch (e) {
    // 손상된 원본을 덮어쓰기 전에 보존 — 수개월치 기록의 마지막 복구 경로
    if (raw) { try { localStorage.setItem(STORE_KEY + '.bak', raw); } catch (e2) {} }
    return freshState(today);
  }
}

export function save(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

export function exportText(state) {
  return JSON.stringify(state);
}

/* [데이터 내보내기] JSON(v1, v2, routine-v2 프로토타입)을 받아 검증된 state 반환. 문제 있으면 throw.
   프로토타입의 targets 같은 모르는 최상위 키는 mergeStates에서 버려진다(목표치는 이 기기 설정을 따른다). */
export function importText(text, today) {
  var obj = JSON.parse(text);
  var err = validateState(obj);
  if (err) throw new Error(err);
  return activateFeatures(obj, today);
}

/* 가져오기는 합치기다(v2 명세): 같은 날짜는 가져온 기록으로 덮어쓰되 가져온 쪽에 없는 항목(만족도 사유 등)은 남기고,
   시작일과 활성일, 종료일은 더 이른 쪽, 같은 주 계획은 가져온 계획으로 바꾼다. 목표치는 가져온 쪽에 있을 때만 따른다.
   base, incoming 모두 검증된 state. base는 바꾸지 않고 새 state를 돌려준다.
   요약: { added, overwritten } = 새로 생긴 날짜 수, 덮어쓴 날짜 수. */
export function mergeStates(base, incoming) {
  var out = JSON.parse(JSON.stringify(base)), added = 0, overwritten = 0;
  Object.keys(incoming.days).forEach(function (k) {
    if (out.days[k]) overwritten++; else added++;
    out.days[k] = Object.assign({}, out.days[k] || {}, incoming.days[k]);
  });
  if (incoming.startDate < out.startDate) out.startDate = incoming.startDate;
  START_KEYS.forEach(function (k) {
    if (typeof incoming[k] === 'string' && (typeof out[k] !== 'string' || incoming[k] < out[k])) out[k] = incoming[k];
  });
  if (incoming.plans) {
    out.plans = out.plans || {};
    Object.keys(incoming.plans).forEach(function (k) { out.plans[k] = JSON.parse(JSON.stringify(incoming.plans[k])); });
  }
  if (incoming.settings) out.settings = JSON.parse(JSON.stringify(incoming.settings));
  out.v = SCHEMA_VERSION;
  return { state: out, added: added, overwritten: overwritten };
}
