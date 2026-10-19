/* localStorage 저장 + JSON 내보내기/가져오기. v1 스키마에 선택 필드만 추가:
   { startDate, investmentReviewStart?, pullupStart?, days: { date: { p, s, t?, r, w, i? } } }
   i=true는 그날 투자 원칙 주간 검토를 완료했다는 뜻이며 요일 제한은 없다.
   t는 턱걸이(2026-10-19 추가). pullupStart는 턱걸이가 판정에 들어가는 첫날로, 처음 연 날에 채운다.
   self=o/x/null, selfReason은 하루 만족도 선택/이유이며 기존 루틴 판정과 별개다. */
import { HABITS } from './logic.js';

var STORE_KEY = 'h2-routine-v1';
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var HABIT_KEYS = HABITS.map(function (h) { return h.key; });
/* 기능 활성일 필드 — 없으면 처음 연 날로 채워 기존 기록을 소급 판정하지 않는다 */
var START_KEYS = ['investmentReviewStart'].concat(
  HABITS.filter(function (h) { return h.startKey; }).map(function (h) { return h.startKey; }));

export function freshState(today) {
  var state = { startDate: today, days: {} };
  START_KEYS.forEach(function (k) { state[k] = today; });
  return state;
}

function activateFeatures(state, today) {
  if (today) START_KEYS.forEach(function (k) { if (!state[k]) state[k] = today; });
  return state;
}

/* 유효하면 null, 아니면 오류 메시지 반환 */
export function validateState(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '객체 형식이 아님';
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
    if (d.i !== undefined && typeof d.i !== 'boolean') return k + '.i 값 오류';
    if (d.self !== undefined && d.self !== null && d.self !== 'o' && d.self !== 'x') return k + '.self 값 오류';
    if (d.selfReason !== undefined && (typeof d.selfReason !== 'string' || d.selfReason.length > 4000)) {
      return k + '.selfReason 값 오류';
    }
  }
  if (obj.settings !== undefined) {
    var e = validateSettings(obj.settings);
    if (e) return e;
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

/* v1 [데이터 내보내기] JSON을 받아 검증된 state 반환. 문제 있으면 throw. */
export function importText(text, today) {
  var obj = JSON.parse(text);
  var err = validateState(obj);
  if (err) throw new Error(err);
  return activateFeatures(obj, today);
}
