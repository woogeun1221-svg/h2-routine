/**
 * ProgressChart — 히어로 진행 라인 차트(순수 인라인 SVG).
 *
 * 한 종목의 세션별 진행을 라인으로. kind 에 따라 값 축이 바뀐다:
 *  - weighted   → 세션 탑세트 무게(kg). 목표 무게 라인 + 비제로 Y.
 *  - bodyweight → 세션 대표 reps(횟수). 목표 라인 없음(무게 개념 없음).
 * 규칙:
 *  - Y 비제로(nonZeroDomain): 작은 진행도 크게 보이게.
 *  - 라인 하단 up-red 그라데이션 필로 우상향 형상 강조.
 *  - PR 지점은 up-red 다이아(PRMarker).
 *  - 마지막 점은 확대 강조 + 값 라벨(ChartTooltip).
 *  - 목표 무게에 amber 점선 목표 라인 + "목표 +Xkg" 라벨(weighted 만).
 *  - 최신 값 ≥ 첫 값이면 라인 up-red, 아니면 뮤트(trendColor).
 *
 * 이미 shape 된 배열을 props 로 받는다(도메인 함수 호출은 화면단 책임).
 */

import React from "react";
import { fmtDateShort } from "../format/date.js";
import { fmtKg, fmtReps } from "../format/num.js";
import { ChartFrame } from "./ChartFrame.js";
import { ChartTooltip } from "./ChartTooltip.js";
import { PRMarker } from "./PRMarker.js";
import { TargetRefLine } from "./TargetRefLine.js";
import {
  CHART_COLORS,
  CHART_FONT,
  DOT_RADIUS,
  GRAD_ID,
  PLOT_X0,
  PLOT_X1,
  PLOT_Y0,
  PLOT_Y1,
  STROKE_WIDTH,
  VIEW_H,
  VIEW_W,
  areaPath,
  linePath,
  nonZeroDomain,
  ticks,
  trendColor,
  xAt,
  yAt,
} from "./chartTheme.js";

/** 진행 차트 한 점(화면단에서 세션→포인트로 shape). */
export interface ProgressPoint {
  /** X축 라벨용 로컬 날짜(YYYY-MM-DD). */
  localDate: string;
  /** 표시 값: weighted=탑세트 무게, bodyweight=대표 reps. null=결측(라인 끊김). */
  value: number | null;
  /** 이 세션이 해당 종목 PR 이었는지(다이아 마커). */
  isPR?: boolean;
}

/** ProgressChart props. */
export interface ProgressChartProps {
  title: string;
  caption?: string;
  /** 종목 종류. 값 축 의미와 목표 라인 유무를 가른다. */
  kind: "weighted" | "bodyweight";
  /** 시계열(오래된→최신 순 전제). */
  data: ProgressPoint[];
  /** weighted 목표 무게(다음 제안). bodyweight/없음이면 라인 생략. */
  targetKg?: number | null;
  height?: number;
}

/**
 * 히어로 라인 차트.
 * 데이터 0개면 프레임만(빈 상태 카피). 방향색은 첫/마지막 유효값으로 결정.
 */
export function ProgressChart({
  title,
  caption,
  kind,
  data,
  targetKg,
  height = 220,
}: ProgressChartProps): React.ReactElement {
  const isWeighted = kind === "weighted";
  const n = data.length;
  const uid = React.useId();
  const gradId = `${GRAD_ID.areaUp}-${uid}`;

  const values = data.map((d) => d.value);
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

  // 목표선도 Y 범위에 포함해 목표가 화면 안에 들어오게.
  const domainInput: Array<number | null | undefined> = [...values];
  if (isWeighted && targetKg != null) domainInput.push(targetKg);
  const domain = nonZeroDomain(domainInput);

  // 유효 포인트만 플롯 좌표로(라인/필). connectNulls 처럼 결측은 스킵.
  const coords: Array<{ x: number; y: number; i: number; isPR: boolean }> = [];
  data.forEach((d, i) => {
    if (d.value == null || !Number.isFinite(d.value)) return;
    coords.push({
      x: xAt(i, n),
      y: yAt(d.value, domain),
      i,
      isPR: Boolean(d.isPR),
    });
  });

  const hasLine = coords.length >= 2;
  const line = linePath(coords);
  const area = areaPath(coords, PLOT_Y1);

  const yTicks = ticks(domain, 3);
  const fmtY = (v: number) => (isWeighted ? fmtKg(v) : fmtReps(v));

  const last = coords[coords.length - 1];
  const targetY =
    isWeighted && targetKg != null ? yAt(targetKg, domain) : null;

  return (
    <ChartFrame title={title} caption={caption} height={height}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`${title} 진행 차트`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.24} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Y 눈금선 + 라벨(옅은 가로선). */}
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
                {fmtY(t)}
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

        {/* 목표 무게 점선 라인 + 라벨(weighted 만). */}
        {targetY != null && targetKg != null ? (
          <TargetRefLine
            y={targetY}
            label={`목표 ${fmtKg(targetKg)}`}
          />
        ) : null}

        {/* 라인 하단 그라데이션 필. */}
        {hasLine && <path d={area} fill={`url(#${gradId})`} stroke="none" />}

        {/* 진행 라인. */}
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

        {/* 마지막 점 확대 강조 + 값 라벨. */}
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
                text={
                  isWeighted
                    ? fmtKg(lastVal, true)
                    : fmtReps(lastVal, true)
                }
                color={stroke}
              />
            )}
          </>
        )}
      </svg>
    </ChartFrame>
  );
}
