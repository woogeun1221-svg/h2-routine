/**
 * VolumeChart — 세션별 볼륨 Area 차트(순수 인라인 SVG).
 *
 * 볼륨(kg-볼륨 Σ무게×횟수, 또는 자체중량 rep-볼륨 Σreps)의 세션별 추이.
 * 규칙:
 *  - Y 제로 기반([0, max]): 볼륨은 절대 크기가 의미 → 0 부터.
 *  - up-red 그라데이션 필: 위는 진하게, 아래로 투명.
 *  - 최고 볼륨 지점에 amber 점선 기준선("최고 볼륨").
 *
 * 이미 shape 된 배열을 받는다.
 */

import React from "react";
import { fmtDateShort } from "../format/date.js";
import { fmtVolume } from "../format/num.js";
import { ChartFrame } from "./ChartFrame.js";
import { ChartTooltip } from "./ChartTooltip.js";
import { TargetRefLine } from "./TargetRefLine.js";
import {
  CHART_COLORS,
  CHART_FONT,
  DOT_RADIUS,
  GRAD_ID,
  PLOT_X0,
  PLOT_X1,
  PLOT_Y1,
  STROKE_WIDTH,
  VIEW_H,
  VIEW_W,
  areaPath,
  linePath,
  ticks,
  xAt,
  yAt,
  zeroDomain,
} from "./chartTheme.js";

/** 볼륨 차트 한 점. */
export interface VolumePoint {
  /** X축 라벨용 로컬 날짜(YYYY-MM-DD). */
  localDate: string;
  /** 볼륨 값(kg-볼륨 또는 rep-볼륨). 결측이면 0 취급(제로 기반이라 자연스러움). */
  volume: number;
}

/** VolumeChart props. */
export interface VolumeChartProps {
  title: string;
  caption?: string;
  data: VolumePoint[];
  /**
   * 볼륨 단위 표기. "kg"=kg-볼륨( fmtVolume withUnit ), "reps"=rep-볼륨(단위 생략).
   * 기본 "kg".
   */
  unit?: "kg" | "reps";
  /** 최고 볼륨 기준선 표시 여부. 기본 true. */
  showMaxLine?: boolean;
  height?: number;
}

/**
 * 볼륨 Area 차트(제로 기반, up-red 필).
 * 최고치 기준선은 데이터 최대 볼륨에 amber 로.
 */
export function VolumeChart({
  title,
  caption,
  data,
  unit = "kg",
  showMaxLine = true,
  height = 160,
}: VolumeChartProps): React.ReactElement {
  const withUnit = unit === "kg";
  const n = data.length;
  const uid = React.useId();
  const gradId = `${GRAD_ID.volume}-${uid}`;

  const vols = data.map((d) => (Number.isFinite(d.volume) ? d.volume : 0));
  const maxVol = vols.reduce((m, v) => (v > m ? v : m), 0);
  const domain = zeroDomain(vols);

  const coords = data.map((d, i) => ({
    x: xAt(i, n),
    y: yAt(Number.isFinite(d.volume) ? d.volume : 0, domain),
    i,
  }));

  const hasLine = coords.length >= 2;
  const line = linePath(coords);
  const area = areaPath(coords, PLOT_Y1);

  const yTicks = ticks(domain, 3);
  const maxY = showMaxLine && maxVol > 0 ? yAt(maxVol, domain) : null;
  const last = coords[coords.length - 1];
  const lastVol = n > 0 ? vols[n - 1] ?? null : null;

  return (
    <ChartFrame title={title} caption={caption} height={height}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`${title} 볼륨 차트`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.up} stopOpacity={0.5} />
            <stop
              offset="100%"
              stopColor={CHART_COLORS.up}
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>

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
                {fmtVolume(t)}
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

        {/* Area 필 + 라인. */}
        {hasLine && <path d={area} fill={`url(#${gradId})`} stroke="none" />}
        {hasLine && (
          <path
            d={line}
            fill="none"
            stroke={CHART_COLORS.up}
            strokeWidth={STROKE_WIDTH.line}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* 최고 볼륨 점선 기준선. */}
        {maxY != null ? (
          <TargetRefLine y={maxY} label="최고 볼륨" color={CHART_COLORS.hold} />
        ) : null}

        {/* 마지막 점 강조 + 값 라벨. */}
        {last && (
          <>
            <circle
              cx={last.x}
              cy={last.y}
              r={DOT_RADIUS.last}
              fill={CHART_COLORS.up}
              stroke={CHART_COLORS.bg1}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            {lastVol != null && (
              <ChartTooltip
                x={last.x}
                y={last.y}
                text={fmtVolume(lastVol, withUnit)}
                color={CHART_COLORS.up}
              />
            )}
          </>
        )}
      </svg>
    </ChartFrame>
  );
}
