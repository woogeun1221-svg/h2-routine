/**
 * TargetRefLine — amber(또는 지정색) 점선 가로 기준선 + 우측 라벨(순수 SVG).
 *
 * ProgressChart 의 목표 무게 라인, VolumeChart 의 최고 볼륨 라인 등에 공통으로 쓴다.
 * y 는 이미 계산된 viewBox 플롯 좌표(호출부에서 yAt 로 변환해 넘긴다).
 */

import React from "react";
import {
  CHART_COLORS,
  CHART_FONT,
  PLOT_X0,
  PLOT_X1,
  STROKE_WIDTH,
} from "./chartTheme.js";

/** TargetRefLine props. */
export interface TargetRefLineProps {
  /** 기준선 y(viewBox 플롯 좌표). null/비유한이면 라인 생략. */
  y: number | null | undefined;
  /** 우측 라벨 텍스트(예: "목표 +2.5kg", "최고 볼륨"). 없으면 라벨 생략. */
  label?: string;
  /** 선/라벨 색. 기본 amber(hold). */
  color?: string;
  /** 라인 좌/우 x(viewBox). 기본 플롯 경계. */
  x0?: number;
  x1?: number;
}

/**
 * 점선 가로 기준선 + 우측 라벨.
 * y 가 유효하지 않으면 null(호출부에서 조건 없이도 안전).
 */
export function TargetRefLine({
  y,
  label,
  color = CHART_COLORS.hold,
  x0 = PLOT_X0,
  x1 = PLOT_X1,
}: TargetRefLineProps): React.ReactElement | null {
  if (y == null || !Number.isFinite(y)) return null;
  return (
    <g>
      <line
        x1={x0}
        y1={y}
        x2={x1}
        y2={y}
        stroke={color}
        strokeWidth={STROKE_WIDTH.ref}
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
      {label ? (
        <text
          x={x1 + 3}
          y={y}
          fill={color}
          fontSize={CHART_FONT.labelSize}
          fontFamily={CHART_FONT.mono}
          dominantBaseline="middle"
          textAnchor="start"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}
