/* 추이 화면 — 스트릭 요약, 월 캘린더 히트맵, 습관별 월간 통계, 월별 장부.
   모든 확정 수치는 어제까지 기준 (오늘은 진행중 — 히트맵에서만 시각 표시). */
import {
  streak, longestStreak, monthList, calMonth, habitMonthStats, monthlyRows, getDay
} from '../logic.js';
import { renderReflectionHistory, renderReflectionArchive, showReflectionDay } from './reflection.js';

/* v2부터 월요일 시작(calMonth.lead와 같은 순서). 토일은 황동 라벨. */
var WD = ['월', '화', '수', '목', '금', '토', '일'];

var POSITION = { full: '정상', min: '최소', miss: '미달', pending: '진행 중' };

/* 2026-11-09: 하루 만족도와 루틴 달성 캘린더를 하나로 합쳤다(전환 버튼 없음).
   칸 색 = 루틴 포지션(빨강 정상, 황동 최소, 파랑 미달), 칸 안 글자 = 만족도 O / X / —(미응답).
   칸을 누르면 그날 포지션과 만족도, X 사유가 아래에 나온다. options.mode는 옛 호출 호환용으로 무시한다. */
export function renderTrends(state, t, ym, options = {}) {
  renderReflectionHistory(state, ym, t);
  renderReflectionArchive(state, t, options.archiveFilters, options);
  document.getElementById('curStreak').textContent = streak(state, t) + '일';
  document.getElementById('maxStreak').textContent = longestStreak(state, t) + '일';
  renderCalendar(state, t, ym);
  renderHabitStats(state, t, ym);
  renderMonthly(state, t);
}

function renderCalendar(state, t, ym) {
  document.getElementById('calLabel').textContent = ym.replace('-', '.');
  const detail = document.getElementById('reflectionDay');
  if (detail) { detail.hidden = true; detail.replaceChildren(); }

  var months = monthList(state, t);
  var first = months[0] || ym, last = months[months.length - 1] || ym;
  document.getElementById('calPrev').disabled = ym <= first;
  document.getElementById('calNext').disabled = ym >= last;

  var wd = document.getElementById('calWd');
  wd.innerHTML = '';
  WD.forEach(function (w, i) {
    var s = document.createElement('span'); s.textContent = w;
    if (i >= 5) s.className = 'we';
    wd.appendChild(s);
  });

  var cal = calMonth(state, ym, t);
  var grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  for (var i = 0; i < cal.lead; i++) {
    var blank = document.createElement('div'); blank.className = 'cal-cell out';
    grid.appendChild(blank);
  }
  cal.cells.forEach(function (c) {
    if (c.kind !== 'out' && c.kind !== 'future') {
      const entry = getDay(state, c.ds);
      const answer = ['o', 'x'].includes(entry.self) ? entry.self : null;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.day = c.ds;
      button.className = 'cal-cell combo ' + c.kind + ' self-' + (answer || 'none') + (c.ds === t ? ' today' : '');
      button.setAttribute('aria-label', c.ds + ', 루틴 ' + POSITION[c.kind] + ', 만족도 ' + (answer?.toUpperCase() || '미응답'));
      const date = document.createElement('span'); date.textContent = c.day;
      const mark = document.createElement('b'); mark.textContent = answer?.toUpperCase() || '—';
      button.append(date, mark);
      button.addEventListener('click', () => showReflectionDay(state, c.ds, POSITION[c.kind]));
      grid.appendChild(button);
      return;
    }
    var cell = document.createElement('div');
    cell.className = 'cal-cell ' + c.kind + (c.ds === t ? ' today' : '');
    cell.textContent = c.kind === 'out' ? '' : c.day;
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

  var rows = stats.habits.concat(stats.checks || [], stats.exercise || [], stats.weeklies || []);
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

  wife.innerHTML = '송은 — <b class="wo">O ' + stats.w.o + '</b>, <b class="wx">X ' + stats.w.x + '</b>, 해당없음 ' + stats.w.na +
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
      '<td class="c-rate">' + r.rate + '%</td>' +
      '<td class="c-slot">' + (r.slotDays ? r.slotDone + '/' + r.slotDays : '—') + '</td>' +
      '<td class="c-wx">' + r.wifeX + '</td>';
    tb.appendChild(tr);
  });
}
