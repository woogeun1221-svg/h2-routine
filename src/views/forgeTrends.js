/* 추이 화면 맨 위의 27 담금질 장부(2026-11-09). 오늘 화면 블록이 '지금 할 일'이라면 여기는 '지금까지 쌓은 것'.
   항목별 달성률(완료 구간 / 끝난 구간 + 완료한 진행 구간), 구간 칸, 기록 목록(읽은 책, 쓴 글, 본 종목), 운동 출처별 일수.
   프로젝트 시작 전에는 숨기고, 마감 뒤에는 기록 보관용으로 계속 보인다. 루틴 판정과는 무관하다. */
import { shift } from '../logic.js';
import { FORGE, FORGE_ITEMS, forgeItem, forgeDaysLeft, forgeItemStatus, forgeMark, forgeWindows } from '../forge.js';

function md(ds) { var p = ds.split('-'); return (+p[1]) + '.' + (+p[2]); }
var SPAN_WORD = { 1: '일', 7: '주', 14: '회' };
var SOURCE = { slot: '슬롯', run: '런닝', manual: '직접' };

/* 항목 집계 — 진행 중 구간은 완료했을 때만 분모에 넣는다(아직 기회가 남은 구간을 미달로 치지 않는다). */
export function forgeItemSummary(state, item, t) {
  var st = forgeItemStatus(state, item, t > FORGE.end ? FORGE.end : t, t);
  var judged = st.doneN + st.missN;
  var entries = [];
  var last = t > FORGE.end ? FORGE.end : t;
  for (var ds = last; ds >= FORGE.start; ds = shift(ds, -1)) {
    var m = forgeMark(state, item, ds);
    if (m) entries.push({ ds: ds, mark: m });
  }
  return {
    status: st, entries: entries,
    rate: judged ? Math.round(st.doneN / judged * 100) : null,
    left: st.total - judged
  };
}

export function renderForgeTrends(state, t) {
  var root = document.getElementById('forgeTrends');
  if (!root) return;
  root.replaceChildren();
  if (t < FORGE.start) { root.hidden = true; return; }
  root.hidden = false;

  var head = document.createElement('div'); head.className = 'forge-head';
  var title = document.createElement('div'); title.className = 'forge-title';
  var nm = document.createElement('span'); nm.className = 'forge-name-main'; nm.textContent = FORGE.name + ' 장부';
  var sub = document.createElement('span'); sub.className = 'forge-sub';
  var days = forgeWindows(forgeItem('fx')), total = days.length;
  var elapsed = days.filter(function (w) { return w.start <= t; }).length;
  sub.textContent = md(FORGE.start) + '–' + md(FORGE.end) + ', ' + elapsed + '/' + total + '일째';
  title.append(nm, sub);
  var dd = document.createElement('div'); dd.className = 'forge-dday num';
  var left = forgeDaysLeft(t);
  var big = document.createElement('b'); big.textContent = left > 0 ? 'D-' + left : (left === 0 ? 'D-DAY' : '종료');
  var small = document.createElement('small'); small.textContent = '달성률은 끝난 구간 기준';
  dd.append(big, small);
  head.append(title, dd);
  root.appendChild(head);

  var rows = document.createElement('div'); rows.className = 'forge-rows';
  FORGE_ITEMS.forEach(function (item) { rows.appendChild(summaryRow(state, t, item)); });
  root.appendChild(rows);
}

function summaryRow(state, t, item) {
  var s = forgeItemSummary(state, item, t), st = s.status;
  var row = document.createElement('div'); row.className = 'forge-row ft-row'; row.dataset.forge = item.key;

  var line = document.createElement('div'); line.className = 'forge-line';
  var name = document.createElement('span'); name.className = 'forge-name'; name.textContent = item.name;
  var goal = document.createElement('span'); goal.className = 'forge-goal'; goal.textContent = item.goal;
  var rate = document.createElement('span'); rate.className = 'forge-rate num';
  rate.textContent = s.rate === null ? '—' : s.rate + '%';
  if (s.rate !== null) rate.classList.add(s.rate >= 80 ? 'hi' : (s.rate >= 50 ? 'mid' : 'lo'));
  line.append(name, goal, rate);

  var counts = document.createElement('div'); counts.className = 'forge-status ft-counts';
  var w = SPAN_WORD[item.span];
  var text = '완료 ' + st.doneN + w + ', 미달 ' + st.missN + w + ', 남은 ' + s.left + w;
  if (item.key === 'fx' && s.entries.length) {
    var by = { slot: 0, run: 0, manual: 0 };
    s.entries.forEach(function (e) { by[e.mark]++; });
    text += ' / ' + ['slot', 'run', 'manual'].filter(function (k) { return by[k]; })
      .map(function (k) { return SOURCE[k] + ' ' + by[k] + '일'; }).join(', ');
  } else if (item.key !== 'fx' && st.count > st.doneN) {
    text += ' / 기록 ' + st.count + item.unit;
  }
  counts.textContent = text;

  var tr = document.createElement('div');
  tr.className = 'forge-track' + (st.windows.length > 20 ? ' dense' : '');
  tr.setAttribute('aria-hidden', 'true');
  st.windows.forEach(function (win) {
    var c = document.createElement('i');
    c.className = 'ft ' + win.state + (t >= win.start && t <= win.end ? ' cur' : '');
    tr.appendChild(c);
  });
  row.append(line, counts, tr);

  if (item.key !== 'fx' && s.entries.length) {
    var ul = document.createElement('ul'); ul.className = 'ft-log';
    s.entries.forEach(function (e) {
      var li = document.createElement('li');
      var d = document.createElement('span'); d.className = 'num'; d.textContent = md(e.ds);
      var b = document.createElement('b'); b.textContent = e.mark;
      li.append(d, b); ul.appendChild(li);
    });
    row.appendChild(ul);
  }
  return row;
}
