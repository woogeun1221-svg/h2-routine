/* 시간표 화면 — 주간(요일 x 아침, 점심, 저녁 칸의 시간표)과 일간(06~24시 하루 시간축) 두 보기.
   주간: 이번 주 / 다음 주, 평일 칸을 누르면 그날 계획 슬롯이 그 칸으로 옮겨 간다. 토일은 송은 시간.
   일간: 이번 주 월요일부터 다음 주 일요일까지 하루씩, 슬롯 창(06~10, 12~14, 18~21시)과 지금 선, 23시 취침 선.
   계획이 없는 주는 직전 계획을 물려받아 보여 주고, 슬롯이나 메모를 바꾸면 그 주 계획으로 저장된다.
   view: { mode: 'week'|'day', offset: 0|1, day, hour?, minute? } (숫자만 주면 그 주의 주간 보기). hour, minute는 테스트용 한국 시간.
   h: { setMode(mode), setOffset(0|1), setDay(ds), openDay(ds), setPlanSlot(monday, wd, slot), setPlanMemo(monday, wd, text) }.
   메모는 입력할 때마다 저장하고 다시 그리지 않는다(한글 조합과 커서 보존). 1분 갱신은 renderPlanClock만 부른다. */
import {
  SLOTS, SLOT_ORDER, SLOT_WINDOW, SLOT_CUTOFF, DAY_START, DAY_END, BEDTIME, EXERCISE_SLOT,
  shift, mondayOf, isoWeek, weekday, dow, isWeekend, planFor, hasOwnPlan, getDay, isSlot,
  statusOf, gapsOf, slotGuidance, seoulHour, seoulMinute
} from '../logic.js';

var BAND = { am: { label: '아침', sub: '~10시' }, noon: { label: '점심', sub: '~14시' }, run: { label: '저녁', sub: '~21시' } };
var BLOCK = { am: '아침', noon: '점심', run: '런닝' };
var POSITION = { full: '정상', min: '최소', miss: '미달' };

function md(ds) { return (+ds.slice(5, 7)) + '.' + (+ds.slice(8, 10)); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function clock(view) {
  var hour = view && typeof view.hour === 'number' ? view.hour : seoulHour();
  var minute = view && typeof view.minute === 'number' ? view.minute : (view && typeof view.hour === 'number' ? 0 : seoulMinute());
  return { hour: hour, minute: minute };
}
/* 그날 실제 기록을 계획과 비교해 보여 줄 날인가 — 시간표 시작일부터 오늘까지 */
function tracked(state, ds, t) {
  var since = state[EXERCISE_SLOT.startKey];
  return typeof since === 'string' && ds >= since && ds <= t;
}
function actualOf(state, ds) {
  var e = getDay(state, ds).e;
  return isSlot(e) ? e : null;
}
/* 평일 계획 칸 하나의 상태: done(실제로 함), ghost(계획했지만 다른 칸에서 함), miss(지난 날 비었음, 오늘은 컷오프 지남),
   plan(앞으로 할 계획), '' (계획 아님) */
function cellState(state, t, ds, slot, planned, actual, now) {
  if (actual === slot) return 'done';
  if (planned !== slot) return '';
  if (actual) return 'ghost';
  if (tracked(state, ds, t) && (ds < t || (now && now.hour >= SLOT_CUTOFF[slot]))) return 'miss';
  return 'plan';
}

export function renderPlan(state, t, view, h) {
  if (typeof view === 'number') view = { mode: 'week', offset: view };
  view = view || {};
  var mode = view.mode === 'day' ? 'day' : 'week';
  renderModes(mode, h);
  var weekView = document.getElementById('planWeekView'), dayView = document.getElementById('planDayView');
  if (weekView) weekView.hidden = mode !== 'week';
  if (dayView) dayView.hidden = mode !== 'day';
  if (mode === 'week') renderWeek(state, t, view.offset === 1 ? 1 : 0, view, h);
  else renderDay(state, t, view.day || t, view, h);
}

/* 시간이 흐르면 바뀌는 부분만 다시 그린다 — 주간은 칸, 일간은 시간축과 그날 상태. 입력 칸(메모)은 건드리지 않는다. */
export function renderPlanClock(state, t, view, h) {
  if (!view) return;
  if (view.mode === 'day') renderTimeline(state, t, view, h);
  else renderGrid(state, t, view.offset === 1 ? 1 : 0, view, h);
}

function renderModes(mode, h) {
  var wrap = document.getElementById('planModes');
  if (!wrap) return;
  wrap.querySelectorAll('[data-mode]').forEach(function (b) {
    var on = b.dataset.mode === mode;
    b.className = 'seg-btn' + (on ? ' on' : '');
    b.setAttribute('aria-pressed', String(on));
    b.onclick = function () { if (!on && h && h.setMode) h.setMode(b.dataset.mode); };
  });
}

/* ---------- 주간 ---------- */
function renderWeek(state, t, offset, view, h) {
  var thisMonday = mondayOf(t);
  renderWeekToggle(thisMonday, offset, h);
  var monday = shift(thisMonday, offset * 7);
  var plan = planFor(state, monday);

  var inherit = document.getElementById('planInherit');
  if (inherit) {
    if (hasOwnPlan(state, monday)) {
      inherit.hidden = true; inherit.textContent = '';
    } else {
      var hasEarlier = Object.keys(state.plans || {}).some(function (k) { return k < monday; });
      inherit.hidden = false;
      inherit.textContent = (hasEarlier ? '이 주 계획이 아직 없어 직전 계획을 물려받았다.' : '계획이 아직 없어 전부 아침으로 둔다.') +
        ' 칸이나 메모를 바꾸면 이 주 계획으로 저장된다.';
    }
  }

  renderGrid(state, t, offset, view, h);
  renderMemos(monday, plan, t, h);
}

function renderGrid(state, t, offset, view, h) {
  var monday = shift(mondayOf(t), offset * 7);
  var plan = planFor(state, monday);
  var now = clock(view);
  var grid = document.getElementById('planGrid');
  var count = { am: 0, noon: 0, run: 0 };
  if (grid) {
    grid.replaceChildren();
    grid.appendChild(el('div', 'tt-corner'));
    SLOT_ORDER.forEach(function (s, i) {
      var band = el('div', 'tt-band');
      band.style.gridRow = String(i + 2);
      band.append(el('b', '', BAND[s].label), el('small', '', BAND[s].sub));
      grid.appendChild(band);
    });
  }
  for (var wd = 1; wd <= 7; wd++) {
    var ds = shift(monday, wd - 1);
    var we = wd > 5, isToday = ds === t, past = ds < t;
    var actual = actualOf(state, ds);
    if (!we) count[plan[wd]]++;
    if (!grid) continue;

    var head = el('button', 'tt-day' + (we ? ' we' : '') + (isToday ? ' today' : '') + (past ? ' past' : ''));
    head.type = 'button';
    head.dataset.day = ds;
    head.style.gridColumn = String(wd + 1);
    head.setAttribute('aria-label', md(ds) + ' ' + weekday(ds) + '요일 일간 보기');
    head.append(el('span', 'tt-wd', weekday(ds)), el('b', 'tt-date', String(+ds.slice(8, 10))));
    if (past && ds >= state.startDate) {
      var bar = el('i', 'tt-status ' + statusOf(state, ds));
      bar.title = POSITION[statusOf(state, ds)];
      head.appendChild(bar);
    }
    head.addEventListener('click', (function (d) { return function () { if (h && h.openDay) h.openDay(d); }; })(ds));
    grid.appendChild(head);

    if (we) {
      var weBlock = el('div', 'tt-we' + (isToday ? ' today' : ''));
      weBlock.style.gridColumn = String(wd + 1);
      weBlock.dataset.day = ds;
      weBlock.append(el('span', '', '송은'), el('span', '', '시간'));
      grid.appendChild(weBlock);
      if (actual && tracked(state, ds, t)) {
        var rec = el('div', 'tt-block done tt-we-rec', BLOCK[actual]);
        rec.style.gridColumn = String(wd + 1);
        rec.style.gridRow = String(SLOT_ORDER.indexOf(actual) + 2);
        grid.appendChild(rec);
      }
      continue;
    }

    SLOT_ORDER.forEach(function (s, i) {
      var cell = el('button', 'tt-cell' + (isToday ? ' today' : ''));
      cell.type = 'button';
      cell.dataset.day = ds; cell.dataset.slot = s;
      cell.style.gridColumn = String(wd + 1);
      cell.style.gridRow = String(i + 2);
      var shown = tracked(state, ds, t) ? actual : null;
      var stt = cellState(state, t, ds, s, plan[wd], shown, isToday ? now : null);
      var label = md(ds) + ' ' + weekday(ds) + ' ' + SLOTS[s];
      if (stt) {
        var block = el('span', 'tt-block ' + stt);
        block.appendChild(el('b', '', BLOCK[s]));
        var mark = stt === 'done' ? '완료' : stt === 'miss' ? (past ? '비었음' : '지남') : stt === 'ghost' ? '옮김' : '';
        if (mark) block.appendChild(el('small', '', mark));
        cell.appendChild(block);
        label += stt === 'plan' ? ', 계획' : ', ' + (stt === 'ghost' ? '계획, 다른 칸에서 함' : mark);
      }
      cell.setAttribute('aria-pressed', String(plan[wd] === s));
      cell.setAttribute('aria-label', label);
      cell.addEventListener('click', (function (w, slot, cur) {
        return function () { if (cur !== slot && h && h.setPlanSlot) h.setPlanSlot(monday, w, slot); };
      })(wd, s, plan[wd]));
      grid.appendChild(cell);
    });
  }

  var countEl = document.getElementById('planCount');
  if (countEl) countEl.textContent = '아침 ' + count.am + ', 점심 ' + count.noon + ', 저녁런닝 ' + count.run;
}

function renderWeekToggle(thisMonday, offset, h) {
  var wrap = document.getElementById('planWeeks');
  if (!wrap) return;
  wrap.replaceChildren();
  [0, 1].forEach(function (o) {
    var mon = shift(thisMonday, o * 7);
    var b = el('button', 'seg-btn' + (o === offset ? ' on' : ''));
    b.type = 'button';
    b.dataset.offset = String(o);
    b.setAttribute('aria-pressed', String(o === offset));
    b.append(el('span', 'week-label', o === 0 ? '이번 주' : '다음 주'),
      el('small', 'week-meta', 'W' + isoWeek(mon) + ' ' + md(mon) + '–' + md(shift(mon, 6))));
    b.addEventListener('click', function () { if (o !== offset && h && h.setOffset) h.setOffset(o); });
    wrap.appendChild(b);
  });
}

function memoInput(monday, wd, ds, value, h) {
  var memo = el('input', 'plan-memo');
  memo.type = 'text'; memo.maxLength = 200;
  memo.placeholder = '메모, 송은 일정';
  memo.value = value || '';
  memo.dataset.day = ds;
  memo.setAttribute('aria-label', md(ds) + ' ' + weekday(ds) + '요일 메모');
  memo.addEventListener('input', function () { if (h && h.setPlanMemo) h.setPlanMemo(monday, wd, memo.value); });
  return memo;
}

function renderMemos(monday, plan, t, h) {
  var wrap = document.getElementById('planMemos');
  if (!wrap) return;
  wrap.replaceChildren();
  for (var wd = 1; wd <= 5; wd++) {
    var ds = shift(monday, wd - 1);
    var row = el('label', 'memo-row' + (ds === t ? ' today' : '') + (ds < t ? ' past' : ''));
    row.dataset.day = ds;
    var tag = el('span', 'memo-day');
    tag.append(el('b', '', weekday(ds)), el('small', '', md(ds)));
    row.append(tag, memoInput(monday, wd, ds, plan['m' + wd], h));
    wrap.appendChild(row);
  }
}

/* ---------- 일간 ---------- */
export function planDayRange(t) {
  var first = mondayOf(t);
  return { first: first, last: shift(first, 13) };
}

function renderDay(state, t, ds, view, h) {
  var range = planDayRange(t);
  if (ds < range.first) ds = range.first;
  if (ds > range.last) ds = range.last;
  var monday = mondayOf(ds), wd = dow(ds), we = isWeekend(ds);
  var plan = planFor(state, monday);

  var head = document.getElementById('planDayHead');
  if (head) {
    head.replaceChildren();
    var prev = el('button', 'icon-btn', '‹'); prev.type = 'button'; prev.dataset.nav = '-1';
    prev.setAttribute('aria-label', '전날'); prev.disabled = ds <= range.first;
    var next = el('button', 'icon-btn', '›'); next.type = 'button'; next.dataset.nav = '1';
    next.setAttribute('aria-label', '다음날'); next.disabled = ds >= range.last;
    prev.addEventListener('click', function () { if (h && h.setDay) h.setDay(shift(ds, -1)); });
    next.addEventListener('click', function () { if (h && h.setDay) h.setDay(shift(ds, 1)); });
    var title = el('div', 'day-title');
    title.append(el('b', '', md(ds) + ' ' + weekday(ds)),
      el('small', '', 'W' + isoWeek(ds) + (ds === t ? ', 오늘' : ds < t ? ', 지난 날' : '') + (we ? ', 송은 시간' : '')));
    head.append(prev, title, next);
  }

  var memoWrap = document.getElementById('planDayMemo');
  if (memoWrap) {
    memoWrap.replaceChildren();
    if (we) memoWrap.appendChild(el('p', 'day-note we', '주말은 송은 시간. 시간표가 없고, 운동은 했으면 기록만 남는다.'));
    else memoWrap.appendChild(memoInput(monday, wd, ds, plan['m' + wd], h));
  }
  renderTimeline(state, t, { mode: 'day', day: ds, hour: view.hour, minute: view.minute }, h);
}

/* 일간 시간축과 그날 상태 — 입력 칸이 없어 1분마다 다시 그려도 안전하다. */
function renderTimeline(state, t, view, h) {
  var line = document.getElementById('planTimeline');
  if (!line) return;
  var range = planDayRange(t);
  var ds = view.day || t;
  if (ds < range.first) ds = range.first;
  if (ds > range.last) ds = range.last;
  var monday = mondayOf(ds), wd = dow(ds), we = isWeekend(ds), isToday = ds === t;
  var plan = planFor(state, monday), planned = we ? null : plan[wd];
  var actual = tracked(state, ds, t) ? actualOf(state, ds) : null;
  var now = clock(view);
  var span = DAY_END - DAY_START;
  function pos(hour) { return ((hour - DAY_START) / span * 100).toFixed(3) + '%'; }

  line.replaceChildren();
  line.className = 'tl' + (we ? ' we' : '') + (isToday ? ' today' : '');
  for (var hr = DAY_START; hr <= DAY_END; hr++) {
    var tick = el('div', 'tl-hour' + ((hr - DAY_START) % 3 === 0 ? ' major' : ''));
    tick.style.top = pos(hr);
    if ((hr - DAY_START) % 3 === 0) tick.appendChild(el('span', '', pad(hr)));
    line.appendChild(tick);
  }
  var bed = el('div', 'tl-bed');
  bed.style.top = pos(BEDTIME);
  bed.appendChild(el('span', '', '취침 ' + BEDTIME + '시'));
  line.appendChild(bed);
  if (we) {
    var weBlock = el('div', 'tl-we');
    weBlock.appendChild(el('span', '', '송은 시간'));
    line.appendChild(weBlock);
  }

  SLOT_ORDER.forEach(function (s) {
    var win = SLOT_WINDOW[s];
    var stt = cellState(state, t, ds, s, planned, actual, isToday ? now : null);
    if (we && stt !== 'done') return; // 주말은 기록한 슬롯만
    var block = el(we ? 'div' : 'button', 'tl-block ' + (stt || 'free'));
    if (!we) block.type = 'button';
    block.dataset.slot = s;
    block.style.top = pos(win[0]);
    block.style.height = ((win[1] - win[0]) / span * 100).toFixed(3) + '%';
    var name = el('b', '', SLOTS[s]);
    var time = el('small', '', pad(win[0]) + '–' + pad(win[1]) + '시');
    var tagText = stt === 'done' ? '완료' : stt === 'plan' ? '계획' : stt === 'ghost' ? '계획, 다른 칸에서 함' :
      stt === 'miss' ? (ds < t ? '비었음' : '지남') : '';
    block.append(name, time);
    if (tagText) block.appendChild(el('em', '', tagText));
    if (!we) {
      block.setAttribute('aria-pressed', String(planned === s));
      block.setAttribute('aria-label', SLOTS[s] + ' ' + pad(win[0]) + '시부터 ' + win[1] + '시' + (tagText ? ', ' + tagText : ''));
      block.addEventListener('click', function () { if (planned !== s && h && h.setPlanSlot) h.setPlanSlot(monday, wd, s); });
    }
    line.appendChild(block);
  });

  if (isToday && now.hour >= DAY_START) {
    var nowLine = el('div', 'tl-now');
    nowLine.style.top = pos(now.hour + now.minute / 60);
    nowLine.appendChild(el('span', '', pad(now.hour) + ':' + pad(now.minute)));
    line.appendChild(nowLine);
  }

  var status = document.getElementById('planDayStatus');
  if (status) {
    status.replaceChildren();
    if (ds <= t && ds >= state.startDate) {
      var st = statusOf(state, ds), gaps = gapsOf(state, ds);
      var row = el('div', 'day-status');
      row.appendChild(el('span', 'pill ' + st, POSITION[st] + ' 포지션'));
      var gapText = st === 'full' ? (isToday ? '오늘' : '그날') + ' 정상 마감.' :
        gaps.wifeX ? '송은 X는 그 자체로 그날 미달.' :
        st === 'miss' ? '최소까지 ' + gaps.min.join(', ') : '정상까지 ' + gaps.full.join(', ');
      row.appendChild(el('span', 'day-gap', gapText));
      status.appendChild(row);
    }
    if (!we || actual) {
      var guide = slotGuidance(state, ds, now.hour, isToday);
      if (ds > t && !we) guide = { tone: 'plan', text: '계획 ' + SLOTS[planned] + ', ' + SLOT_CUTOFF[planned] + '시까지.' };
      status.appendChild(el('p', 'day-guide tone-' + guide.tone, guide.text));
    }
    if (!we) status.appendChild(el('p', 'day-hint', '칸을 누르면 그날 계획이 바뀐다. 실제로 한 슬롯은 오늘 화면에서 누른다.'));
  }
}
