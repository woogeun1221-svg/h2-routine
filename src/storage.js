/* localStorage 저장 + JSON 내보내기/가져오기. 스키마는 v1과 동일:
   { startDate: 'YYYY-MM-DD', days: { 'YYYY-MM-DD': { p, s, r, w: 'o'|'x'|null } } } */

var STORE_KEY = 'h2-routine-v1';
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function freshState(today) {
  return { startDate: today, days: {} };
}

/* 유효하면 null, 아니면 오류 메시지 반환 */
export function validateState(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '객체 형식이 아님';
  if (typeof obj.startDate !== 'string' || !DATE_RE.test(obj.startDate)) return 'startDate 형식 오류';
  if (!obj.days || typeof obj.days !== 'object' || Array.isArray(obj.days)) return 'days 없음';
  var keys = Object.keys(obj.days);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!DATE_RE.test(k)) return '날짜 키 형식 오류: ' + k;
    var d = obj.days[k];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return k + ' 기록 형식 오류';
    var nums = ['p', 's', 'r'];
    for (var j = 0; j < nums.length; j++) {
      var v = d[nums[j]];
      if (v !== undefined && v !== null && (typeof v !== 'number' || isNaN(v) || v < 0)) {
        return k + '.' + nums[j] + ' 값 오류';
      }
    }
    if (d.w !== undefined && d.w !== null && d.w !== 'o' && d.w !== 'x') return k + '.w 값 오류';
  }
  if (obj.settings !== undefined) {
    var e = validateSettings(obj.settings);
    if (e) return e;
  }
  return null;
}

/* settings: { p?: {target, min}, s?: {...}, r?: {...} } — 있으면 둘 다 양의 정수, 최소 ≤ 정상 */
function validateSettings(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return 'settings 형식 오류';
  var keys = Object.keys(s);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k !== 'p' && k !== 's' && k !== 'r') return 'settings 키 오류: ' + k;
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
    return state;
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
export function importText(text) {
  var obj = JSON.parse(text);
  var err = validateState(obj);
  if (err) throw new Error(err);
  return obj;
}
