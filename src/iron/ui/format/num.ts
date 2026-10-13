/**
 * 숫자 포매팅 — ko-KR 로케일, 모노 정렬 전제.
 *
 * 반환은 항상 문자열. 표시 요소에는 .num/.mono 클래스로 tabular-nums 를 걸어 자릿수 정렬한다.
 * 무게는 0.5kg 단위까지 의미가 있으므로 최대 1자리, 정수면 소수점 생략.
 * 순수 함수 · 외부 import 없음.
 */

/** 유한 숫자인지 가드. null/undefined/NaN/Infinity 는 false. */
function isNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/**
 * 무게(kg). 소수 최대 1자리, 정수면 소수점 없음.
 * 예: 60 → "60", 62.5 → "62.5". 무게 없음(자체중량) → "—".
 * withUnit=true 면 " kg" 접미(기본 false, 단위는 보통 별도 span).
 */
export function fmtKg(
  kg: number | null | undefined,
  withUnit = false,
): string {
  if (!isNum(kg)) return "—";
  const s = new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(kg);
  return withUnit ? `${s} kg` : s;
}

/**
 * 횟수(reps). 정수. 예: 12 → "12", withUnit → "12회".
 * 값 없음 → "—".
 */
export function fmtReps(
  reps: number | null | undefined,
  withUnit = false,
): string {
  if (!isNum(reps)) return "—";
  const n = Math.round(reps);
  return withUnit ? `${n}회` : String(n);
}

/**
 * 볼륨(무게×횟수 합 또는 Σreps). 천단위 구분, 정수 반올림.
 * 예: 12480 → "12,480". 값 없음 → "—".
 * withUnit=true 면 " kg"(kg-볼륨용). 자체중량 rep-볼륨은 withUnit 생략 권장.
 */
export function fmtVolume(
  vol: number | null | undefined,
  withUnit = false,
): string {
  if (!isNum(vol)) return "—";
  const s = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(Math.round(vol));
  return withUnit ? `${s} kg` : s;
}

/**
 * 변화량(델타) — 부호 화살표 포함. ▲▼ 스타일.
 * 양수 → "▲ 2.5"(up), 음수 → "▼ 2.5"(down), 0/무변화 → "— 0"(flat).
 * digits: 소수 자리(기본 1, 무게 델타용). reps 델타는 digits=0.
 * 반환은 문자열만 — 색은 호출부에서 sign 으로 클래스(.up/.down/.flat) 결정.
 */
export function fmtDelta(
  delta: number | null | undefined,
  digits = 1,
): string {
  if (!isNum(delta) || delta === 0) return "±0";
  const abs = new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Math.abs(delta));
  return delta > 0 ? `▲ ${abs}` : `▼ ${abs}`;
}

/**
 * 델타 부호 → 방향 문자열(색 클래스 결정용 헬퍼).
 * "up" | "down" | "flat". null/0 은 "flat".
 */
export function deltaSign(
  delta: number | null | undefined,
): "up" | "down" | "flat" {
  if (!isNum(delta) || delta === 0) return "flat";
  return delta > 0 ? "up" : "down";
}

/**
 * 세트 한 개를 "무게×횟수" 칩 문자열로.
 * 예: (60, 12) → "60×12", 자체중량(null, 15) → "15회".
 */
export function fmtSetChip(
  kg: number | null | undefined,
  reps: number | null | undefined,
): string {
  const r = fmtReps(reps);
  if (!isNum(kg)) return isNum(reps) ? `${r}회` : "—";
  return `${fmtKg(kg)}×${r}`;
}

/**
 * e1RM 등 소수 1자리 일반 수치. 값 없음 → "—".
 */
export function fmt1(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(v);
}
