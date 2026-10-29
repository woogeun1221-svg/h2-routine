/* 오늘 화면 렌더 — 일간 카드와 주간 투자 원칙 검토.
   h(핸들러): { addVal, undoVal, setDirect, toggleW, toggleWeekly(key), selectDay, undoStack }.
   day를 주면 그날(과거) 기록을 보여 주고 카드 입력이 그날에 쓰인다 — 연속 생존, 이달 정상, 어제 미달 배너는
   항상 오늘(t) 기준이다. 카드 목록은 goalsOf(state, day)라 그날 활성이던 습관(은퇴 전 스쿼트 등)이 그대로 나온다. */
import {
  WIFE, WEEKLIES, goalsOf, shift, daysBetween, weekday,
  getDay, statusOf, completion, streak, monthFullRate, weeklyStatus
} from '../logic.js';
import { renderReflection } from './reflection.js';

export function renderToday(state, t, h, day) {
  day = day || t;
  var isToday = day === t;
  renderReflection(state, day, h, isToday);
  var p = day.split('-');
  document.getElementById('dateStr').textContent = p[0] + '.' + p[1] + '.' + p[2] + ' ' + weekday(day);
  document.getElementById('dplus').textContent = 'D+' + (daysBetween(state.startDate, day) + 1);
  document.getElementById('dayPrev').disabled = day <= state.startDate;
  document.getElementById('dayNext').disabled = isToday;
  var notice = document.getElementById('editNotice');
  notice.className = 'edit-notice' + (isToday ? '' : ' show');
  document.getElementById('editNoticeText').textContent = isToday ? '' :
    p[1] + '.' + p[2] + ' ' + weekday(day) + '요일 기록을 수정하는 중 — 입력 즉시 저장';

  document.getElementById('streak').textContent = streak(state, t) + '일';
  var fr = monthFullRate(state, t);
  document.getElementById('fullRate').textContent = (fr === null) ? '—' : fr + '%';

  var y = shift(t, -1);
  var show = (y >= state.startDate) && statusOf(state, y) === 'miss';
  document.getElementById('banner').className = 'banner' + (show ? ' show' : '');

  /* 배너·룰 노트의 목표 숫자는 설정을 따라간다 (오늘 판정에 들어가는 습관만) */
  var goals = goalsOf(state, t);
  document.getElementById('bannerMins').textContent = goals.map(function (g) { return g.min; }).join('·');
  document.getElementById('goalFullNums').textContent = goals.map(function (g) { return g.target; }).join(' · ');
  document.getElementById('goalMinNums').textContent = goals.map(function (g) { return g.min; }).join(' · ');

  renderCards(state, day, h);
  renderStrip(state, t, h, day);
}

function renderCards(state, t, h) {
  var d = getDay(state, t), wrap = document.getElementById('cards');
  wrap.innerHTML = '';

  goalsOf(state, t).forEach(function (hb) {
    var v = d[hb.key] || 0;
    var tier = v >= hb.target ? 'full' : (v >= hb.min ? 'min' : '');
    var card = document.createElement('div'); card.className = 'card';

    var top = document.createElement('div'); top.className = 'card-top';
    var nm = document.createElement('div'); nm.className = 'card-name';
    nm.innerHTML = hb.name + '<span class="card-sub">최소 ' + hb.min + hb.unit + '</span>' +
      (tier === 'full' ? '<span class="done-flag full">정상</span>' :
       tier === 'min'  ? '<span class="done-flag min">최소</span>' : '');
    var valBtn = document.createElement('button'); valBtn.className = 'card-val mono';
    valBtn.innerHTML = v + '<span class="of"> / ' + hb.target + hb.unit + '</span>';
    valBtn.title = '탭해서 직접 입력';
    valBtn.addEventListener('click', function () {
      var inp = prompt(hb.name + ' 값 직접 입력', v);
      if (inp === null) return;
      var n = parseInt(inp, 10);
      if (isNaN(n) || n < 0) return;
      h.setDirect(hb.key, n);
    });
    top.appendChild(nm); top.appendChild(valBtn);

    var bar = document.createElement('div'); bar.className = 'bar';
    var fill = document.createElement('div');
    fill.className = 'bar-fill' + (tier ? ' ' + tier : '');
    fill.style.width = Math.min(100, v / hb.target * 100) + '%';
    var tick = document.createElement('div'); tick.className = 'bar-tick';
    tick.style.left = (hb.min / hb.target * 100) + '%';
    bar.appendChild(fill); bar.appendChild(tick);

    var btns = document.createElement('div'); btns.className = 'btns';
    hb.steps.forEach(function (st) {
      var b = document.createElement('button'); b.className = 'btn';
      b.textContent = '+' + st;
      b.addEventListener('click', function () { h.addVal(hb.key, st); });
      btns.appendChild(b);
    });
    var ub = document.createElement('button'); ub.className = 'btn undo';
    ub.textContent = '↺'; ub.title = '마지막 추가 취소';
    ub.disabled = (h.undoStack[hb.key] || []).length === 0;
    ub.addEventListener('click', function () { h.undoVal(hb.key); });
    btns.appendChild(ub);

    card.appendChild(top); card.appendChild(bar); card.appendChild(btns);
    wrap.appendChild(card);
  });

  /* ----- 송은 카드 (O / 해당없음 / X) ----- */
  var w = d.w || null;
  var wc = document.createElement('div'); wc.className = 'card';
  var wtop = document.createElement('div'); wtop.className = 'card-top';
  var wnm = document.createElement('div'); wnm.className = 'card-name';
  wnm.innerHTML = WIFE.name + '<span class="card-sub">' + WIFE.sub + '</span>' +
    (w === 'o' ? '<span class="done-flag full">O</span>' :
     w === 'x' ? '<span class="done-flag miss">X</span>' : '');
  wtop.appendChild(wnm);
  var seg = document.createElement('div'); seg.className = 'btns seg';
  [
    { v: 'o',  label: 'O 지켰다',   cls: 'sel-o'  },
    { v: null, label: '해당없음',    cls: 'sel-na' },
    { v: 'x',  label: 'X 짜증냈다', cls: 'sel-x'  }
  ].forEach(function (opt) {
    var b = document.createElement('button');
    b.className = 'btn' + ((w === opt.v) ? ' ' + opt.cls : '');
    b.textContent = opt.label;
    b.addEventListener('click', function () { h.toggleW(opt.v); });
    seg.appendChild(b);
  });
  wc.appendChild(wtop); wc.appendChild(seg);
  wrap.appendChild(wc);

  WEEKLIES.forEach(function (item) { renderWeeklyCard(state, t, h, wrap, item); });
}

/* 주간 카드 — 투자 원칙, 손익비 스냅샷. 문구는 item(action, upcoming, open)에서, 나머지 단계 문구는 공통. */
function renderWeeklyCard(state, t, h, wrap, item) {
  var review = weeklyStatus(state, t, item);
  var card = document.createElement('div');
  card.className = 'card weekly-card review-' + review.phase;
  card.dataset.weekly = item.key;

  var top = document.createElement('div'); top.className = 'card-top';
  var nm = document.createElement('div'); nm.className = 'card-name';
  nm.textContent = item.name;
  var sub = document.createElement('span'); sub.className = 'card-sub';
  sub.textContent = item.sub;
  nm.appendChild(sub);

  if (review.done || review.phase === 'deadline' || review.phase === 'missed') {
    var flag = document.createElement('span');
    flag.className = 'done-flag ' + (review.done ? 'full' : (review.phase === 'deadline' ? 'min' : 'miss'));
    flag.textContent = review.done ? '주간 완료' : (review.phase === 'deadline' ? '오늘 마감' : '주간 미달');
    nm.appendChild(flag);
  }
  top.appendChild(nm);

  var status = document.createElement('div'); status.className = 'weekly-status';
  if (review.done) {
    status.textContent = review.reviewedOn.slice(5).replace('-', '.') + ' ' + weekday(review.reviewedOn) +
      '요일 완료' + (review.reviewedOn > review.friday ? ' · 마감 후' : '');
  } else if (review.phase === 'upcoming') {
    status.textContent = item.upcoming;
  } else if (review.phase === 'open') {
    status.textContent = item.open;
  } else if (review.phase === 'deadline') {
    status.textContent = '권장 마감일 — 아직 미완료';
  } else if (review.phase === 'missed') {
    status.textContent = '권장일 지남 — 늦게라도 완료 가능';
  } else {
    status.textContent = '업데이트 이후 주간 기록 시작';
  }
  if (item.link) {
    /* 대시보드 바로가기 — 토큰 로그인은 그쪽에서. 표준 모드 PWA에서는 Safari로 열린다 */
    var a = document.createElement('a'); a.className = 'weekly-link';
    a.href = item.link; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = '대시보드 열기 ↗';
    status.appendChild(document.createTextNode(' ')); status.appendChild(a);
  }
  card.appendChild(top); card.appendChild(status);

  var btns = document.createElement('div'); btns.className = 'btns';
  var b = document.createElement('button'); b.className = 'btn weekly-btn';
  if (review.active) {
    b.textContent = review.done ? '이번 주 완료 취소' :
      (review.phase === 'missed' ? '늦게라도 완료' : item.action);
    b.setAttribute('aria-pressed', review.done ? 'true' : 'false');
    if (review.done) b.className += ' sel-o';
    b.addEventListener('click', function () { h.toggleWeekly(item.key); });
  } else {
    b.textContent = '기록 시작 전';
    b.disabled = true;
  }
  btns.appendChild(b); card.appendChild(btns); wrap.appendChild(card);
}

/* 14일 스트립 — 칸을 누르면 그날 기록 수정으로 이동(시작일 전은 비활성). 선택 중인 과거 날짜는 황동 테두리. */
function renderStrip(state, t, h, day) {
  var wrap = document.getElementById('strip');
  wrap.innerHTML = '';
  for (var i = 13; i >= 0; i--) {
    var ds = shift(t, -i);
    var cell = document.createElement('button'); cell.type = 'button';
    cell.className = 'day' + (ds === day && ds !== t ? ' selected' : '');
    cell.disabled = ds < state.startDate;
    cell.setAttribute('aria-label', ds + ' 기록 보기');
    cell.addEventListener('click', (function (d) { return function () { if (h && h.selectDay) h.selectDay(d); }; })(ds));
    var slot = document.createElement('div'); slot.className = 'candle-slot';
    var c = document.createElement('div'); c.className = 'candle';
    if (ds >= state.startDate) {
      var comp = completion(state, ds);
      c.style.height = Math.max(7, Math.round(comp * 100)) + '%';
      if (ds === t) {
        c.className = 'candle today' + (comp > 0 || getDay(state, ds).w ? ' ' + statusOf(state, ds) : '');
        if (comp === 0) c.style.height = '7%';
      } else {
        c.className = 'candle ' + statusOf(state, ds);
      }
      c.title = ds + ' · ' + Math.round(comp * 100) + '%' + (getDay(state, ds).w === 'x' ? ' · X' : '');
    } else {
      c.style.height = '3px'; c.style.opacity = '.25';
    }
    slot.appendChild(c);
    var lb = document.createElement('div');
    lb.className = 'day-label' + (ds === t ? ' today' : '');
    lb.textContent = ds === t ? '오늘' : ds.slice(8);
    cell.appendChild(slot); cell.appendChild(lb);
    wrap.appendChild(cell);
  }
}
