/* v1(h2-routine-tracker.html)의 상태 로직 1:1 이식.
   모든 함수가 (state, today)를 인자로 받는 순수 함수 — 동작은 v1과 동일. */

export const HABITS = [
  { key: 'p', name: '푸쉬업', unit: '회', target: 100, min: 30, steps: [10, 25, 50] },
  { key: 's', name: '스쿼트', unit: '회', target: 100, min: 30, steps: [10, 25, 50] },
  { key: 'r', name: '독서',   unit: '분', target: 20,  min: 5,  steps: [5, 10, 20] }
];

export const WIFE = { key: 'w', name: '송은', sub: '해결 먼저, 감정 나중' };

/* ---------- date helpers ---------- */
export function dstr(d) {
  var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + dd;
}
export function todayStr() { return dstr(new Date()); }
export function shift(ds, n) {
  var p = ds.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return dstr(d);
}
export function daysBetween(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  var da = new Date(+pa[0], +pa[1] - 1, +pa[2]), db = new Date(+pb[0], +pb[1] - 1, +pb[2]);
  return Math.round((db - da) / 86400000);
}
var WD = ['일', '월', '화', '수', '목', '금', '토'];
export function weekday(ds) { var p = ds.split('-'); return WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }

/* ---------- status logic ---------- */
export function getDay(state, ds) { return state.days[ds] || { p: 0, s: 0, r: 0, w: null }; }

export function statusOf(state, ds) {
  var d = getDay(state, ds), full = true, min = true;
  for (var i = 0; i < HABITS.length; i++) {
    var h = HABITS[i], v = d[h.key] || 0;
    if (v < h.target) full = false;
    if (v < h.min) min = false;
  }
  if (d.w === 'x') { full = false; min = false; }  // X = 그날 전체 미달
  return full ? 'full' : (min ? 'min' : 'miss');
}

export function completion(state, ds) {
  var d = getDay(state, ds), sum = 0;
  for (var i = 0; i < HABITS.length; i++) {
    var h = HABITS[i]; sum += Math.min(1, (d[h.key] || 0) / h.target);
  }
  return sum / HABITS.length;
}

/* 스트릭 = 최소 이상 연속일. 오늘이 미달(미기록 포함)이면 어제부터 센다 — 오늘은 진행중. */
export function streak(state, today) {
  var n = 0, cur;
  cur = (statusOf(state, today) !== 'miss') ? today : shift(today, -1);
  while (cur >= state.startDate) {
    if (statusOf(state, cur) === 'miss') break;
    n++; cur = shift(cur, -1);
  }
  return n;
}

/* 이달 정상률 — 월초(또는 startDate)부터 어제까지. 표본 없으면 null. */
export function monthFullRate(state, today) {
  var monthStart = today.slice(0, 8) + '01';
  var from = monthStart > state.startDate ? monthStart : state.startDate;
  var to = shift(today, -1);
  if (from > to) return null;
  var total = 0, full = 0, cur = from;
  while (cur <= to) {
    total++; if (statusOf(state, cur) === 'full') full++;
    cur = shift(cur, 1);
  }
  return Math.round(full / total * 100);
}

/* 최장 스트릭 — 어제까지 확정 + 오늘이 최소 이상이면 포함 (현재 스트릭과 동일 규칙이라
   항상 최장 ≥ 현재가 보장됨). */
export function longestStreak(state, today) {
  var days = [], cur = state.startDate, yest = shift(today, -1);
  while (cur <= yest) { days.push(cur); cur = shift(cur, 1); }
  if (today >= state.startDate && statusOf(state, today) !== 'miss') days.push(today);
  var best = 0, run = 0;
  for (var i = 0; i < days.length; i++) {
    if (statusOf(state, days[i]) === 'miss') run = 0;
    else { run++; if (run > best) best = run; }
  }
  return best;
}

/* ---------- 월 단위 헬퍼 (추이 화면) ---------- */
export function shiftMonth(ym, n) {
  var t = (+ym.slice(0, 4)) * 12 + (+ym.slice(5, 7) - 1) + n;
  var y = Math.floor(t / 12), m = t % 12 + 1;
  return y + '-' + ('0' + m).slice(-2);
}

export function daysInMonth(ym) {
  return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
}

/* startDate가 속한 월부터 오늘이 속한 월까지, 오름차순 'YYYY-MM' 목록 */
export function monthList(state, today) {
  var list = [], cur = state.startDate.slice(0, 7), end = today.slice(0, 7);
  while (cur <= end) { list.push(cur); cur = shiftMonth(cur, 1); }
  return list;
}

/* 캘린더 히트맵 데이터. kind:
   'out'    = startDate 이전 (표시 안 함)
   'future' = 오늘 이후
   'pending'= 오늘인데 아직 아무 기록 없음 (진행중 — 미달 아님, v1 스트립과 동일 규칙)
   'full'|'min'|'miss' = 확정 상태 (오늘도 기록이 있으면 현재 상태로 표시)
   lead = 1일의 요일(0=일) — 첫 줄 공백 칸 수 */
export function calMonth(state, ym, today) {
  var p = (ym + '-01').split('-');
  var lead = new Date(+p[0], +p[1] - 1, 1).getDay();
  var n = daysInMonth(ym);
  var cells = [];
  for (var d = 1; d <= n; d++) {
    var ds = ym + '-' + ('0' + d).slice(-2);
    var kind;
    if (ds < state.startDate) kind = 'out';
    else if (ds > today) kind = 'future';
    else if (ds === today) {
      var recorded = completion(state, ds) > 0 || getDay(state, ds).w;
      kind = recorded ? statusOf(state, ds) : 'pending';
    } else kind = statusOf(state, ds);
    cells.push({ ds: ds, day: d, kind: kind });
  }
  return { lead: lead, cells: cells };
}

/* 습관별 월간 통계 — 해당 월 안에서 startDate부터 어제까지(확정분만).
   습관별로 자기 목표 기준 정상/최소/미달 일수, 누적 합, 달성률.
   송은은 o/x/na 일수. total=0이면 표본 없음. */
export function habitMonthStats(state, ym, today) {
  var monthStart = ym + '-01';
  var from = monthStart > state.startDate ? monthStart : state.startDate;
  var monthEnd = ym + '-' + ('0' + daysInMonth(ym)).slice(-2);
  var yest = shift(today, -1);
  var to = monthEnd < yest ? monthEnd : yest;
  var habits = HABITS.map(function (h) {
    return { key: h.key, name: h.name, unit: h.unit, full: 0, min: 0, miss: 0, sum: 0 };
  });
  var w = { o: 0, x: 0, na: 0 }, total = 0, cur = from;
  while (cur <= to) {
    total++;
    var d = getDay(state, cur);
    for (var i = 0; i < HABITS.length; i++) {
      var h = HABITS[i], hs = habits[i], v = d[h.key] || 0;
      hs.sum += v;
      if (v >= h.target) hs.full++;
      else if (v >= h.min) hs.min++;
      else hs.miss++;
    }
    if (d.w === 'o') w.o++; else if (d.w === 'x') w.x++; else w.na++;
    cur = shift(cur, 1);
  }
  for (var j = 0; j < habits.length; j++) {
    habits[j].fullRate = total ? Math.round(habits[j].full / total * 100) : null;
    habits[j].minRate = total ? Math.round((habits[j].full + habits[j].min) / total * 100) : null;
  }
  return { total: total, habits: habits, w: w };
}

/* 월별 장부 — startDate부터 어제까지, 최신 월부터. */
export function monthlyRows(state, today) {
  var yest = shift(today, -1);
  if (yest < state.startDate) return [];
  var map = {}, order = [], cur = state.startDate;
  while (cur <= yest) {
    var mk = cur.slice(0, 7);
    if (!map[mk]) { map[mk] = { full: 0, min: 0, miss: 0 }; order.push(mk); }
    map[mk][statusOf(state, cur)]++;
    cur = shift(cur, 1);
  }
  return order.reverse().map(function (mk) {
    var r = map[mk], total = r.full + r.min + r.miss;
    return {
      label: mk.slice(2).replace('-', '.'), full: r.full, min: r.min, miss: r.miss,
      rate: Math.round(r.full / total * 100)
    };
  });
}
