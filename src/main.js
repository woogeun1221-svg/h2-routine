import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { HABITS, WEEKLIES, goalsOf, todayStr, getDay, shift, monthList, shiftMonth, weeklyStatus } from './logic.js';
import { load, save as persist, exportText, importText, freshState } from './storage.js';
import { renderToday } from './views/today.js';
import { renderTrends } from './views/trends.js';
import { renderSettings } from './views/settings.js';
import { createReminderClient, reminderStatusText } from './reminders.js';
import { reflectionArchiveText } from './reflection.js';

/* 새 배포 감지: 로드 시 1회 + 앱 재개(resume)마다 체크 — iOS standalone은
   suspend→resume에서 리로드가 없어 이게 없으면 콜드 스타트까지 옛 버전에 머문다. */
var swRegistration = null;
registerSW({
  immediate: true,
  onRegisteredSW: function (url, r) { swRegistration = r; }
});

var state = load(todayStr());
function emptyUndo() {
  var u = {};
  HABITS.forEach(function (h) { u[h.key] = []; });
  return u;
}
var undoStack = emptyUndo();
var renderedDate = null;
var viewDate = null;           // null = 오늘. 과거 날짜 기록을 수정 중이면 'YYYY-MM-DD'
var activeTab = 'today';       // 'today' | 'trends' | 'iron' | 'settings'
var trendYm = null;            // 추이 화면에서 보고 있는 달 — 진입 시 이번 달로 리셋
var calendarMode = 'self';
var archiveFilters = { month: 'all', query: '', limit: 20 };
var reminders = createReminderClient({ onStatus: renderReminderStatus });

function renderReminderStatus() {
  if (!reminders) return;
  var answer = getDay(state, todayStr()).self;
  var text = reminderStatusText(reminders.getStatus(), answer === 'o' || answer === 'x');
  ['reminderStatus', 'reminderSettingsStatus'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}
function syncReflection() {
  var t = todayStr(), answer = getDay(state, t).self;
  return reminders.enqueue(t, answer === 'o' || answer === 'x');
}

/* ---------- save ----------
   v1은 원격 storage라 250ms 디바운스였지만, autoUpdate SW가 임의 시점에 페이지를
   reload할 수 있는 지금은 디바운스가 데이터 유실 창이 된다. localStorage는 동기·수 KB라
   매 입력마다 즉시 저장. */
function setSaveState(txt, err) {
  var el = document.getElementById('saveState');
  el.textContent = txt; el.className = 'save-state' + (err ? ' err' : '');
}
function save() {
  try {
    persist(state);
    var t = new Date();
    setSaveState('저장됨 ' + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2), false);
  } catch (e) {
    setSaveState('저장 실패 — 저장공간 확인', true);
  }
}

/* ---------- mutations ----------
   v1은 항상 '지금'의 오늘에 기록했다. 지금은 기록 대상이 targetDay() — 기본은 오늘, 과거 날짜를 고르면 그날.
   요약 수치(연속 생존, 이달 정상, 배너)는 render()에서 계속 오늘 기준으로 계산한다. */
function targetDay() { return viewDate || todayStr(); }
function selectDay(ds) {
  var t = todayStr();
  if (ds > t) ds = t;
  if (ds < state.startDate) ds = state.startDate;
  viewDate = (ds === t) ? null : ds;
  undoStack = emptyUndo();   // 되돌리기는 날짜마다 따로 — 섞이면 다른 날 수치를 깎는다
  render();
}
function ensureDay(t) {
  if (!state.days[t]) state.days[t] = { p: 0, s: 0, t: 0, r: 0, w: null };
  return state.days[t];
}
function addVal(key, step) {
  var t = targetDay();
  undoStack[key].push(step);
  ensureDay(t)[key] = (getDay(state, t)[key] || 0) + step;
  save(); render();
}
function undoVal(key) {
  var last = undoStack[key].pop();
  if (last == null) return;
  var t = targetDay();
  ensureDay(t)[key] = Math.max(0, (getDay(state, t)[key] || 0) - last);
  save(); render();
}
function setDirect(key, n) {
  var t = targetDay();
  ensureDay(t)[key] = n;
  undoStack[key] = [];
  save(); render();
}
function toggleW(v) {
  var t = targetDay();
  var curW = getDay(state, t).w || null;
  ensureDay(t).w = (curW === v) ? null : v;
  save(); render();
}
function setReflection(day, answer) {
  ensureDay(day).self = answer;
  save(); render();
  reminders.enqueue(day, answer === 'o' || answer === 'x');
}
function setReflectionReason(day, reason) {
  ensureDay(day).selfReason = reason;
  save(); // 입력 중 재렌더하지 않아 한글 조합과 커서를 보존한다.
}
/* 주간 항목(투자 원칙 i, 손익비 스냅샷 rr) 완료 토글 — 완료 취소는 그 주의 완료 표시를 모두 지운다 */
function toggleWeekly(key) {
  var item = WEEKLIES.filter(function (w) { return w.key === key; })[0];
  if (!item) return;
  var t = targetDay();
  var review = weeklyStatus(state, t, item);
  if (!review.active) return;
  if (review.done) {
    var start = state[item.startKey];
    var due = review.monday > start ? review.monday : start;
    while (due <= t && due <= review.sunday) {
      if (state.days[due]) delete state.days[due][item.key];
      due = shift(due, 1);
    }
  } else ensureDay(t)[item.key] = true;
  save(); render();
}
function setGoal(key, target, min) {
  if (!state.settings) state.settings = {};
  state.settings[key] = { target: target, min: min };
  save(); render();
}
function resetGoals() {
  if (!state.settings) return;
  var active = goalsOf(state).map(function (g) { return g.key; });
  var defaults = HABITS.filter(function (h) { return active.indexOf(h.key) >= 0; }); // 은퇴한 습관은 빼고 안내
  var targets = defaults.map(function (h) { return h.target; }).join(', ');
  var mins = defaults.map(function (h) { return h.min; }).join(', ');
  if (!confirm('목표치를 기본값(정상 ' + targets + ' / 최소 ' + mins + ')으로 되돌릴까?')) return;
  delete state.settings;
  save(); render();
}

/* ---------- tabs ---------- */
var SCREENS = { today: 'screen-today', trends: 'screen-trends', iron: 'screen-iron', settings: 'screen-settings' };

/* ---------- 헬스 탭 (Iron Terminal, React) — 처음 열 때만 지연 로드·마운트 ----------
   Iron 은 자기 localStorage 키(ironterminal:v1)를 쓰고 루틴 기록과 섞이지 않는다.
   청크는 PWA 서비스워커가 프리캐시하므로 한 번 연 뒤엔 오프라인에서도 열린다. */
var ironMounted = false;
function mountIronTab() {
  if (ironMounted) return;
  ironMounted = true;
  import('./iron/mount.tsx').then(function (m) {
    m.mountIron(document.getElementById('screen-iron'));
  }, function (e) {
    ironMounted = false;
    document.getElementById('screen-iron').textContent =
      '헬스 화면을 불러오지 못했어 — ' + (e && e.message ? e.message : '네트워크를 확인해줘.');
  });
}

function switchTab(tab) {
  activeTab = tab;
  if (tab === 'trends') trendYm = todayStr().slice(0, 7); // 진입할 때마다 이번 달부터
  render();
  window.scrollTo(0, 0);
}

function render() {
  var t = todayStr();
  renderedDate = t;

  Object.keys(SCREENS).forEach(function (tab) {
    document.getElementById(SCREENS[tab]).style.display = (tab === activeTab) ? 'block' : 'none';
  });
  document.querySelectorAll('.tabbar .tab').forEach(function (b) {
    b.className = 'tab' + (b.dataset.tab === activeTab ? ' active' : '');
  });

  if (activeTab === 'today') {
    if (viewDate && viewDate > t) viewDate = null; // 시계가 뒤로 간 경우 방어
    renderToday(state, t, {
      addVal: addVal, undoVal: undoVal, setDirect: setDirect, toggleW: toggleW,
      setReflection: setReflection, setReflectionReason: setReflectionReason,
      toggleWeekly: toggleWeekly, selectDay: selectDay, undoStack: undoStack
    }, targetDay());
  } else if (activeTab === 'trends') {
    if (!trendYm) trendYm = t.slice(0, 7);
    renderTrends(state, t, trendYm, {
      mode: calendarMode, archiveFilters: archiveFilters,
      exportArchive: function () {
        downloadTextFile(reflectionArchiveText(state, todayStr()), 'h2-reflection-archive-' + todayStr() + '.md', 'text/markdown');
      }
    });
  } else if (activeTab === 'iron') {
    mountIronTab();
  } else {
    renderSettings(state, { setGoal: setGoal });
  }
  renderReminderStatus();
}

document.querySelectorAll('.tabbar .tab').forEach(function (b) {
  b.addEventListener('click', function () { switchTab(b.dataset.tab); });
});

/* 오늘 — 기록 날짜 이동 (범위는 renderToday가 disabled로 잠금, selectDay가 한 번 더 클램프) */
document.getElementById('dayPrev').addEventListener('click', function () { selectDay(shift(targetDay(), -1)); });
document.getElementById('dayNext').addEventListener('click', function () { selectDay(shift(targetDay(), 1)); });
document.getElementById('todayBtn').addEventListener('click', function () { selectDay(todayStr()); });

/* 추이 — 월 이동 (범위는 renderTrends가 disabled로 잠금) */
document.getElementById('calPrev').addEventListener('click', function () {
  trendYm = shiftMonth(trendYm, -1); render();
});
document.getElementById('calNext').addEventListener('click', function () {
  trendYm = shiftMonth(trendYm, 1); render();
});
document.querySelectorAll('[data-calendar-mode]').forEach(function (button) {
  button.addEventListener('click', function () { calendarMode = button.dataset.calendarMode; render(); });
});

/* ---------- export / import / reset (설정 화면) ---------- */
document.getElementById('exportBtn').addEventListener('click', function () {
  var json = exportText(state);
  function fallback() { prompt('아래 JSON을 복사해서 보관해줘.', json); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(function () {
      alert('클립보드에 복사했어. [가져오기]에 붙여넣으면 데이터가 그대로 이사된다.');
    }, fallback);
  } else fallback();
});

/* 파일 내보내기 — iOS에선 공유 시트(파일 앱·에어드랍)가 가장 확실, 그 외엔 다운로드 */
document.getElementById('exportFileBtn').addEventListener('click', function () {
  downloadTextFile(exportText(state), 'h2-routine-' + todayStr() + '.json', 'application/json');
});

function downloadTextFile(text, name, type) {
  var file;
  try { file = new File([text], name, { type: type }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    navigator.share({ files: [file] }).catch(function (e) {
      if (e && e.name === 'AbortError') return; // 사용자가 시트를 닫음
      downloadFallback();
    });
    return;
  }
  downloadFallback();
  function downloadFallback() {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }
}

function applyImport(text) {
  var incoming;
  try {
    incoming = importText(text.trim(), todayStr());
  } catch (e) {
    alert('가져오기 실패 — ' + (e.message || 'JSON 형식을 확인해줘.'));
    return;
  }
  var existing = Object.keys(state.days).length;
  if (existing > 0 && !confirm('현재 기록 ' + existing + '일치를 가져온 데이터로 교체할까?')) return;
  state = incoming;
  undoStack = emptyUndo(); viewDate = null;
  save(); render();
  syncReflection();
  alert('가져오기 완료 — ' + Object.keys(state.days).length + '일치 기록, 시작일 ' + state.startDate);
}

document.getElementById('importBtn').addEventListener('click', function () {
  var text = prompt('백업 JSON을 붙여넣어줘 (v1 내보내기 포함).');
  if (text === null || text.trim() === '') return;
  applyImport(text);
});

var importFile = document.getElementById('importFile');
document.getElementById('importFileBtn').addEventListener('click', function () { importFile.click(); });
importFile.addEventListener('change', function () {
  var f = importFile.files && importFile.files[0];
  importFile.value = '';
  if (!f) return;
  f.text().then(applyImport, function () { alert('파일을 읽지 못했어.'); });
});

document.getElementById('goalRestoreBtn').addEventListener('click', resetGoals);

document.getElementById('resetBtn').addEventListener('click', function () {
  if (!confirm('모든 기록을 삭제할까? 되돌릴 수 없어.')) return;
  state = freshState(todayStr());
  undoStack = emptyUndo(); viewDate = null;
  try { persist(state); } catch (e) {}
  render();
  syncReflection();
});

document.getElementById('reminderConnectForm').addEventListener('submit', async function (event) {
  event.preventDefault();
  var input = document.getElementById('reminderConnectCode');
  var button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    await reminders.connect(input.value);
    input.value = '';
    await syncReflection();
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
});

/* ---------- day rollover + resume 시 SW 갱신 체크 ---------- */
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible') return;
  if (swRegistration) swRegistration.update().catch(function () {});
  if (renderedDate && renderedDate !== todayStr()) {
    undoStack = emptyUndo(); viewDate = null;
    if (activeTab === 'trends') trendYm = todayStr().slice(0, 7);
    render();
  }
  syncReflection();
});
window.addEventListener('online', syncReflection);
setInterval(function () {
  if (document.visibilityState !== 'visible') return;
  if (renderedDate !== todayStr()) {
    undoStack = emptyUndo(); viewDate = null;
    if (activeTab === 'trends') trendYm = todayStr().slice(0, 7);
    render();
  }
  syncReflection();
}, 60000);

/* ---------- init ---------- */
document.getElementById('loading').style.display = 'none';
document.getElementById('main').style.display = 'block';
document.getElementById('tabbar').style.display = 'flex';
render();
save();
var hashParams = new URLSearchParams(location.hash.slice(1));
var connectionCode = hashParams.get('reminder');
var ironTransfer = hashParams.get('iron-import');
if (connectionCode || ironTransfer) {
  // 연결 코드·이사 페이로드는 히스토리·공유 URL에 남기지 않는다.
  history.replaceState(null, '', location.pathname + location.search);
}
if (connectionCode) {
  reminders.connect(connectionCode).then(syncReflection).catch(function (error) { alert(error.message); });
} else syncReflection();
if (ironTransfer) {
  /* 예전 Iron(/iron/) '새 앱으로 이동' — Safari 탭/데스크톱 경로. 홈 화면 PWA 는 저장소가 분리돼
     여기로 못 오므로 그쪽은 설정의 '이사 코드 붙여넣기'를 쓴다. */
  import('./iron/transfer-apply.ts').then(function (m) {
    return m.applyTransferPayload(ironTransfer, {
      confirmReplace: function (count, summary) {
        return confirm('현재 헬스 세션 ' + count + '개를 가져온 기록(' + summary + ')으로 교체할까? 교체 전 자동 백업된다.');
      }
    });
  }).then(function (result) {
    if (result.ok) alert('헬스 기록 이사 완료 — ' + (result.summary || ''));
    else if (!result.cancelled) alert('헬스 기록 이사 실패 — ' + (result.error || ''));
    switchTab('iron');
  }, function (e) { alert('헬스 기록 이사 실패 — ' + (e && e.message ? e.message : e)); });
}
