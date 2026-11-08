/* 시간표 화면 — 주간 운동 시간표(v2). 이번 주 / 다음 주를 고르고, 월~금은 슬롯 하나(아침, 점심, 저녁런닝)와
   메모 한 칸, 토일은 송은 시간. 계획이 없는 주는 직전 계획을 물려받아 보여 주고, 슬롯이나 메모를 바꾸면 그 주 계획으로 저장된다.
   h: { setOffset(0|1), setPlanSlot(monday, wd, slot), setPlanMemo(monday, wd, text) }.
   메모는 입력할 때마다 저장하고 다시 그리지 않는다(한글 조합과 커서 보존, 앱이 가려져도 유실 없음). */
import {
  SLOTS, SLOT_ORDER, EXERCISE_SLOT, shift, mondayOf, isoWeek, weekday, planFor, hasOwnPlan, getDay, isSlot
} from '../logic.js';

function md(ds) { return (+ds.slice(5, 7)) + '.' + (+ds.slice(8, 10)); }

export function renderPlan(state, t, offset, h) {
  var thisMonday = mondayOf(t);
  renderWeekToggle(thisMonday, offset, h);

  var monday = shift(thisMonday, offset * 7);
  var plan = planFor(state, monday);
  var inherit = document.getElementById('planInherit');
  if (hasOwnPlan(state, monday)) {
    inherit.hidden = true; inherit.textContent = '';
  } else {
    var hasEarlier = Object.keys(state.plans || {}).some(function (k) { return k < monday; });
    inherit.hidden = false;
    inherit.textContent = (hasEarlier ? '이 주 계획이 아직 없어 직전 계획을 물려받았다.' : '계획이 아직 없어 전부 아침으로 둔다.') +
      ' 슬롯이나 메모를 바꾸면 이 주 계획으로 저장된다.';
  }

  var since = state[EXERCISE_SLOT.startKey];
  var rows = document.getElementById('planRows');
  rows.replaceChildren();
  var count = { am: 0, noon: 0, run: 0 };
  [1, 2, 3, 4, 5, 6, 7].forEach(function (wd) {
    var ds = shift(monday, wd - 1);
    var tracked = typeof since === 'string' && ds >= since && ds <= t; // 실제 기록을 보여 줄 날
    var row = document.createElement('div');
    row.className = 'plan-row' + (wd > 5 ? ' we' : '') + (ds < t ? ' past' : '') + (ds === t ? ' today' : '');
    row.dataset.day = ds;

    var head = document.createElement('div'); head.className = 'plan-row-head';
    var date = document.createElement('span'); date.className = 'plan-date';
    var num = document.createElement('span'); num.className = 'mono'; num.textContent = md(ds);
    date.append(num, document.createTextNode(' ' + weekday(ds)));
    if (ds === t) {
      var tag = document.createElement('small'); tag.className = 'today-tag'; tag.textContent = '오늘';
      date.appendChild(tag);
    }
    var note = document.createElement('span'); note.className = 'plan-note';
    head.append(date, note);
    row.appendChild(head);

    var actual = getDay(state, ds).e;
    if (!isSlot(actual)) actual = null;

    if (wd > 5) {
      note.className += ' we';
      note.textContent = '송은 시간' + (tracked && actual ? ', ' + SLOTS[actual] + ' 운동 기록' : '');
      rows.appendChild(row);
      return;
    }

    var cur = plan[wd];
    count[cur]++;
    if (tracked && actual) {
      note.textContent = actual === cur ? '계획대로 완료' : '실제 ' + SLOTS[actual];
      note.className += actual === cur ? ' done' : ' moved';
    } else if (tracked && ds < t) {
      note.textContent = '슬롯 비었음';
      note.className += ' empty';
    }

    var seg = document.createElement('div'); seg.className = 'btns seg plan-seg';
    SLOT_ORDER.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'btn' + (cur === s ? ' sel-plan' : '');
      b.dataset.slot = s;
      b.setAttribute('aria-pressed', String(cur === s));
      b.textContent = SLOTS[s];
      b.addEventListener('click', function () { if (cur !== s) h.setPlanSlot(monday, wd, s); });
      seg.appendChild(b);
    });
    row.appendChild(seg);

    var memo = document.createElement('input');
    memo.type = 'text'; memo.className = 'plan-memo'; memo.maxLength = 200;
    memo.placeholder = '메모, 송은 일정';
    memo.value = plan['m' + wd] || '';
    memo.setAttribute('aria-label', md(ds) + ' ' + weekday(ds) + '요일 메모');
    memo.addEventListener('input', function () { h.setPlanMemo(monday, wd, memo.value); });
    row.appendChild(memo);
    rows.appendChild(row);
  });

  document.getElementById('planCount').textContent =
    '아침 ' + count.am + ', 점심 ' + count.noon + ', 저녁런닝 ' + count.run;
}

function renderWeekToggle(thisMonday, offset, h) {
  var wrap = document.getElementById('planWeeks');
  wrap.replaceChildren();
  [0, 1].forEach(function (o) {
    var mon = shift(thisMonday, o * 7);
    var b = document.createElement('button'); b.type = 'button';
    b.className = 'btn' + (o === offset ? ' sel-plan' : '');
    b.dataset.offset = String(o);
    b.setAttribute('aria-pressed', String(o === offset));
    var label = document.createElement('span'); label.className = 'week-label';
    label.textContent = o === 0 ? '이번 주' : '다음 주';
    var meta = document.createElement('small'); meta.className = 'week-meta mono';
    meta.textContent = 'W' + isoWeek(mon) + ' ' + md(mon) + '–' + md(shift(mon, 6));
    b.append(label, meta);
    b.addEventListener('click', function () { if (o !== offset) h.setOffset(o); });
    wrap.appendChild(b);
  });
}
