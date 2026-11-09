/* 27 담금질 프로젝트(2026-11-09 시작, 2026-12-31 마감) — 일간 루틴과 별개인 사이드 프로젝트.
   statusOf, 스트릭, 알림, 봇 요약에는 들어가지 않는다(루틴 판정은 그대로). 오늘 화면 맨 위 블록과 자기 집계만 쓴다.
   기간은 선언된 약속이라 활성일(처음 연 날) 대신 고정 날짜다. 주는 시작일(월요일)부터 7일, 격주는 14일 단위.
   기록은 완료한 날의 day 필드에 남긴다: bk(읽은 책), wr(쓴 글), stk(본 종목)는 제목 문자열, fx는 운동 O(불리언).
   운동은 fx가 아니어도 그날 운동 슬롯(e)이나 런닝(runs)을 기록했으면 한 것으로 본다(주말 포함, logic.exercisedOn). */
import { getDay, shift, daysBetween, exercisedOn } from './logic.js';

export const FORGE = { name: '27 담금질', sub: '2027년을 위한 기준 올리기', start: '2026-11-09', end: '2026-12-31' };
export const FORGE_ITEMS = [
  { key: 'bk',  name: '독서',   goal: '주 1권',    span: 7,  ask: '읽은 책 제목', unit: '권' },
  { key: 'wr',  name: '글쓰기', goal: '2주 1편',   span: 14, ask: '쓴 글 제목',   unit: '편' },
  { key: 'stk', name: '종목',   goal: '주 1종목',  span: 7,  ask: '본 종목',      unit: '종목' },
  { key: 'fx',  name: '운동',   goal: '매일',      span: 1,  unit: '일' }
];
export const FORGE_TEXT_KEYS = ['bk', 'wr', 'stk'];
export const FORGE_TITLE_MAX = 200;

export function forgeItem(key) { return FORGE_ITEMS.filter(function (it) { return it.key === key; })[0]; }
export function forgeActive(ds) { return ds >= FORGE.start && ds <= FORGE.end; }
export function forgeDaysLeft(ds) { return daysBetween(ds, FORGE.end); }

/* 항목의 구간 전부 — 시작일부터 span일씩, 마지막 구간은 마감일에서 자른다. */
export function forgeWindows(item) {
  var out = [], s = FORGE.start;
  while (s <= FORGE.end) {
    var e = shift(s, item.span - 1);
    out.push({ start: s, end: e > FORGE.end ? FORGE.end : e });
    s = shift(s, item.span);
  }
  return out;
}
export function forgeWindowOf(item, ds) {
  if (!forgeActive(ds)) return null;
  var i = Math.floor(daysBetween(FORGE.start, ds) / item.span);
  return forgeWindows(item)[i];
}

/* 그날 기록 — 글 항목은 제목(빈 문자열은 없음), 운동은 'manual' | 'slot' | null. */
export function forgeMark(state, item, ds) {
  var d = getDay(state, ds);
  if (item.key === 'fx') return exercisedOn(state, ds); // 'slot' | 'run' | 'manual' | null
  var v = d[item.key];
  return (typeof v === 'string' && v.trim()) ? v.trim() : null;
}

export function forgeEntries(state, item, win) {
  var out = [];
  for (var ds = win.start; ds <= win.end; ds = shift(ds, 1)) {
    var m = forgeMark(state, item, ds);
    if (m) out.push({ ds: ds, title: m });
  }
  return out;
}

/* ds(보는 날) 기준 항목 상태. today 기준으로 구간 판정(지난 구간 미기록 = 미달).
   phase: done(이 구간 완료) | last(오늘이 구간 마지막 날) | open | off(기간 밖). */
export function forgeItemStatus(state, item, ds, today) {
  var win = forgeWindowOf(item, ds);
  var windows = forgeWindows(item).map(function (w) {
    var done = forgeEntries(state, item, w).length > 0;
    var st = done ? 'done' : (w.end < today ? 'miss' : (w.start <= today ? 'open' : 'future'));
    return { start: w.start, end: w.end, state: st };
  });
  var doneN = windows.filter(function (w) { return w.state === 'done'; }).length;
  var missN = windows.filter(function (w) { return w.state === 'miss'; }).length;
  var count = 0;
  windows.forEach(function (w) { count += forgeEntries(state, item, w).length; });
  if (!win) return { phase: 'off', win: null, entries: [], windows: windows, doneN: doneN, missN: missN, total: windows.length, count: count };
  var entries = forgeEntries(state, item, win);
  var phase = entries.length ? 'done' : (item.span > 1 && ds === win.end ? 'last' : 'open'); // 매일 항목은 마감 경고 없음
  return { phase: phase, win: win, entries: entries, windows: windows, doneN: doneN, missN: missN, total: windows.length, count: count };
}
