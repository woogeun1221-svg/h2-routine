/**
 * OneRMChart — 메인 리프트 추정 1RM(e1RM) 라인 차트(순수 인라인 SVG).
 *
 * Epley 로 추정한 세션별 e1RM 추이(도메인 estimate1RM/best1RM 은 화면단에서 계산).
 * 규칙:
 *  - 자체중량(bodyweight)은 무게 개념이 없어 e1RM 을 렌더하지 않는다 → null 반환.
 *  - Y 비제로(작은 진행 강조), 최신≥첫이면 up-red(trendColor).
 *  - PR(e1RM 신기록) 지점 다이아 마커, 마지막 점 확대 강조 + 값 라벨.
 *
 * 이미 shape 된 배열을 받는다. 단일 시리즈(메인 리프트 하나)를 그린다.
 */

import React from "react";
import { fmtDateShort } from "../format/date.js";
import { fmt1 } from "../format/num.js";
import { ChartFrame } from "./ChartFrame.js";
import { ChartTooltip } from "./ChartTooltip.js";
import { PRMarker } from "./PRMarker.js";
import {
  CHART_COLORS,
  CHART_FONT,
  DOT_RADIUS,
  PLOT_X0,
  PLOT_X1,
  PLOT_Y1,
  STROKE_WIDTH,
  VIEW_H,
  VIEW_W,
  linePath,
  nonZeroDomain,
  ticks,
  trendColor,
  xAt,
  yAt,
} from "./chartTheme.js";

/** e1RM 차트 한 점. */
export interface OneRMPoint {
  /** X축 라벨용 로컬 날짜(YYYY-MM-DD). */
  localDate: string;
  /** 추정 1RM(kg). null=해당 세션 계산 불가(라인 끊김). */
  e1rm: number | null;
  /** e1RM PR 지점 여부(다이아 마커). */
  isPR?: boolean;
}

/** OneRMChart props. */
export interface OneRMChartProps {
  title: string;
  caption?: string;
  /** 종목 종류. bodyweight 면 렌더하지 않음. */
  kind: "weighted" | "bodyweight";
  data: OneRMPoint[];
  height?: number;
}

/**
 * e1RM 라인 차트.
 * 자체중량이면 null(렌더 안 함). weighted 는 비제로 Y·방향색·PR 마커.
 */
export function OneRMChart({
  title,
  caption,
  kind,
  data,
  height = 200,
}: OneRMChartProps): React.ReactElement | null {
  if (kind === "bodyweight") return null;

  const n = data.length;
  const values = data.map((d) => d.e1rm);
  const firstVal = values.find((v): v is number => v != null);
  let lastVal: number | null = null;
  let lastIdx = -1;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null) {
      lastVal = v;
      lastIdx = i;
      break;
    }
  }

  const { stroke } = trendColor(firstVal, lastVal);
  const domain = nonZeroDomain(values);

  const coords: Array<{ x: number; y: number; i: number; isPR: boolean }> = [];
  data.forEach((d, i) => {
    if (d.e1rm == null || !Number.isFinite(d.e1rm)) return;
    coords.push({
      x: xAt(i, n),
      y: yAt(d.e1rm, domain),
      i,
      isPR: Boolean(d.isPR),
    });
  });

  const hasLine = coords.length >= 2;
  const line = linePath(coords);
  const yTicks = ticks(domain, 3);
  const last = coords[coords.length - 1];

  return (
    <ChartFrame title={title} caption={caption} height={height}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`${title} e1RM 차트`}
      >
        {/* Y 눈금선 + 라벨. */}
        {yTicks.map((t, i) => {
          const y = yAt(t, domain);
          return (
            <g key={i}>
              <line
                x1={PLOT_X0}
                y1={y}
                x2={PLOT_X1}
                y2={y}
                stroke={CHART_COLORS.line}
                strokeWidth={STROKE_WIDTH.grid}
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PLOT_X0 - 4}
                y={y}
                fill={CHART_COLORS.textDim}
                fontSize={CHART_FONT.axisSize}
                fontFamily={CHART_FONT.mono}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {fmt1(t)}
              </text>
            </g>
          );
        })}

        {/* X 라벨(첫/마지막 날짜). */}
        {n > 0 && (
          <>
            <text
              x={PLOT_X0}
              y={PLOT_Y1 + 14}
              fill={CHART_COLORS.textDim}
              fontSize={CHART_FONT.axisSize}
              fontFamily={CHART_FONT.mono}
              textAnchor="start"
            >
              {fmtDateShort(data[0]?.localDate)}
            </text>
            {n > 1 && (
              <text
                x={PLOT_X1}
                y={PLOT_Y1 + 14}
                fill={CHART_COLORS.textDim}
                fontSize={CHART_FONT.axisSize}
                fontFamily={CHART_FONT.mono}
                textAnchor="end"
              >
                {fmtDateShort(data[n - 1]?.localDate)}
              </text>
            )}
          </>
        )}

        {/* e1RM 라인. */}
        {hasLine && (
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={STROKE_WIDTH.line}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* PR 다이아 마커. */}
        {coords.map((c) =>
          c.isPR && c.i !== lastIdx ? (
            <PRMarker key={`pr-${c.i}`} cx={c.x} cy={c.y} />
          ) : null,
        )}

        {/* 마지막 점 강조 + 값 라벨. */}
        {last && (
          <>
            {data[lastIdx]?.isPR ? (
              <PRMarker cx={last.x} cy={last.y} r={DOT_RADIUS.last} />
            ) : (
              <circle
                cx={last.x}
                cy={last.y}
                r={DOT_RADIUS.last}
                fill={stroke}
                stroke={CHART_COLORS.bg1}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {lastVal != null && (
              <ChartTooltip
                x={last.x}
                y={last.y}
                text={`${fmt1(lastVal)} kg`}
                color={stroke}
              />
            )}
          </>
        )}
      </svg>
    </ChartFrame>
  );
}
