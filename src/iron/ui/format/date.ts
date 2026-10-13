/**
 * 날짜 포매팅 — 표시 전용. 입력은 YYYY-MM-DD 로컬 날짜 문자열.
 *
 * 도메인의 localDate(dateUtil 이 생성)는 전부 문자열이라 타임존 드리프트가 없다.
 * 여기서도 파싱을 문자열 파트로 직접 하고, 요일 계산만 UTC 기준 Date 로 하여
 * (연·월·일을 UTC 로 고정) 로컬 타임존이 요일을 흔들지 못하게 한다.
 * 순수 함수 · 외부 import 없음.
 */

const WEEKDAYS_KR = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "YYYY-MM-DD" → {y,m,d} 숫자. 형식이 아니면 null. */
function parts(
  iso: string | null | undefined,
): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return null;
  }
  return { y, m: mo, d };
}

/**
 * 짧은 날짜 "M/D" (선행 0 제거). 예: "2026-07-01" → "7/1".
 * 잘못된 입력 → "—".
 */
export function fmtDateShort(iso: string | null | undefined): string {
  const p = parts(iso);
  if (!p) return "—";
  return `${p.m}/${p.d}`;
}

/**
 * 요일(한 글자). 예: "2026-07-01" → "수".
 * UTC 기준으로 요일을 계산해 로컬 타임존 영향 배제. 잘못된 입력 → "".
 */
export function fmtWeekday(iso: string | null | undefined): string {
  const p = parts(iso);
  if (!p) return "";
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return WEEKDAYS_KR[dow] ?? "";
}

/**
 * 전체 한글 날짜 "M월 D일 (요일)". 예: "2026-07-01" → "7월 1일 (수)".
 * withYear=true 면 "YYYY년 M월 D일 (요일)". 잘못된 입력 → "—".
 */
export function fmtDateFull(
  iso: string | null | undefined,
  withYear = false,
): string {
  const p = parts(iso);
  if (!p) return "—";
  const wd = fmtWeekday(iso);
  const base = `${p.m}월 ${p.d}일 (${wd})`;
  return withYear ? `${p.y}년 ${base}` : base;
}

/**
 * 상대 날짜 라벨(오늘/어제 우선, 아니면 짧은 날짜).
 * today 도 YYYY-MM-DD 문자열로 주입(도메인 todayLocal() 결과).
 * 예: iso===today → "오늘", 하루 전 → "어제", 그 외 → "M/D".
 */
export function fmtRelativeDay(
  iso: string | null | undefined,
  today: string,
): string {
  const p = parts(iso);
  const t = parts(today);
  if (!p) return "—";
  if (!t) return fmtDateShort(iso);
  const a = Date.UTC(p.y, p.m - 1, p.d);
  const b = Date.UTC(t.y, t.m - 1, t.d);
  const diffDays = Math.round((b - a) / 86400000);
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  return fmtDateShort(iso);
}
