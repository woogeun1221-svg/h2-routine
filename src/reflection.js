/* 기존 일별 기록에서만 계산한다. 미응답을 X로 바꾸거나 과거 기록을 수정하지 않는다. */
export function reflectionMonths(state, today) {
  const months = new Map();
  for (const [day, entry] of Object.entries(state.days)) {
    if (day > today || !['o', 'x'].includes(entry.self)) continue;
    const month = day.slice(0, 7);
    const row = months.get(month) || { month, o: 0, x: 0 };
    row[entry.self]++;
    months.set(month, row);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month)).map(row => ({
    ...row, total: row.o + row.x, rate: Math.round(row.o / (row.o + row.x) * 100)
  }));
}

export function reflectionMonthStats(state, month, today) {
  return reflectionMonths(state, today).find(row => row.month === month) ||
    { month, o: 0, x: 0, total: 0, rate: null };
}

export function reflectionArchive(state, today) {
  return Object.entries(state.days)
    .filter(([day, entry]) => day <= today && (entry.self === 'x' || entry.selfReason?.trim()))
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, entry]) => ({ day, answer: entry.self || null, reason: entry.selfReason || '' }));
}

export function reflectionArchiveText(state, today) {
  const entries = reflectionArchive(state, today);
  const lines = ['# 하루 만족도 · X 사유 아카이브', '', '내보낸 날짜: ' + today,
    '전체 ' + entries.length + '건 · 최근 날짜부터', ''];
  for (const entry of entries) {
    const status = entry.answer === 'x' ? 'X' : '현재 ' + (entry.answer?.toUpperCase() || '미응답') + ' · 보관된 X 사유';
    lines.push('## ' + entry.day + ' · ' + status, '',
      (entry.reason.trim() ? entry.reason : '사유를 아직 적지 않았습니다.').split('\n').map(line => '> ' + line).join('\n'), '');
  }
  return lines.join('\n');
}
