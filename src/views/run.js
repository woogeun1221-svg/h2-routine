/* 헬스 탭의 런닝 화면(2026-11-09) — 루틴 기록(day.runs)에 저장해 내보내기, 가져오기 합치기, 검증을 그대로 탄다.
   런닝은 운동한 날로 인정된다(담금질 운동, 추이 운동 행). 운동 슬롯(e)은 시간 창 의미가 있어 자동으로 채우지 않는다.
   h: { addRun(ds, { km, min? }), removeRun(ds, index) } */
import { shift, mondayOf, weekday, runsOf } from '../logic.js';

/* '32', '32.5', '32:30' → 분(소수). 빈 값은 undefined, 형식 오류는 NaN. */
export function parseMinutes(text) {
  var s = String(text || '').trim();
  if (!s) return undefined;
  var m = /^(\d{1,4})(?::([0-5]?\d))?$/.exec(s);
  if (m) return +m[1] + (m[2] ? +m[2] / 60 : 0);
  var n = Number(s);
  return isFinite(n) ? n : NaN;
}
/* 분/km → 5'30" */
export function paceText(km, min) {
  if (!(km > 0) || !(min > 0)) return '—';
  var sec = Math.round(min * 60 / km), mm = Math.floor(sec / 60), ss = sec % 60;
  return mm + "'" + (ss < 10 ? '0' : '') + ss + '"';
}
function timeText(min) {
  if (!(min > 0)) return '—';
  var total = Math.round(min * 60), h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
function km1(n) { return (Math.round(n * 10) / 10).toLocaleString(); }
function md(ds) { var p = ds.split('-'); return (+p[1]) + '.' + (+p[2]); }

/* 기간 [from, to] 의 런 목록(최신 먼저) */
export function runsBetween(state, from, to) {
  var out = [];
  for (var ds = to; ds >= from; ds = shift(ds, -1)) {
    runsOf(state, ds).forEach(function (r, i) { out.push({ ds: ds, i: i, km: r.km, min: r.min }); });
  }
  return out;
}
function sumKm(list) { return list.reduce(function (a, r) { return a + r.km; }, 0); }

export function renderRun(state, t, h) {
  var root = document.getElementById('runScreen');
  if (!root) return;
  root.replaceChildren();

  /* ----- 입력 카드 ----- */
  var card = document.createElement('section'); card.className = 'card run-input';
  var title = document.createElement('div'); title.className = 'card-name'; title.textContent = '런닝 기록';
  var grid = document.createElement('div'); grid.className = 'run-fields';
  function field(label, input) {
    var l = document.createElement('label'); l.className = 'run-field';
    var s = document.createElement('span'); s.textContent = label;
    l.append(s, input); grid.appendChild(l); return input;
  }
  var date = document.createElement('input'); date.type = 'date'; date.id = 'runDate';
  date.value = t; date.max = t; date.min = state.startDate;
  var km = document.createElement('input'); km.id = 'runKm'; km.inputMode = 'decimal'; km.placeholder = '5.0'; km.autocomplete = 'off';
  var min = document.createElement('input'); min.id = 'runMin'; min.inputMode = 'numeric'; min.placeholder = '30:00'; min.autocomplete = 'off';
  field('날짜', date); field('거리 km', km); field('시간 분:초', min);
  var pace = document.createElement('div'); pace.className = 'run-pace'; pace.id = 'runPace';
  var err = document.createElement('div'); err.className = 'run-err'; err.id = 'runErr';
  function preview() {
    var k = Number(String(km.value).replace(',', '.')), m = parseMinutes(min.value);
    pace.textContent = '페이스 ' + paceText(k, m) + ' /km';
  }
  km.addEventListener('input', preview); min.addEventListener('input', preview); preview();
  var add = document.createElement('button'); add.type = 'button'; add.className = 'btn run-add'; add.id = 'runAdd';
  add.textContent = '기록';
  add.addEventListener('click', function () {
    var k = Number(String(km.value).replace(',', '.')), m = parseMinutes(min.value), ds = date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || ds > t || ds < state.startDate) { err.textContent = '날짜를 확인해줘.'; return; }
    if (!(k > 0 && k <= 200)) { err.textContent = '거리는 0보다 크고 200km 이하로.'; return; }
    if (m !== undefined && !(m >= 0 && m <= 1440)) { err.textContent = '시간은 분 또는 분:초로 (예 32:30).'; return; }
    if (runsOf(state, ds).length >= 10) { err.textContent = '하루 기록은 10개까지.'; return; }
    var run = { km: Math.round(k * 100) / 100 };
    if (m) run.min = Math.round(m * 100) / 100;
    h.addRun(ds, run);
  });
  card.append(title, grid, pace, err, add);
  root.appendChild(card);

  /* ----- 요약 칩 ----- */
  var monday = mondayOf(t), monthStart = t.slice(0, 8) + '01';
  var week = runsBetween(state, monday, t), month = runsBetween(state, monthStart, t);
  var monthMin = month.filter(function (r) { return r.min > 0; });
  var chips = document.createElement('div'); chips.className = 'chips run-chips';
  [['이번 주', km1(sumKm(week)) + 'km'],
   ['이번 달 ' + month.length + '회', km1(sumKm(month)) + 'km'],
   ['이달 페이스', paceText(sumKm(monthMin), monthMin.reduce(function (a, r) { return a + r.min; }, 0))]
  ].forEach(function (c) {
    var el = document.createElement('div'); el.className = 'chip';
    el.append(document.createTextNode(c[0]));
    var b = document.createElement('b'); b.className = 'num'; b.textContent = c[1];
    el.appendChild(b); chips.appendChild(el);
  });
  root.appendChild(chips);

  /* ----- 최근 8주 막대 ----- */
  var weeks = [], maxKm = 0;
  for (var w = 7; w >= 0; w--) {
    var from = shift(monday, -7 * w), to = shift(from, 6);
    var k = sumKm(runsBetween(state, from, to > t ? t : to));
    weeks.push({ from: from, km: k }); if (k > maxKm) maxKm = k;
  }
  var chart = document.createElement('section'); chart.className = 'card run-weeks';
  var ch = document.createElement('div'); ch.className = 'card-top';
  var cn = document.createElement('div'); cn.className = 'card-name'; cn.textContent = '주간 거리';
  var cs = document.createElement('span'); cs.className = 'card-sub'; cs.textContent = '최근 8주';
  cn.appendChild(cs); ch.appendChild(cn);
  var bars = document.createElement('div'); bars.className = 'run-bars'; bars.id = 'runBars';
  weeks.forEach(function (wk, idx) {
    var col = document.createElement('div'); col.className = 'run-bar' + (idx === weeks.length - 1 ? ' cur' : '');
    var v = document.createElement('span'); v.className = 'run-bar-v num'; v.textContent = wk.km ? km1(wk.km) : '';
    var track = document.createElement('i');
    var fill = document.createElement('b'); fill.style.height = (maxKm ? wk.km / maxKm * 100 : 0) + '%';
    track.appendChild(fill);
    var lb = document.createElement('span'); lb.className = 'run-bar-l num'; lb.textContent = md(wk.from);
    col.append(v, track, lb); bars.appendChild(col);
  });
  chart.append(ch, bars);
  root.appendChild(chart);

  /* ----- 최근 기록 ----- */
  var listCard = document.createElement('section'); listCard.className = 'card run-list';
  var lt = document.createElement('div'); lt.className = 'card-name'; lt.textContent = '최근 기록';
  listCard.appendChild(lt);
  var recent = runsBetween(state, state.startDate, t).slice(0, 20);
  if (!recent.length) {
    var empty = document.createElement('p'); empty.className = 'run-empty'; empty.textContent = '아직 기록이 없다. 첫 런을 남기자.';
    listCard.appendChild(empty);
  }
  var ul = document.createElement('ul'); ul.id = 'runList';
  recent.forEach(function (r) {
    var li = document.createElement('li'); li.dataset.day = r.ds;
    var d = document.createElement('span'); d.className = 'run-d'; d.textContent = md(r.ds) + ' ' + weekday(r.ds);
    var k = document.createElement('b'); k.className = 'num'; k.textContent = km1(r.km) + 'km';
    var tm = document.createElement('span'); tm.className = 'num run-t'; tm.textContent = timeText(r.min);
    var p = document.createElement('span'); p.className = 'num run-p'; p.textContent = paceText(r.km, r.min);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'run-x'; x.textContent = '×';
    x.setAttribute('aria-label', md(r.ds) + ' ' + km1(r.km) + 'km 기록 삭제');
    x.addEventListener('click', function () {
      if (confirm(md(r.ds) + ' ' + km1(r.km) + 'km 기록을 지울까?')) h.removeRun(r.ds, r.i);
    });
    li.append(d, k, tm, p, x); ul.appendChild(li);
  });
  listCard.appendChild(ul);
  root.appendChild(listCard);
}
