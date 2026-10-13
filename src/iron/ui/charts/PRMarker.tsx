/**
 * PRMarker — 개인 신기록(신기록) 지점 다이아몬드 마커(순수 SVG).
 *
 * ProgressChart/OneRMChart 가 시리즈 위 PR 포인트에 얹는다.
 * up-red 다이아몬드 + 골드 테두리. 좌표(cx/cy)를 직접 받아 그린다.
 */

import React from "react";
import { CHART_COLORS, DOT_RADIUS } from "./chartTheme.js";

/** PRMarker props. */
export interface PRMarkerProps {
  /** viewBox 좌표. */
  cx: number;
  cy: number;
  /** 다이아 채움색. 기본 up-red. */
  fill?: string;
  /** 테두리색. 기본 골드. */
  stroke?: string;
  /** 반경(viewBox px). 기본 DOT_RADIUS.pr. */
  r?: number;
}

/**
 * up-red 다이아(축 정렬 정사각형 45° 회전) + 골드 테두리.
 * 좌표가 유효하지 않으면 null.
 */
export function PRMarker({
  cx,
  cy,
  fill = CHART_COLORS.up,
  stroke = CHART_COLORS.prGold,
  r = DOT_RADIUS.pr,
}: PRMarkerProps): React.ReactElement | null {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <polygon
      points={points}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
      vectorEffect="non-scaling-stroke"
    />
  );
}
