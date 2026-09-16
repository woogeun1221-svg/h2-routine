import { getDay } from '../logic.js';
import { reflectionMonthStats, reflectionMonths, reflectionArchive } from '../reflection.js';

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

export function renderReflectionHistory(state, month, today) {
  const root = document.getElementById('reflectionHistory');
  if (!root) return;
  root.replaceChildren();
  const title = document.createElement('h2');
  title.className = 'reflection-section-title';
  title.textContent = '가슴에 손을 얹고';
  root.appendChild(title);
  const subtitle = document.createElement('p');
  subtitle.className = 'settings-note';
  subtitle.textContent = month.replace('-', '.') + ' · 스스로에게 만족할만한 하루를 보냈는가?';
  root.appendChild(subtitle);
  const stats = reflectionMonthStats(state, month, today);
  const chips = document.createElement('div');
  chips.className = 'reflection-stats';
  for (const [label, value, className] of [
    ['O', stats.o + '일', 'self-o'], ['X', stats.x + '일', 'self-x'],
    ['O 비율', stats.rate === null ? '—' : stats.rate + '%', '']
  ]) {
    const chip = document.createElement('div');
    chip.className = 'reflection-stat ' + className;
    const name = document.createElement('span'); name.textContent = label;
    const number = document.createElement('b'); number.textContent = value;
    chip.append(name, number); chips.appendChild(chip);
  }
  root.appendChild(chips);
  const note = document.createElement('p');
  note.className = 'table-note';
  note.textContent = 'O 비율 = O / (O + X) · 오늘 포함 · 미응답은 제외';
  root.appendChild(note);
  const jump = document.createElement('button');
  jump.className = 'reset archive-jump'; jump.textContent = 'X 사유 전체 보기 ↓';
  jump.addEventListener('click', () => document.getElementById('reflectionArchive')?.scrollIntoView({ block: 'start' }));
  root.appendChild(jump);

  const rows = reflectionMonths(state, today);
  if (!rows.length) return;
  const ledger = document.createElement('div'); ledger.className = 'ledger-wrap reflection-months';
  const table = document.createElement('table'); table.className = 'ledger';
  table.innerHTML = '<caption>월별 하루 만족도</caption><thead><tr><th>월</th><th>O</th><th>X</th><th>O 비율</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.month === month) tr.className = 'selected-month';
    for (const value of [row.month.replace('-', '.'), row.o + '일', row.x + '일', row.rate + '%']) {
      const cell = document.createElement('td'); cell.textContent = value; tr.appendChild(cell);
    }
    body.appendChild(tr);
  }
  table.appendChild(body); ledger.appendChild(table); root.appendChild(ledger);
}

export function renderReflectionArchive(state, today, filters = { month: 'all', query: '', limit: 20 }, handlers = {}) {
  const root = document.getElementById('reflectionArchive');
  if (!root) return;
  root.replaceChildren();
  const entries = reflectionArchive(state, today);
  const title = document.createElement('h2');
  title.className = 'reflection-section-title'; title.textContent = 'X 사유 아카이브';
  const note = document.createElement('p'); note.className = 'settings-note';
  note.textContent = '모든 날짜의 사유를 최근 순으로 모았습니다. O로 바꾼 날의 사유도 보관합니다.';
  const toolbar = document.createElement('div'); toolbar.className = 'archive-tools';
  const months = [...new Set(entries.map(entry => entry.day.slice(0, 7)))];
  if (!months.includes(filters.month)) filters.month = 'all';
  const select = document.createElement('select'); select.id = 'archiveMonth';
  select.setAttribute('aria-label', '사유 아카이브 기간');
  for (const month of ['all', ...months]) {
    const option = document.createElement('option'); option.value = month;
    option.textContent = month === 'all' ? '전체 기간' : month.replace('-', '.');
    select.appendChild(option);
  }
  select.value = filters.month;
  const search = document.createElement('input'); search.id = 'archiveSearch'; search.type = 'search';
  search.placeholder = '사유 또는 날짜 검색'; search.setAttribute('aria-label', '사유 또는 날짜 검색');
  search.value = filters.query;
  toolbar.append(select, search);
  const count = document.createElement('p'); count.className = 'settings-note'; count.id = 'archiveCount';
  count.setAttribute('role', 'status');
  const list = document.createElement('div'); list.id = 'archiveEntries';
  const more = document.createElement('button'); more.className = 'btn archive-more'; more.textContent = '더 보기';
  const exportButton = document.createElement('button'); exportButton.className = 'btn archive-export';
  exportButton.textContent = '전체 아카이브 내보내기'; exportButton.disabled = !entries.length;
  exportButton.addEventListener('click', () => handlers.exportArchive?.());
  const storageNote = document.createElement('p'); storageNote.className = 'settings-note';
  storageNote.textContent = '이 브라우저에 누적 저장됩니다. 내보내면 전체 사유를 파일로 보관할 수 있습니다.';
  root.append(title, note, toolbar, count, list, more, exportButton, storageNote);

  function renderList() {
    list.replaceChildren();
    const query = filters.query.trim().toLocaleLowerCase();
    const matched = entries.filter(entry => (filters.month === 'all' || entry.day.startsWith(filters.month)) &&
      (!query || (entry.day + ' ' + entry.day.replaceAll('-', '.') + ' ' + entry.reason).toLocaleLowerCase().includes(query)));
    count.textContent = '전체 ' + entries.length + '건 · 표시 ' + Math.min(matched.length, filters.limit) + ' / ' + matched.length + '건';
    if (!matched.length) {
      const empty = document.createElement('p'); empty.className = 'settings-note';
      empty.textContent = entries.length ? '검색 조건에 맞는 사유가 없습니다.' : 'X를 선택하고 남긴 사유가 이곳에 쌓입니다.';
      list.appendChild(empty);
    }
    for (const entry of matched.slice(0, filters.limit)) {
      const row = document.createElement('article'); row.className = 'reflection-entry'; row.dataset.day = entry.day;
      const date = document.createElement('time'); date.dateTime = entry.day;
      date.textContent = entry.day.replaceAll('-', '.');
      const badge = document.createElement('span'); badge.className = entry.answer === 'x' ? 'self-x' : 'archive-retained';
      badge.textContent = entry.answer === 'x' ? 'X' : '현재 ' + (entry.answer?.toUpperCase() || '미응답') + ' · 보관된 사유';
      const head = document.createElement('div'); head.className = 'archive-entry-head'; head.append(date, badge);
      const reason = document.createElement('p');
      reason.textContent = entry.reason.trim() ? entry.reason : '사유를 아직 적지 않았습니다.';
      if (!entry.reason.trim()) reason.className = 'archive-empty-reason';
      row.append(head, reason); list.appendChild(row);
    }
    more.hidden = matched.length <= filters.limit;
  }
  select.addEventListener('change', () => { filters.month = select.value; filters.limit = 20; renderList(); });
  search.addEventListener('input', () => { filters.query = search.value; filters.limit = 20; renderList(); });
  more.addEventListener('click', () => { filters.limit += 20; renderList(); });
  renderList();
}

export function showReflectionDay(state, day) {
  const root = document.getElementById('reflectionDay');
  if (!root) return;
  const entry = getDay(state, day);
  root.replaceChildren(); root.hidden = false;
  const title = document.createElement('b');
  title.textContent = day.replaceAll('-', '.') + ' · ' + (entry.self?.toUpperCase() || '미응답');
  root.appendChild(title);
  if (entry.selfReason || entry.self === 'x') {
    const reason = document.createElement('p');
    reason.textContent = (entry.self !== 'x' ? '보관된 X 사유: ' : '') + (entry.selfReason?.trim() ? entry.selfReason : '사유를 아직 적지 않았습니다.');
    root.appendChild(reason);
  }
}
