import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { todayStr, getDay } from './logic.js';
import { load, save as persist, exportText, importText, freshState } from './storage.js';
import { renderToday } from './views/today.js';

registerSW({ immediate: true });

var state = load(todayStr());
var undoStack = { p: [], s: [], r: [] };
var renderedDate = null;

/* ---------- save (v1과 동일한 디바운스 + 표시) ---------- */
function setSaveState(txt, err) {
  var el = document.getElementById('saveState');
  el.textContent = txt; el.className = 'save-state' + (err ? ' err' : '');
}
var saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try {
      persist(state);
      var t = new Date();
      setSaveState('저장됨 ' + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2), false);
    } catch (e) {
      setSaveState('저장 실패 — 저장공간 확인', true);
    }
  }, 250);
}

/* ---------- mutations (v1과 동일하게 항상 '지금'의 오늘 날짜에 기록) ---------- */
function ensureDay(t) {
  if (!state.days[t]) state.days[t] = { p: 0, s: 0, r: 0, w: null };
  return state.days[t];
}
function addVal(key, step) {
  var t = todayStr();
  undoStack[key].push(step);
  ensureDay(t)[key] = (getDay(state, t)[key] || 0) + step;
  save(); render();
}
function undoVal(key) {
  var last = undoStack[key].pop();
  if (last == null) return;
  var t = todayStr();
  ensureDay(t)[key] = Math.max(0, (getDay(state, t)[key] || 0) - last);
  save(); render();
}
function setDirect(key, n) {
  var t = todayStr();
  ensureDay(t)[key] = n;
  undoStack[key] = [];
  save(); render();
}
function toggleW(v) {
  var t = todayStr();
  var curW = getDay(state, t).w || null;
  ensureDay(t).w = (curW === v) ? null : v;
  save(); render();
}

function render() {
  var t = todayStr();
  renderedDate = t;
  renderToday(state, t, { addVal: addVal, undoVal: undoVal, setDirect: setDirect, toggleW: toggleW, undoStack: undoStack });
}

/* ---------- export / import / reset ---------- */
document.getElementById('exportBtn').addEventListener('click', function () {
  var json = exportText(state);
  function fallback() { prompt('아래 JSON을 복사해서 보관해줘.', json); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(function () {
      alert('클립보드에 복사했어. [가져오기]에 붙여넣으면 데이터가 그대로 이사된다.');
    }, fallback);
  } else fallback();
});

document.getElementById('importBtn').addEventListener('click', function () {
  var text = prompt('v1 [데이터 내보내기]로 복사한 JSON을 붙여넣어줘.');
  if (text === null || text.trim() === '') return;
  var incoming;
  try {
    incoming = importText(text.trim());
  } catch (e) {
    alert('가져오기 실패 — ' + (e.message || 'JSON 형식을 확인해줘.'));
    return;
  }
  var existing = Object.keys(state.days).length;
  if (existing > 0 && !confirm('현재 기록 ' + existing + '일치를 붙여넣은 데이터로 교체할까?')) return;
  state = incoming;
  undoStack = { p: [], s: [], r: [] };
  save(); render();
  alert('가져오기 완료 — ' + Object.keys(state.days).length + '일치 기록, 시작일 ' + state.startDate);
});

document.getElementById('resetBtn').addEventListener('click', function () {
  if (!confirm('모든 기록을 삭제할까? 되돌릴 수 없어.')) return;
  state = freshState(todayStr());
  undoStack = { p: [], s: [], r: [] };
  try { persist(state); } catch (e) {}
  render();
});

/* ---------- day rollover ---------- */
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && renderedDate && renderedDate !== todayStr()) {
    undoStack = { p: [], s: [], r: [] };
    render();
  }
});

/* ---------- init ---------- */
document.getElementById('loading').style.display = 'none';
document.getElementById('main').style.display = 'block';
render();
save();
