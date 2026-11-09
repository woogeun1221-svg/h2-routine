/* 27 담금질 블록 — 오늘 화면 맨 위. 보는 날(day)에 기록을 남기고, 구간 판정은 오늘(t) 기준이다.
   h.setForge(key, value): 글 항목은 제목 문자열 또는 null, 운동은 true 또는 null. */
import { weekday } from '../logic.js';
import { FORGE, FORGE_ITEMS, FORGE_TITLE_MAX, forgeActive, forgeDaysLeft, forgeItemStatus, forgeMark } from '../forge.js';

function md(ds) { var p = ds.split('-'); return (+p[1]) + '.' + (+p[2]); }
var SPAN_WORD = { 1: '일', 7: '주', 14: '회' };

export function renderForge(state, t, h, day) {
  day = day || t;
  var root = document.getElementById('forgeBlock');
  if (!root) return;
  root.replaceChildren();
  if (!forgeActive(day)) { root.hidden = true; return; }
  root.hidden = false;

  var head = document.createElement('div'); head.className = 'forge-head';
  var title = document.createElement('div'); title.className = 'forge-title';
  var nm = document.createElement('span'); nm.className = 'forge-name-main'; nm.textContent = FORGE.name;
  var sub = document.createElement('span'); sub.className = 'forge-sub'; sub.textContent = FORGE.sub;
  title.append(nm, sub);
  var dd = document.createElement('div'); dd.className = 'forge-dday num';
  var left = forgeDaysLeft(t);
  var big = document.createElement('b'); big.textContent = left > 0 ? 'D-' + left : (left === 0 ? 'D-DAY' : '마감');
  var small = document.createElement('small'); small.textContent = md(FORGE.end) + '까지';
  dd.append(big, small);
  head.append(title, dd);
  root.appendChild(head);

  var rows = document.createElement('div'); rows.className = 'forge-rows';
  FORGE_ITEMS.forEach(function (item) { rows.appendChild(forgeRow(state, t, h, day, item)); });
  root.appendChild(rows);
}

function forgeRow(state, t, h, day, item) {
  var st = forgeItemStatus(state, item, day, t);
  var mark = forgeMark(state, item, day);
  var row = document.createElement('div');
  row.className = 'forge-row phase-' + st.phase;
  row.dataset.forge = item.key;

  var main = document.createElement('div'); main.className = 'forge-main';
  var line = document.createElement('div'); line.className = 'forge-line';
  var name = document.createElement('span'); name.className = 'forge-name'; name.textContent = item.name;
  var goal = document.createElement('span'); goal.className = 'forge-goal'; goal.textContent = item.goal;
  var score = document.createElement('span'); score.className = 'forge-score num';
  score.textContent = st.doneN + '/' + st.total + SPAN_WORD[item.span];
  line.append(name, goal, score);

  var status = document.createElement('div'); status.className = 'forge-status';
  status.textContent = statusText(item, st, mark, day === t);
  main.append(line, status);

  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn forge-btn';
  if (item.key === 'fx') {
    if (mark === 'slot') {
      btn.textContent = '슬롯 완료'; btn.disabled = true; btn.classList.add('sel-o');
    } else {
      btn.textContent = mark ? 'O 했다' : 'O 하기';
      if (mark) btn.classList.add('sel-o');
      btn.setAttribute('aria-pressed', String(!!mark));
      btn.addEventListener('click', function () { h.setForge('fx', mark ? null : true); });
    }
  } else if (mark) {
    btn.textContent = '기록됨'; btn.classList.add('sel-o');
    btn.setAttribute('aria-pressed', 'true');
    btn.addEventListener('click', function () {
      if (confirm(item.name + ' 기록 "' + mark + '"을 지울까?')) h.setForge(item.key, null);
    });
  } else {
    btn.textContent = st.phase === 'done' ? '+ 더' : '기록';
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      var inp = prompt(item.ask, '');
      if (inp === null) return;
      var v = inp.trim().slice(0, FORGE_TITLE_MAX) || '완료';
      h.setForge(item.key, v);
    });
  }

  var top = document.createElement('div'); top.className = 'forge-top';
  top.append(main, btn);
  row.append(top, track(st, day));
  return row;
}

function statusText(item, st, mark, isToday) {
  var range = st.win.start === st.win.end ? '' : md(st.win.start) + '–' + md(st.win.end) + ', ';
  if (item.key === 'fx') {
    if (mark === 'slot') return '운동 슬롯 기록으로 인정.';
    if (mark) return (isToday ? '오늘' : '그날') + ' 운동 완료.';
    return isToday ? '오늘 아직. 종류 무관, 몸을 쓰면 O.' : '그날 기록 없음.';
  }
  if (st.phase === 'done') return range + st.entries.map(function (e) { return e.title; }).join(', ');
  if (st.phase === 'last') return range + (isToday ? '오늘 마감.' : '그날이 마감일.');
  var endDay = weekday(st.win.end);
  return range + endDay + '요일까지 ' + item.goal.replace(/^.*? /, '') + '.';
}

/* 구간 칸 — 완료 빨강, 미달 파랑, 진행 중 테두리, 남은 구간 흐리게. 보는 날의 구간에 표시. */
function track(st, day) {
  var wrap = document.createElement('div');
  wrap.className = 'forge-track' + (st.windows.length > 20 ? ' dense' : '');
  wrap.setAttribute('aria-hidden', 'true');
  st.windows.forEach(function (w) {
    var c = document.createElement('i');
    c.className = 'ft ' + w.state + (day >= w.start && day <= w.end ? ' cur' : '');
    wrap.appendChild(c);
  });
  return wrap;
}
