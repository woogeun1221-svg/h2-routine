/**
 * 차트 공용 테마 토큰 + 순수 SVG 좌표 헬퍼.
 *
 * recharts 를 걷어내고 손수 만든 인라인 <svg> 로 차트를 그린다.
 * 모든 차트는 고정 viewBox(VIEW_W×VIEW_H) 공간에 데이터를 매핑하고
 * CSS 로 width:100%·height:auto 스케일한다(JS 측정 없음). 선에는
 * vector-effect="non-scaling-stroke" 를 걸어 CSS 스케일에도 선 굵기를 고정한다.
 *
 * styles.css 의 CSS 변수와 색을 일치시킨다(다크 · 모노 눈금 · up-red 강조).
 * 주의: 이 파일은 순수 상수/헬퍼만. React/도메인 타입 import 없음.
 */

// ─────────────────────────────────────────────────────────────
// 색 (styles.css :root 와 동일 값)
// ─────────────────────────────────────────────────────────────
export const CHART_COLORS = {
  bg1: "#12161f",
  bg2: "#1b212c",
  line: "#2a3140",
  text: "#e6edf3",
  textDim: "#9aa4b2",
  textFaint: "#6b7280",
  /** 상승·신기록·달성 강조 */
  up: "#f6465d",
  upSoft: "rgba(246, 70, 93, 0.14)",
  /** 드문 하락 = 파랑 */
  down: "#2f81f7",
  /** 유지/경고/목표선 = amber */
  hold: "#d29922",
  /** 뮤트(최신값이 첫값보다 낮을 때의 라인/필) */
  muted: "#4b5563",
  mutedSoft: "rgba(75, 85, 99, 0.16)",
  /** 개인 신기록 마커 */
  prGold: "#ffd866",
} as const;

// ─────────────────────────────────────────────────────────────
// 폰트 (숫자 눈금은 모노 · tabular)
// ─────────────────────────────────────────────────────────────
export const CHART_FONT = {
  mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
  kr: '"IBM Plex Sans KR", -apple-system, "Apple SD Gothic Neo", sans-serif',
  axisSize: 11,
  labelSize: 11,
} as const;

// ─────────────────────────────────────────────────────────────
// viewBox 좌표 공간 + 플롯 여백
// 데이터는 이 고정 좌표계에 매핑되고 CSS 로 스케일된다.
// ─────────────────────────────────────────────────────────────
/** viewBox 너비/높이(고정). */
export const VIEW_W = 340;
export const VIEW_H = 180;
/** 플롯 영역 여백: 좌(Y라벨) · 우(목표라벨) · 상 · 하(X날짜). */
export const PLOT = {
  left: 34,
  right: 46,
  top: 12,
  bottom: 20,
} as const;
/** 플롯 영역 경계(px, viewBox 좌표). */
export const PLOT_X0 = PLOT.left;
export const PLOT_X1 = VIEW_W - PLOT.right;
export const PLOT_Y0 = PLOT.top;
export const PLOT_Y1 = VIEW_H - PLOT.bottom;
export const PLOT_W = PLOT_X1 - PLOT_X0;
export const PLOT_H = PLOT_Y1 - PLOT_Y0;

/** 도트 반경: 일반 점 vs 마지막 점 강조 vs PR 다이아몬드. */
export const DOT_RADIUS = {
  normal: 2.5,
  active: 4,
  last: 4.5,
  pr: 5,
} as const;

export const STROKE_WIDTH = {
  line: 2,
  ref: 1.5,
  grid: 1,
} as const;

// ─────────────────────────────────────────────────────────────
// 그라데이션 id (defs 에서 정의 → fill="url(#..)" 로 참조)
// 차트마다 고유 id 여야 SVG defs 충돌이 없다.
// ─────────────────────────────────────────────────────────────
export const GRAD_ID = {
  /** 우상향(최신≥첫) 라인 하단 up-red 필 */
  areaUp: "it-grad-area-up",
  /** 하향/뮤트 라인 하단 필 */
  areaMuted: "it-grad-area-muted",
  /** 볼륨 Area up-red 필 */
  volume: "it-grad-volume",
} as const;

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

/**
 * 시리즈 방향에 따른 라인/필 색 결정.
 * 최신값이 첫값 이상이면 우상향(up-red 강조), 아니면 뮤트.
 * 값이 부족하면(0~1개) 뮤트로 취급.
 */
export function trendColor(
  first: number | null | undefined,
  last: number | null | undefined,
): { stroke: string; gradId: string } {
  if (
    first == null ||
    last == null ||
    !Number.isFinite(first) ||
    !Number.isFinite(last)
  ) {
    return { stroke: CHART_COLORS.muted, gradId: GRAD_ID.areaMuted };
  }
  return last >= first
    ? { stroke: CHART_COLORS.up, gradId: GRAD_ID.areaUp }
    : { stroke: CHART_COLORS.muted, gradId: GRAD_ID.areaMuted };
}

/**
 * 비제로 Y 도메인 계산(작은 진행을 크게 보이도록 약간의 패딩).
 * 값 배열에서 min/max 를 뽑고 위아래로 pad 만큼 여유를 준다.
 * 데이터가 없으면 [0, 1] 폴백.
 */
export function nonZeroDomain(
  values: Array<number | null | undefined>,
  padRatio = 0.08,
): [number, number] {
  const nums = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (nums.length === 0) return [0, 1];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) {
    // 단일 레벨: 위아래로 살짝 벌려 평평한 라인이 중앙에 오게
    const pad = Math.max(1, Math.abs(min) * padRatio);
    return [min - pad, max + pad];
  }
  const span = max - min;
  const pad = Math.max(span * padRatio, 0.5);
  return [min - pad, max + pad];
}

/**
 * 제로 기반 Y 도메인([0, max+pad]). 볼륨 차트용.
 * 데이터가 없거나 전부 0 이면 [0, 1].
 */
export function zeroDomain(
  values: Array<number | null | undefined>,
  padRatio = 0.08,
): [number, number] {
  const nums = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  const max = nums.length > 0 ? Math.max(...nums, 0) : 0;
  if (max <= 0) return [0, 1];
  return [0, max + max * padRatio];
}

/** 인덱스(0..n-1) → 플롯 X 좌표. n<=1 이면 중앙. */
export function xAt(index: number, n: number): number {
  if (n <= 1) return PLOT_X0 + PLOT_W / 2;
  return PLOT_X0 + (PLOT_W * index) / (n - 1);
}

/** 값 → 플롯 Y 좌표(도메인 [min,max] → [PLOT_Y1, PLOT_Y0], 위가 큰 값). */
export function yAt(value: number, domain: [number, number]): number {
  const [min, max] = domain;
  const span = max - min || 1;
  const t = (value - min) / span;
  return PLOT_Y1 - t * PLOT_H;
}

/**
 * 도메인에서 균등 간격의 눈금 값 count 개(양끝 포함).
 * 라벨 표기용(2~3개 권장).
 */
export function ticks(domain: [number, number], count = 3): number[] {
  const [min, max] = domain;
  if (count <= 1) return [min];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(min + ((max - min) * i) / (count - 1));
  }
  return out;
}

/**
 * 포인트 배열(플롯 좌표)을 line path "M x y L x y ..." 문자열로.
 * null 값 세그먼트는 건너뛰되 라인은 이어 붙인다(connectNulls 동등).
 */
export function linePath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]!.x.toFixed(2)} ${pts[i]!.y.toFixed(2)}`;
  }
  return d;
}

/**
 * 라인 아래 area path(라인 → 하단 baseline 으로 닫음).
 * baselineY 는 필 하단 y(보통 PLOT_Y1).
 */
export function areaPath(
  pts: Array<{ x: number; y: number }>,
  baselineY: number,
): string {
  if (pts.length === 0) return "";
  const line = linePath(pts);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}
