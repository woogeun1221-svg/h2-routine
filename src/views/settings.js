/* 설정 화면 — 2단계에서는 데이터 관리(가져오기/내보내기/초기화, 버튼 wiring은 main.js)와
   기록 정보만. 목표치 수정은 3단계. */
import { todayStr, daysBetween } from '../logic.js';

export function renderSettings(state) {
  var t = todayStr();
  var el = document.getElementById('settingsInfo');
  el.innerHTML =
    '<div>시작일 <b class="mono">' + state.startDate + '</b> (D+' + (daysBetween(state.startDate, t) + 1) + ')</div>' +
    '<div>저장된 기록 <b class="mono">' + Object.keys(state.days).length + '일치</b></div>' +
    '<div>데이터는 이 기기(localStorage)에만 저장 — 가끔 [데이터 내보내기]로 백업해둘 것.</div>' +
    '<div class="settings-todo">목표치 수정은 3단계에서.</div>';
}
