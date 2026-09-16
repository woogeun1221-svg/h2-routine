/* 추이 화면 — 스트릭 요약, 월 캘린더 히트맵, 습관별 월간 통계, 월별 장부.
   모든 확정 수치는 어제까지 기준 (오늘은 진행중 — 히트맵에서만 시각 표시). */
import {
  streak, longestStreak, monthList, calMonth, habitMonthStats, monthlyRows, getDay
} from '../logic.js';
import { renderReflectionHistory, renderReflectionArchive, showReflectionDay } from './reflection.js';

var WD = ['일', '월', '화', '수', '목', '금', '토'];

export function renderTrends(state, t, ym, options = {}) {
  const mode = options.mode || 'self';
  renderReflectionHistory(state, ym, t);
  renderReflectionArchive(state, t, options.archiveFilters, options);
  document.getElementById('curStreak').textContent = streak(state, t) + '일';
  document.getElementById('maxStreak').textContent = longestStreak(state, t) + '일';

  document.querySelectorAll('[data-calendar-mode]').forEach(button => {
    const selected = button.dataset.calendarMode === mode;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('sel-o', selected);
  });
  const streaks = document.getElementById('routineStreaks');
  if (streaks) streaks.hidden = mode !== 'routine';
  renderCalendar(state, t, ym, mode);
  renderHabitStats(state, t, ym);
  renderMonthly(state, t);
}

function renderCalendar(state, t, ym, mode) {
  document.getElementById('calLabel').textContent = ym.replace('-', '.');
  const title = document.getElementById('calendarTitle');
  if (title) title.textContent = mode === 'self' ? '하루 만족도' : '루틴 달성';
  const legend = document.getElementById('calendarLegend');
  if (legend) legend.innerHTML = mode === 'self' ?
    '<span class="self-o">O 만족</span><span class="self-x">X 불만족</span><span>— 미응답</span>' :
    '<span><i style="background:var(--red)"></i>정상</span><span><i style="background:var(--brass)"></i>최소</span><span><i style="background:var(--blue)"></i>미달</span>';
  const detail = document.getElementById('reflectionDay');
  if (detail) { detail.hidden = true; detail.replaceChildren(); }

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
    if (mode === 'self' && c.kind !== 'out' && c.kind !== 'future') {
      const entry = getDay(state, c.ds);
      const answer = ['o', 'x'].includes(entry.self) ? entry.self : null;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.day = c.ds;
      button.className = 'cal-cell reflection-cell reflection-' + (answer || 'unanswered') + (c.ds === t ? ' today' : '');
      button.setAttribute('aria-label', c.ds + ' · ' + (answer?.toUpperCase() || '미응답'));
      const date = document.createElement('span'); date.textContent = c.day;
      const mark = document.createElement('b'); mark.textContent = answer?.toUpperCase() || '—';
      button.append(date, mark);
      button.addEventListener('click', () => showReflectionDay(state, c.ds));
      grid.appendChild(button);
      return;
    }
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

  var rows = stats.habits.slice();
  if (stats.investment) rows.push(stats.investment);
  rows.forEach(function (h) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + h.name + '</td>' +
      '<td class="c-full">' + h.full + '</td>' +
      '<td class="c-min">' + h.min + '</td>' +
      '<td class="c-miss">' + h.miss + '</td>' +
      '<td>' + h.sum.toLocaleString() + h.unit + '</td>' +
      '<td class="c-rate">' + (h.fullRate === null ? '—' : h.fullRate + '%') + '</td>';
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
