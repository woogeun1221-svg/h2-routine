/* v1(h2-routine-tracker.html)의 일간 상태 로직을 유지하고 주간 검토를 확장.
   모든 함수가 (state, today)를 인자로 받는 순수 함수. */

/* startKey가 있는 습관은 state[startKey](기능 활성일)부터만 판정에 들어간다 — 투자 원칙과 같은
   규칙으로, 추가 전 날짜를 소급해 미달로 바꾸지 않는다. 활성일이 없는 상태에선 없는 습관으로 본다.
   endKey가 있는 습관은 state[endKey](종료일)부터 판정에서 빠진다. 종료일 전 날짜는 그대로 판정하므로
   과거 스트릭, 정상률, 장부가 소급해 바뀌지 않는다. 종료일이 없는 상태(옛 백업, 테스트 픽스처)에선 계속 활성.
   스쿼트는 2026-10-29 은퇴 — 정의를 지우면 settings.s가 검증에서 거부돼 기록이 fresh로 떨어지므로 남겨 둔다. */
export const HABITS = [
  { key: 'p', name: '푸쉬업', unit: '회', target: 100, min: 30, steps: [5, 10, 25] },
  { key: 's', name: '스쿼트', unit: '회', target: 100, min: 30, steps: [10, 25, 50], endKey: 'squatEnd' },
  { key: 't', name: '턱걸이', unit: '회', target: 20,  min: 5,  steps: [5, 10, 20], startKey: 'pullupStart' },
  { key: 'r', name: '독서',   unit: '분', target: 20,  min: 5,  steps: [5, 10, 20] }
];

export const WIFE = { key: 'w', name: '송은', sub: '해결 먼저, 감정 나중' };

/* 일간 체크 항목 — O/X 한 번으로 기록하고 O여야 그날 통과한다(X나 미응답은 그날 전체 미달). 송은과 달리 '해당없음'이 없다.
   startKey(활성일)부터만 판정해 추가 전 날짜를 소급해 미달로 바꾸지 않는다. 활성일이 없는 상태에선 없는 항목으로 본다.
   가슴 펴기(c)는 2026-11-03 추가. yes/no는 카드 버튼 문구, statName은 추이 표의 행 이름. */
export const POSTURE = {
  key: 'c', name: '가슴 펴기', sub: '당당히 펴고 있는가', startKey: 'postureStart',
  yes: 'O 폈다', no: 'X 움츠렸다', statName: '가슴 펴기'
};
export const CHECKS = [POSTURE];

/* ds를 주면 그날 판정에 들어가는 체크 항목만, 없으면 활성화된 항목 전부. */
export function checksOf(state, ds) {
  return CHECKS.filter(function (item) {
    var since = state[item.startKey];
    if (typeof since !== 'string') return false;
    return ds === undefined || ds >= since;
  });
}

/* 그날 체크 항목에 O나 X를 남겼는지 — 오늘 캔들과 캘린더의 '기록 있음' 판정용. */
export function checksMarked(state, ds) {
  var d = getDay(state, ds);
  return checksOf(state, ds).some(function (item) { return d[item.key] === 'o' || d[item.key] === 'x'; });
}

/* 주간 항목 — 월요일 시작 주간에 한 번, 어느 날이든 완료할 수 있고 금요일까지 미완료면 그 금요일이 미달.
   각자 startKey(활성일)부터 판정하고 day 기록에는 key=true로 완료일을 남긴다. 서로 독립이다.
   action/upcoming/open은 오늘 카드 문구, statName은 추이 표의 행 이름. */
export const INVESTMENT_REVIEW = {
  key: 'i', name: '투자 원칙 정독·검토', sub: '매주 1회 · 목·금 권장', startKey: 'investmentReviewStart',
  action: '정독·검토 완료', upcoming: '목·금 권장 · 지금 미리 완료할 수 있음', open: '권장일 — 오늘 또는 내일',
  statName: '투자 원칙(주)', gap: '투자 원칙 검토'
};
export const RR_SNAPSHOT = {
  key: 'rr', name: '손익비 스냅샷', sub: '매주 1회, 금요일까지', startKey: 'rrSnapshotStart',
  action: '스냅샷 완료', upcoming: '금요일 장 마감 뒤 권장, 지금 미리 완료할 수 있음', open: '권장일, 오늘 또는 내일',
  statName: '손익비 스냅샷(주)', link: 'https://macmini.taile484c7.ts.net/rr/', gap: '손익비 스냅샷'
};
export const WEEKLIES = [INVESTMENT_REVIEW, RR_SNAPSHOT];

/* 운동 슬롯(v2, 2026-11-08 추가) — 평일(월~금)엔 주간 시간표의 슬롯 하나(아침, 점심, 저녁런닝)를 해야 '정상'이다.
   최소 판정에는 영향이 없고, 주말은 송은 시간이라 슬롯 조건이 없다(기록만 남길 수 있다).
   exerciseSlotStart(업데이트 후 처음 연 날)부터 판정해 지난 평일 정상을 소급해 최소로 바꾸지 않는다.
   그날 실제로 한 슬롯은 day.e, 주간 계획은 state.plans['월요일 날짜'] = { 1..5: 슬롯, m1..m5: 메모 }.
   cutoff는 그 슬롯이 지났다고 보는 한국 시간(시)이다. */
export const SLOTS = { am: '아침', noon: '점심', run: '저녁런닝' };
export const SLOT_ORDER = ['am', 'noon', 'run'];
export const SLOT_CUTOFF = { am: 10, noon: 14, run: 21 };
export const EXERCISE_SLOT = { key: 'e', name: '운동 슬롯', startKey: 'exerciseSlotStart' };
export function isSlot(v) { return SLOT_ORDER.indexOf(v) >= 0; }

/* 습관 하나의 유효 목표치와 활성 구간 — state.settings의 오버라이드를 HABITS 기본값 위에 적용.
   settings가 없거나 값이 이상하면 기본값 (v1 데이터 호환). since/until은 날짜 문자열 또는 null. */
function habitGoal(state, h) {
  var o = (state.settings && state.settings[h.key]) || {};
  var target = (typeof o.target === 'number' && o.target >= 1) ? o.target : h.target;
  var min = (typeof o.min === 'number' && o.min >= 1) ? o.min : h.min;
  if (min > target) min = target; // 어떤 조합이 와도 최소 ≤ 정상 보장
  return {
    key: h.key, name: h.name, unit: h.unit, steps: h.steps, target: target, min: min,
    since: (h.startKey && typeof state[h.startKey] === 'string') ? state[h.startKey] : null,
    until: (h.endKey && typeof state[h.endKey] === 'string') ? state[h.endKey] : null
  };
}

/* 활성일이 있는 습관 전부(은퇴한 습관 포함) — 월간 통계처럼 과거 구간을 봐야 할 때 쓴다. */
export function habitSpans(state) {
  return HABITS.filter(function (h) {
    return !h.startKey || typeof state[h.startKey] === 'string';
  }).map(function (h) { return habitGoal(state, h); });
}

/* ds를 주면 그날 판정에 들어가는 습관만, 없으면(설정 화면) 지금 활성화된 습관 전부(은퇴 제외). */
export function goalsOf(state, ds) {
  return habitSpans(state).filter(function (g) {
    if (ds === undefined) return !g.until;
    return (!g.since || ds >= g.since) && (!g.until || ds < g.until);
  });
}

/* ---------- date helpers ---------- */
export function dstr(d) {
  var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + dd;
}
export function todayStr() {
  // 밤 11시 알림과 날짜 경계가 같도록 한국 시간을 사용한다.
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  var values = Object.fromEntries(parts.map(function (p) { return [p.type, p.value]; }));
  return values.year + '-' + values.month + '-' + values.day;
}
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
/* 요일 번호 0=일 … 6=토. 시간표의 평일 키 1~5(월~금)와 같은 번호다. */
export function dow(ds) { var p = ds.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getDay(); }
export function isWeekend(ds) { var g = dow(ds); return g === 0 || g === 6; }
export function mondayOf(ds) { return shift(ds, -((dow(ds) + 6) % 7)); }

/* ISO 8601 주차 — 그 주 목요일이 속한 해에서 몇 번째 주인가. 노션 플래너와 같은 번호
   (2026-11-02~08 = 45주, 2026-11-09 = 46주). 2026년은 목요일에 시작해 53주까지 있다. */
export function isoWeek(ds) {
  var p = ds.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/* 지금 한국 시간의 시(0~23) — todayStr와 같은 기준이라 기기 시간대가 달라도 슬롯 안내가 어긋나지 않는다. */
export function seoulHour(now) {
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(now || new Date());
  for (var i = 0; i < parts.length; i++) if (parts[i].type === 'hour') return +parts[i].value % 24;
  return 0;
}

/* ---------- 주간 운동 시간표 ---------- */
/* monday 주의 계획. 그 주 계획이 없으면 그 전 가장 가까운 주의 슬롯을 물려받고, 그것도 없으면 전부 아침.
   메모는 그 주 것만 쓴다(물려받지 않는다). 반환 { 1..5: 슬롯, m1..m5: 메모(있을 때만) }. */
export function planFor(state, monday) {
  var plans = state.plans || {}, own = plans[monday], src = own, i;
  if (!src) {
    var prev = null;
    Object.keys(plans).forEach(function (k) { if (k < monday && (!prev || k > prev)) prev = k; });
    src = prev ? plans[prev] : null;
  }
  var plan = {};
  for (i = 1; i <= 5; i++) plan[i] = (src && isSlot(src[i])) ? src[i] : 'am';
  if (own) for (i = 1; i <= 5; i++) if (typeof own['m' + i] === 'string' && own['m' + i]) plan['m' + i] = own['m' + i];
  return plan;
}
/* 그 주 계획이 직접 저장돼 있는가(아니면 물려받은 계획을 보여 주는 중). */
export function hasOwnPlan(state, monday) { return !!(state.plans && state.plans[monday]); }
/* 그날 계획 슬롯 — 주말은 null. */
export function plannedSlot(state, ds) { return isWeekend(ds) ? null : planFor(state, mondayOf(ds))[dow(ds)]; }
/* 그날 판정에 운동 슬롯이 들어가는가 — 평일이고 활성일 이후. */
export function slotRequired(state, ds) {
  var since = state[EXERCISE_SLOT.startKey];
  return typeof since === 'string' && ds >= since && !isWeekend(ds);
}
/* 시간표 탭을 열 때 기본 주 — 토일엔 다음 주(1), 평일엔 이번 주(0). */
export function defaultPlanOffset(today) { return isWeekend(today) ? 1 : 0; }

/* 투자 원칙 검토 주간은 월요일 시작, 어느 날이든 한 번 완료할 수 있다.
   금요일까지의 완료 여부로 금요일 일간 판정을 정하고, 목·금은 권장일이다.
   startDate는 기능 활성일이라 기존 기록을 소급해 미달로 바꾸지 않는다. */
export function investmentReviewWindow(ds) {
  var p = ds.split('-');
  var day = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
  var monday = shift(ds, -((day + 6) % 7));
  return {
    monday: monday,
    thursday: shift(monday, 3),
    friday: shift(monday, 4),
    sunday: shift(monday, 6)
  };
}

/* 주간 항목 하나의 ds 기준 상태. item 생략 시 투자 원칙(기존 호출 호환). */
export function weeklyStatus(state, ds, item) {
  item = item || INVESTMENT_REVIEW;
  var win = investmentReviewWindow(ds);
  var start = state[item.startKey];
  if (typeof start !== 'string' || ds < start) {
    return { active: false, done: false, phase: 'inactive', reviewedOn: null, ...win };
  }

  var reviewedOn = null, cur = win.monday > start ? win.monday : start;
  var to = ds < win.sunday ? ds : win.sunday;
  while (cur <= to) {
    if (getDay(state, cur)[item.key] === true) { reviewedOn = cur; break; }
    cur = shift(cur, 1);
  }

  var phase;
  if (reviewedOn) phase = 'done';
  else if (ds < win.thursday) phase = 'upcoming';
  else if (ds === win.thursday) phase = 'open';
  else if (ds === win.friday) phase = 'deadline';
  else phase = 'missed';
  return { active: true, done: !!reviewedOn, phase: phase, reviewedOn: reviewedOn, ...win };
}
export function investmentReviewStatus(state, ds) { return weeklyStatus(state, ds, INVESTMENT_REVIEW); }

/* ---------- status logic ---------- */
export function getDay(state, ds) { return state.days[ds] || { p: 0, s: 0, t: 0, r: 0, w: null, i: false }; }

export function statusOf(state, ds) {
  var d = getDay(state, ds), goals = goalsOf(state, ds), full = true, min = true;
  for (var i = 0; i < goals.length; i++) {
    var h = goals[i], v = d[h.key] || 0;
    if (v < h.target) full = false;
    if (v < h.min) min = false;
  }
  checksOf(state, ds).forEach(function (item) {
    if (d[item.key] !== 'o') { full = false; min = false; } // 체크 항목은 O여야 통과, X나 미응답은 그날 전체 미달
  });
  if (d.w === 'x') { full = false; min = false; }  // X = 그날 전체 미달
  WEEKLIES.forEach(function (item) {
    var review = weeklyStatus(state, ds, item);
    if (review.active && ds === review.friday && !review.done) {
      full = false; min = false; // 금요일까지 거르면 그날 전체 미달
    }
  });
  if (slotRequired(state, ds) && !isSlot(d.e)) full = false; // 평일 운동 슬롯은 정상 조건, 최소에는 영향 없음
  return full ? 'full' : (min ? 'min' : 'miss');
}

export function completion(state, ds) {
  var d = getDay(state, ds), goals = goalsOf(state, ds), sum = 0;
  for (var i = 0; i < goals.length; i++) {
    var h = goals[i]; sum += Math.min(1, (d[h.key] || 0) / h.target);
  }
  var count = goals.length;
  checksOf(state, ds).forEach(function (item) { sum += d[item.key] === 'o' ? 1 : 0; count++; });
  WEEKLIES.forEach(function (item) {
    var review = weeklyStatus(state, ds, item);
    if (review.active && ds === review.friday) {
      sum += review.done ? 1 : 0;
      count++;
    }
  });
  if (slotRequired(state, ds)) { sum += isSlot(d.e) ? 1 : 0; count++; } // 평일 슬롯도 정상까지의 진척에 넣는다
  return sum / count;
}

/* 그날 무엇이든 기록했는가 — 오늘 캔들과 캘린더에서 '진행중(무색)'과 현재 상태 표시를 가른다. */
export function dayRecorded(state, ds) {
  var rec = getDay(state, ds);
  return completion(state, ds) > 0 || !!rec.w || checksMarked(state, ds) || isSlot(rec.e) ||
    WEEKLIES.some(function (item) { return rec[item.key]; });
}

/* 다음 단계까지 남은 것 — 오늘 화면의 '정상까지', '최소까지' 줄.
   full은 정상까지, min은 최소까지(미달일 때 쓴다). wifeX면 그날은 무엇을 해도 미달이다. */
export function gapsOf(state, ds) {
  var d = getDay(state, ds), full = [], min = [];
  if (slotRequired(state, ds) && !isSlot(d.e)) full.push(EXERCISE_SLOT.name);
  goalsOf(state, ds).forEach(function (g) {
    var v = d[g.key] || 0, unit = g.unit === '분' ? '분' : '';
    if (v < g.target) full.push(g.name + ' ' + (g.target - v) + unit);
    if (v < g.min) min.push(g.name + ' ' + (g.min - v) + unit);
  });
  checksOf(state, ds).forEach(function (item) {
    if (d[item.key] !== 'o') { full.push(item.name + ' O'); min.push(item.name + ' O'); }
  });
  WEEKLIES.forEach(function (item) {
    var review = weeklyStatus(state, ds, item);
    if (review.active && ds === review.friday && !review.done) { full.push(item.gap); min.push(item.gap); }
  });
  return { full: full, min: min, wifeX: d.w === 'x' };
}

/* 운동 슬롯 안내 문구. live=true(오늘)면 한국 시간 hour로 시간 경과 안내를 붙인다.
   계획 슬롯이 지나면 아직 시각이 남은 뒷 슬롯이 백업이다(아침 → 점심 → 퇴근 런닝).
   tone: done 완료, plan 대기, warn 백업 필요, lost 오늘 슬롯 끝, off 주말. */
export function slotGuidance(state, ds, hour, live) {
  var planned = plannedSlot(state, ds), actual = getDay(state, ds).e;
  if (!isSlot(actual)) actual = null;
  if (!planned) {
    return actual ? { tone: 'done', text: SLOTS[actual] + ' 기록됨. 주말은 상태에 영향 없음.' } :
      { tone: 'off', text: '시간표 없음. 했으면 기록만, 상태엔 영향 없음.' };
  }
  if (actual) {
    return { tone: 'done', text: actual === planned ? '계획대로 완료.' : '계획 ' + SLOTS[planned] + ' → 실제 ' + SLOTS[actual] + '.' };
  }
  if (!live) return { tone: 'lost', text: '슬롯 비었음. 그날은 최소 포지션까지만 찍힌다.' };
  if (hour < SLOT_CUTOFF[planned]) return { tone: 'plan', text: '슬롯을 비우면 오늘은 최소 포지션까지만 찍힌다.' };
  var backups = SLOT_ORDER.slice(SLOT_ORDER.indexOf(planned) + 1).filter(function (s) { return hour < SLOT_CUTOFF[s]; });
  if (!backups.length) {
    var reps = goalsOf(state, ds).filter(function (g) { return g.unit === '회'; }).map(function (g) { return g.name; });
    return { tone: 'lost', text: '오늘 슬롯 비었음. 최소 포지션' + (reps.length ? '(' + reps.join(', ') + ')' : '') + '으로 마감.' };
  }
  var names = backups.map(function (s) { return s === 'run' ? '퇴근 런닝' : SLOTS[s]; });
  return {
    tone: 'warn',
    text: SLOTS[planned] + ' 슬롯 지남. ' + (names.length > 1 ? '백업 순서: ' : '백업: ') + names.join(' → ') + '.'
  };
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
   lead = 첫 줄 공백 칸 수. v2부터 월요일 시작(월=0 … 일=6) — 시간표, ISO 주차와 같은 주 단위. */
export function calMonth(state, ym, today) {
  var p = (ym + '-01').split('-');
  var lead = (new Date(+p[0], +p[1] - 1, 1).getDay() + 6) % 7;
  var n = daysInMonth(ym);
  var cells = [];
  for (var d = 1; d <= n; d++) {
    var ds = ym + '-' + ('0' + d).slice(-2);
    var kind;
    if (ds < state.startDate) kind = 'out';
    else if (ds > today) kind = 'future';
    else if (ds === today) kind = dayRecorded(state, ds) ? statusOf(state, ds) : 'pending';
    else kind = statusOf(state, ds);
    cells.push({ ds: ds, day: d, kind: kind });
  }
  return { lead: lead, cells: cells };
}

/* 주간 항목 월간 통계 — 주간 마감일인 금요일이 속한 달에 귀속한다.
   금요일까지 완료=정상, 토·일 완료=최소, 일요일까지 미완료=미달.
   완료했거나 일요일이 지난 주만 확정 표본으로 센다. 활성일 없으면 null. */
function weeklyMonthStats(state, ym, today, item) {
  var start = state[item.startKey];
  if (typeof start !== 'string') return null;

  var result = {
    key: item.key, name: item.statName, unit: '회',
    full: 0, min: 0, miss: 0, sum: 0, total: 0, fullRate: null, minRate: null
  };
  var monthStart = ym + '-01';
  var monthEnd = ym + '-' + ('0' + daysInMonth(ym)).slice(-2);
  var yest = shift(today, -1);
  var friday = investmentReviewWindow(monthStart).friday;
  if (friday < monthStart) friday = shift(friday, 7);

  while (friday <= monthEnd) {
    var win = investmentReviewWindow(friday);
    if (win.sunday >= start) {
      var from = win.monday > start ? win.monday : start;
      var to = yest < win.sunday ? yest : win.sunday;
      var reviewedOn = null, cur = from;
      while (cur <= to) {
        if (getDay(state, cur)[item.key] === true) { reviewedOn = cur; break; }
        cur = shift(cur, 1);
      }
      if (reviewedOn) {
        if (reviewedOn <= win.friday) result.full++;
        else result.min++;
        result.sum++; result.total++;
      } else if (win.sunday <= yest) {
        result.miss++; result.total++;
      }
    }
    friday = shift(friday, 7);
  }

  if (result.total) {
    result.fullRate = Math.round(result.full / result.total * 100);
    result.minRate = Math.round((result.full + result.min) / result.total * 100);
  }
  return result;
}

/* 습관별 월간 통계 — 해당 월 안에서 startDate부터 어제까지(확정분만).
   일간 습관은 자기 목표 기준 정상/최소/미달 일수, 누적 합, 달성률.
   나중에 추가한 습관(since)은 활성일부터만, 은퇴한 습관(until)은 종료일 전까지만 세고
   days(자기 표본 일수)로 비율을 낸다.
   체크 항목(checks, 가슴 펴기)은 활성일부터 O면 정상, X나 미응답이면 미달, 최소는 없고 누적은 O 일수.
   주간 항목은 위 주간 기준, 송은은 o/x/na 일수. total=0이면 일간 표본 없음. */
export function habitMonthStats(state, ym, today) {
  var monthStart = ym + '-01';
  var from = monthStart > state.startDate ? monthStart : state.startDate;
  var monthEnd = ym + '-' + ('0' + daysInMonth(ym)).slice(-2);
  var yest = shift(today, -1);
  var to = monthEnd < yest ? monthEnd : yest;
  var goals = habitSpans(state);
  var habits = goals.map(function (h) {
    return { key: h.key, name: h.name, unit: h.unit, days: 0, full: 0, min: 0, miss: 0, sum: 0 };
  });
  var checkItems = checksOf(state);
  var checks = checkItems.map(function (item) {
    return { key: item.key, name: item.statName, unit: '회', days: 0, full: 0, min: 0, miss: 0, sum: 0 };
  });
  var w = { o: 0, x: 0, na: 0 }, total = 0, cur = from;
  while (cur <= to) {
    total++;
    var d = getDay(state, cur);
    for (var i = 0; i < goals.length; i++) {
      var h = goals[i], hs = habits[i], v = d[h.key] || 0;
      if (h.since && cur < h.since) continue; // 추가 전 날짜는 그 습관의 표본이 아니다
      if (h.until && cur >= h.until) continue; // 은퇴 후 날짜도 표본이 아니다
      hs.days++; hs.sum += v;
      if (v >= h.target) hs.full++;
      else if (v >= h.min) hs.min++;
      else hs.miss++;
    }
    for (var ci = 0; ci < checkItems.length; ci++) {
      if (cur < state[checkItems[ci].startKey]) continue; // 활성일 전은 표본이 아니다
      var cs = checks[ci]; cs.days++;
      if (d[checkItems[ci].key] === 'o') { cs.full++; cs.sum++; } else cs.miss++;
    }
    if (d.w === 'o') w.o++; else if (d.w === 'x') w.x++; else w.na++;
    cur = shift(cur, 1);
  }
  habits.concat(checks).forEach(function (row) {
    var n = row.days;
    row.fullRate = n ? Math.round(row.full / n * 100) : null;
    row.minRate = n ? Math.round((row.full + row.min) / n * 100) : null;
  });
  /* 은퇴한 습관은 표본이 있는 달(은퇴 전)에만 행을 남긴다. 아직 활성일 전인 습관은 기존처럼 0, — 로 둔다. */
  habits = habits.filter(function (hs, k) { return !(goals[k].until && hs.days === 0); });
  /* weeklies: 활성화된 주간 항목 행(투자 원칙, 손익비 스냅샷 순). investment는 기존 호출 호환. */
  var weeklies = WEEKLIES.map(function (item) { return weeklyMonthStats(state, ym, today, item); })
    .filter(function (row) { return row; });
  return { total: total, habits: habits, checks: checks, weeklies: weeklies, investment: weeklyMonthStats(state, ym, today, INVESTMENT_REVIEW), w: w };
}

/* 월별 장부 — startDate부터 어제까지(확정일, 오늘 제외), 최신 월부터.
   slotDone/slotDays = 운동 슬롯을 한 평일 / 슬롯 조건이 있던 평일(활성일부터), wifeX = 송은 X 일수. */
export function monthlyRows(state, today) {
  var yest = shift(today, -1);
  if (yest < state.startDate) return [];
  var map = {}, order = [], cur = state.startDate;
  while (cur <= yest) {
    var mk = cur.slice(0, 7), d = getDay(state, cur);
    if (!map[mk]) { map[mk] = { full: 0, min: 0, miss: 0, slotDone: 0, slotDays: 0, wifeX: 0 }; order.push(mk); }
    map[mk][statusOf(state, cur)]++;
    if (slotRequired(state, cur)) { map[mk].slotDays++; if (isSlot(d.e)) map[mk].slotDone++; }
    if (d.w === 'x') map[mk].wifeX++;
    cur = shift(cur, 1);
  }
  return order.reverse().map(function (mk) {
    var r = map[mk], total = r.full + r.min + r.miss;
    return {
      label: mk.slice(2).replace('-', '.'), full: r.full, min: r.min, miss: r.miss,
      rate: Math.round(r.full / total * 100),
      slotDone: r.slotDone, slotDays: r.slotDays, wifeX: r.wifeX
    };
  });
}
