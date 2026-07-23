/* 오늘 화면 렌더 — v1의 render/renderCards/renderStrip/renderMonthly 1:1 이식.
   h(핸들러): { addVal, undoVal, setDirect, toggleW, undoStack } — 값 변경은 전부 main.js가 소유. */
import {
  HABITS, WIFE, shift, daysBetween, weekday,
  getDay, statusOf, completion, streak, monthFullRate, monthlyRows
} from '../logic.js';

export function renderToday(state, t, h) {
  var p = t.split('-');
  document.getElementById('dateStr').textContent = p[0] + '.' + p[1] + '.' + p[2] + ' ' + weekday(t);
  document.getElementById('dplus').textContent = 'D+' + (daysBetween(state.startDate, t) + 1);

  document.getElementById('streak').textContent = streak(state, t) + '일';
  var fr = monthFullRate(state, t);
  document.getElementById('fullRate').textContent = (fr === null) ? '—' : fr + '%';

  var y = shift(t, -1);
  var show = (y >= state.startDate) && statusOf(state, y) === 'miss';
  document.getElementById('banner').className = 'banner' + (show ? ' show' : '');

  renderCards(state, t, h);
  renderStrip(state, t);
  renderMonthly(state, t);
}

function renderCards(state, t, h) {
  var d = getDay(state, t), wrap = document.getElementById('cards');
  wrap.innerHTML = '';

  HABITS.forEach(function (hb) {
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
    ub.disabled = h.undoStack[hb.key].length === 0;
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
}

function renderStrip(state, t) {
  var wrap = document.getElementById('strip');
  wrap.innerHTML = '';
  for (var i = 13; i >= 0; i--) {
    var ds = shift(t, -i);
    var cell = document.createElement('div'); cell.className = 'day';
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
