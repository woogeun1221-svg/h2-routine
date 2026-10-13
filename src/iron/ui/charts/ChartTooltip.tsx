/**
 * ChartTooltip — 정적 끝점 값 라벨(순수 SVG).
 *
 * recharts 인터랙티브 툴팁을 걷어내고, 마지막(강조) 포인트 옆에 값을 정적으로 표기한다.
 * 인라인 <svg> 안에서 쓰이며 viewBox 좌표를 직접 받는다(측정/이벤트 없음).
 */

import React from "react";
import {
  CHART_COLORS,
  CHART_FONT,
  PLOT_X1,
  PLOT_Y0,
  PLOT_Y1,
} from "./chartTheme.js";

/** ChartTooltip(정적 끝점 라벨) props. */
export interface ChartTooltipProps {
  /** 라벨 앵커 x(viewBox, 보통 마지막 점 x). */
  x: number;
  /** 라벨 앵커 y(viewBox, 보통 마지막 점 y). */
  y: number;
  /** 표시 문자열(이미 포맷됨, 예: "62.5 kg"). */
  text: string;
  /** 글자색. 기본 강조 up-red. */
  color?: string;
}

/**
 * 마지막 점 위/옆에 값 라벨을 정적으로 얹는다.
 * 오른쪽 경계에 붙지 않게 x 를 클램프하고, 상단에 붙으면 아래로 내린다.
 */
export function ChartTooltip({
  x,
  y,
  text,
  color = CHART_COLORS.up,
}: ChartTooltipProps): React.ReactElement | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // 위로 8px 올려 점과 겹치지 않게. 상단 경계면 아래로.
  const above = y - 8;
  const ty = above < PLOT_Y0 + 6 ? Math.min(y + 14, PLOT_Y1) : above;
  // 오른쪽으로 나가지 않게 앵커를 조정.
  const nearRight = x > PLOT_X1 - 24;
  const tx = nearRight ? x - 2 : x + 2;
  const anchor = nearRight ? "end" : "start";
  return (
    <text
      x={tx}
      y={ty}
      fill={color}
      fontSize={CHART_FONT.labelSize}
      fontFamily={CHART_FONT.mono}
      fontWeight={700}
      textAnchor={anchor}
      dominantBaseline="middle"
    >
      {text}
    </text>
  );
}
