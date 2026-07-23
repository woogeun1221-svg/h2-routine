/* 추이 화면 — 스트릭 요약, 월 캘린더 히트맵, 습관별 월간 통계, 월별 장부.
   모든 확정 수치는 어제까지 기준 (오늘은 진행중 — 히트맵에서만 시각 표시). */
import {
  streak, longestStreak, monthList, calMonth, habitMonthStats, monthlyRows
} from '../logic.js';

var WD = ['일', '월', '화', '수', '목', '금', '토'];

export function renderTrends(state, t, ym) {
  document.getElementById('curStreak').textContent = streak(state, t) + '일';
  document.getElementById('maxStreak').textContent = longestStreak(state, t) + '일';

  renderCalendar(state, t, ym);
  renderHabitStats(state, t, ym);
  renderMonthly(state, t);
}

function renderCalendar(state, t, ym) {
  document.getElementById('calLabel').textContent = ym.replace('-', '.');

  var months = monthList(state, t);
  var first = months[0] || ym, last = months[months.length - 1] || ym;
  document.getElementById('calPrev').disabled = ym <= first;
  document.getElementById('calNext').disabled = ym >= last;

  var wd = document.getElementById('calWd');
  wd.innerHTML = '';
  WD.forEach(function (w) {
    var s = document.createElement('span'); s.textContent = w; wd.appendChild(s);
  });

  var cal = calMonth(state, ym, t);
  var grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  for (var i = 0; i < cal.lead; i++) {
    var blank = document.createElement('div'); blank.className = 'cal-cell out';
    grid.appendChild(blank);
  }
  cal.cells.forEach(function (c) {
    var cell = document.createElement('div');
    cell.className = 'cal-cell ' + c.kind + (c.ds === t ? ' today' : '');
    cell.textContent = c.kind === 'out' ? '' : c.day;
    if (c.kind !== 'out' && c.kind !== 'future') cell.title = c.ds;
    grid.appendChild(cell);
  });
}

function renderHabitStats(state, t, ym) {
  document.getElementById('habitTitle').textContent = '습관별 — ' + ym.slice(2).replace('-', '.');
  var stats = habitMonthStats(state, ym, t);
  var tb = document.getElementById('habitBody');
  tb.innerHTML = '';
  var wife = document.getElementById('wifeLine');

  if (stats.total === 0) {
    var tr0 = document.createElement('tr');
    tr0.innerHTML = '<td colspan="6" class="empty">확정 기록 없음 (어제까지 기준)</td>';
    tb.appendChild(tr0);
    wife.textContent = '';
    return;
  }

  stats.habits.forEach(function (h) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + h.name + '</td>' +
      '<td class="c-full">' + h.full + '</td>' +
      '<td class="c-min">' + h.min + '</td>' +
      '<td class="c-miss">' + h.miss + '</td>' +
      '<td>' + h.sum.toLocaleString() + h.unit + '</td>' +
      '<td class="c-rate">' + h.fullRate + '%</td>';
    tb.appendChild(tr);
  });

  wife.innerHTML = '송은 — <b class="wo">O ' + stats.w.o + '</b> · <b class="wx">X ' + stats.w.x + '</b> · 해당없음 ' + stats.w.na +
    ' <span class="wife-note">/ ' + stats.total + '일 확정</span>';
}

function renderMonthly(state, t) {
  var rows = monthlyRows(state, t);
  var sec = document.getElementById('monthSection');
  if (rows.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  var tb = document.getElementById('monthBody'); tb.innerHTML = '';
  rows.forEach(function (r) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + r.label + '</td><td class="c-full">' + r.full + '</td>' +
      '<td class="c-min">' + r.min + '</td><td class="c-miss">' + r.miss + '</td>' +
      '<td class="c-rate">' + r.rate + '%</td>';
    tb.appendChild(tr);
  });
}
