import { getDay } from '../logic.js';

export const REFLECTION_QUESTION = '가슴에 손을 얹고 스스로에게 만족할만한 하루를 보냈는가?';

export function renderReflection(state, day, handlers) {
  const root = document.getElementById('reflection');
  if (!root) return;
  const entry = getDay(state, day);
  root.replaceChildren();

  const title = document.createElement('h2');
  title.className = 'reflection-question';
  title.textContent = REFLECTION_QUESTION;
  root.appendChild(title);

  const choices = document.createElement('div');
  choices.className = 'btns reflection-choices';
  for (const answer of ['o', 'x']) {
    const button = document.createElement('button');
    button.className = 'btn' + (entry.self === answer ? ' sel-' + answer : '');
    button.textContent = answer.toUpperCase();
    button.setAttribute('aria-label', answer === 'o' ? 'O 만족했다' : 'X 만족하지 못했다');
    button.setAttribute('aria-pressed', String(entry.self === answer));
    button.addEventListener('click', () => handlers.setReflection(day, answer));
    choices.appendChild(button);
  }
  root.appendChild(choices);

  if (entry.self === 'x') {
    const label = document.createElement('label');
    label.className = 'reflection-label';
    label.htmlFor = 'reflectionReason';
    label.textContent = '왜 만족하지 못했는가?';
    const reason = document.createElement('textarea');
    reason.id = 'reflectionReason';
    reason.className = 'reflection-reason';
    reason.rows = 3;
    reason.maxLength = 4000;
    reason.placeholder = '이유를 적어두세요. 입력하면 바로 저장됩니다.';
    reason.value = entry.selfReason || '';
    reason.addEventListener('input', () => handlers.setReflectionReason(day, reason.value));
    root.append(label, reason);
  }

  const footer = document.createElement('div');
  footer.className = 'reflection-footer';
  const status = document.createElement('span');
  status.id = 'reminderStatus';
  status.setAttribute('role', 'status');
  footer.appendChild(status);
  if (entry.self === 'o' || entry.self === 'x') {
    const clear = document.createElement('button');
    clear.className = 'reset';
    clear.textContent = '선택 취소';
    clear.addEventListener('click', () => handlers.setReflection(day, null));
    footer.appendChild(clear);
  }
  root.appendChild(footer);
}

export function renderReflectionHistory(state, month) {
  const root = document.getElementById('reflectionHistory');
  if (!root) return;
  root.replaceChildren();
  const title = document.createElement('div');
  title.className = 'strip-title';
  title.textContent = '하루 만족도 · ' + month.replace('-', '.');
  root.appendChild(title);
  const days = Object.keys(state.days).filter(day => day.startsWith(month) &&
    ['o', 'x'].includes(state.days[day].self)).sort().reverse();
  if (!days.length) {
    const empty = document.createElement('p');
    empty.className = 'settings-note';
    empty.textContent = '아직 기록이 없습니다.';
    root.appendChild(empty);
  }
  for (const day of days) {
    const entry = state.days[day];
    const row = document.createElement('details');
    row.className = 'reflection-entry';
    const summary = document.createElement('summary');
    summary.textContent = day.slice(5).replace('-', '.') + ' · ' + entry.self.toUpperCase();
    summary.className = entry.self === 'o' ? 'self-o' : 'self-x';
    const reason = document.createElement('p');
    reason.textContent = entry.self === 'x' ? (entry.selfReason || '이유를 적지 않았습니다.') : '스스로에게 만족한 하루.';
    row.append(summary, reason);
    root.appendChild(row);
  }
}
