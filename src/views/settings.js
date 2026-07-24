/* 설정 화면 — 목표치 수정 + 데이터 관리 정보. 버튼 wiring과 값 변경은 main.js 소유.
   h: { setGoal(key, target, min) } */
import { goalsOf, todayStr, daysBetween } from '../logic.js';

export function renderSettings(state, h) {
  renderGoals(state, h);
  renderInfo(state);
}

function renderGoals(state, h) {
  var wrap = document.getElementById('goalRows');
  wrap.innerHTML = '';
  goalsOf(state).forEach(function (g) {
    var row = document.createElement('div'); row.className = 'goal-row';

    var name = document.createElement('div'); name.className = 'goal-name';
    name.innerHTML = g.name + '<span class="goal-unit">' + g.unit + '</span>';
    row.appendChild(name);

    var tInp = mkInput(g.target), mInp = mkInput(g.min);
    row.appendChild(mkField('정상', tInp));
    row.appendChild(mkField('최소', mInp));

    function commit() {
      var target = parseInt(tInp.value, 10), min = parseInt(mInp.value, 10);
      if (isNaN(target) || isNaN(min) || target < 1 || min < 1) {
        alert('1 이상의 숫자만.');
        tInp.value = g.target; mInp.value = g.min;
        return;
      }
      if (min > target) {
        alert('최소 포지션이 정상 포지션보다 클 수 없어.');
        tInp.value = g.target; mInp.value = g.min;
        return;
      }
      if (target === g.target && min === g.min) return;
      h.setGoal(g.key, target, min);
    }
    tInp.addEventListener('change', commit);
    mInp.addEventListener('change', commit);

    wrap.appendChild(row);
  });
}

function mkInput(value) {
  var inp = document.createElement('input');
  inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = '1';
  inp.className = 'goal-input';
  inp.value = value;
  return inp;
}

function mkField(label, inp) {
  var lb = document.createElement('label'); lb.className = 'goal-field';
  var sp = document.createElement('span'); sp.textContent = label;
  lb.appendChild(sp); lb.appendChild(inp);
  return lb;
}

function renderInfo(state) {
  var t = todayStr();
  var el = document.getElementById('settingsInfo');
  el.innerHTML =
    '<div>시작일 <b class="mono">' + state.startDate + '</b> (D+' + (daysBetween(state.startDate, t) + 1) + ')</div>' +
    '<div>저장된 기록 <b class="mono">' + Object.keys(state.days).length + '일치</b></div>' +
    '<div>데이터는 이 기기(localStorage)에만 저장 — 가끔 백업 파일로 내보내둘 것.</div>';
}
