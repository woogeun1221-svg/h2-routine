/**
 * ChartFrame — 차트를 감싸는 공통 카드 래퍼(순수 SVG).
 *
 * 역할:
 *  - .chart-frame 카드(다크 배경·라인 보더) + .chart-head(제목/서브카피 슬롯).
 *  - 자식(인라인 <svg> 차트)을 담는 본문 영역. recharts/ResponsiveContainer 없음.
 *    자식 <svg> 는 viewBox + width:100%·height:auto 로 스스로 반응형이다.
 *
 * height 는 SVG 의 최대 높이 힌트(mini 압축 라인 등)로만 쓰인다.
 * 도메인 직접 호출 없음. 이미 shape 된 데이터를 받은 자식 차트를 children 으로 넣는다.
 */

import React from "react";

/** ChartFrame props. */
export interface ChartFrameProps {
  /** 좌측 굵은 제목(예: "벤치프레스"). */
  title: string;
  /** 우측 옅은 서브카피(예: "무게 추이 · 최근 12세션"). 없으면 미표시. */
  caption?: string;
  /** SVG 최대 높이(px) 힌트. 히어로 차트 220, 볼륨 160 등. 기본 200. */
  height?: number;
  /** 카드 여백 없이 미니 모드로(대시보드 압축 라인). */
  mini?: boolean;
  /** 본문에 들어갈 인라인 <svg> 차트 엘리먼트. */
  children: React.ReactNode;
}

/**
 * 차트 카드 프레임.
 * 자식 <svg> 는 이미 반응형이므로 본문에 그대로 담는다. height 는 최대 높이 캡.
 */
export function ChartFrame({
  title,
  caption,
  height = 200,
  mini = false,
  children,
}: ChartFrameProps): React.ReactElement {
  return (
    <section className={mini ? "chart-frame mini-chart" : "chart-frame"}>
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        {caption ? <span className="chart-caption">{caption}</span> : null}
      </div>
      <div className="chart-body">{children}</div>
    </section>
  );
}
