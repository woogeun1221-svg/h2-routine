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
