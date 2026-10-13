/**
 * 날짜 유틸 — 전부 "YYYY-MM-DD" 문자열 기반, 타임존 드리프트 없음.
 *
 * 원칙:
 * - 저장·비교·연산은 모두 문자열/정수로만 처리한다.
 * - 로컬 Date 읽기는 오직 todayLocal()/toLocalDate()에서만 (기록 시점 1회 로컬 계산).
 * - addDays/isoWeekKey 는 UTC 기준 순수 산술이라 DST·시차의 영향을 받지 않는다.
 */

/** "YYYY-MM-DD" 유효성(형태만) 체크. */
function assertIsoDate(isoDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`잘못된 날짜 형식(YYYY-MM-DD 기대): ${isoDate}`);
  }
}

/** 2자리 0-패딩. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Date 객체의 "로컬" 연·월·일을 YYYY-MM-DD 문자열로.
 * 로컬 타임존을 읽는 유일한 경로(기록 시점의 localDate 산출용).
 */
export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 오늘의 로컬 날짜 "YYYY-MM-DD". */
export function todayLocal(): string {
  return toLocalDate(new Date());
}

/**
 * isoDate 에 n 일을 더한(음수면 뺀) "YYYY-MM-DD".
 * UTC 자정 앵커에서 밀리초 산술 → DST 경계에서도 하루가 밀리지 않는다.
 */
export function addDays(isoDate: string, n: number): string {
  assertIsoDate(isoDate);
  const parts = isoDate.split("-").map((s) => Number(s));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  // UTC 기준으로 생성·산술·판독 → 로컬 타임존 무관.
  const base = Date.UTC(y, m - 1, d);
  const shifted = new Date(base + n * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(
    shifted.getUTCDate()
  )}`;
}

/**
 * ISO-8601 주 키 "YYYY-Www" (월요일 시작, 첫 목요일이 속한 주 = 1주).
 * 연말/연초 경계에서 소속 연도가 달력 연도와 다를 수 있음(ISO week-year).
 * 예: 2026-01-01(목) → "2026-W01".
 */
export function isoWeekKey(isoDate: string): string {
  assertIsoDate(isoDate);
  const parts = isoDate.split("-").map((s) => Number(s));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;

  // UTC 앵커. getUTCDay: 0=일 … 6=토. ISO 요일: 1=월 … 7=일.
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const isoDow = anchor.getUTCDay() === 0 ? 7 : anchor.getUTCDay();

  // 해당 주의 목요일로 이동(그 목요일이 속한 해가 ISO week-year).
  const thursday = new Date(anchor.getTime());
  thursday.setUTCDate(anchor.getUTCDate() + (4 - isoDow));

  const weekYear = thursday.getUTCFullYear();
  // 그 해 1월 1일. 1월 1일이 속한 주의 목요일과의 거리로 주차 산출.
  const jan1 = new Date(Date.UTC(weekYear, 0, 1));
  const dayDiff = Math.round(
    (thursday.getTime() - jan1.getTime()) / 86_400_000
  );
  const week = Math.floor(dayDiff / 7) + 1;

  return `${weekYear}-W${pad2(week)}`;
}
