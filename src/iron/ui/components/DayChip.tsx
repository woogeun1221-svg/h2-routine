/**
 * DayChip — "오늘: 상체" 헤더 칩.
 *
 * 다음에 할 세션 템플릿의 라벨(shortLabel)을 표시한다(예: "오늘 · 상체").
 * lap 이 주어지면 그동안 완료한 세션 수(바퀴수)를 모노로 덧붙인다(예: "×3"). .day-chip 토큰 사용.
 */
import type { ReactNode } from "react";

/** DayChip props. */
export interface DayChipProps {
  /** 세션 라벨(예: "상체" / "스쿼트" = SessionTemplate.shortLabel). */
  label: ReactNode;
  /** 접두(기본 "오늘"). null 이면 접두 생략. */
  prefix?: ReactNode;
  /** 순환 바퀴수(있으면 "×N" 모노로 표시). */
  lap?: number;
}

/** 오늘 할 Day 칩. */
export function DayChip({
  label,
  prefix = "오늘",
  lap,
}: DayChipProps): React.ReactElement {
  return (
    <span className="day-chip">
      {prefix != null && (
        <span className="dim" style={{ fontWeight: 600 }}>
          {prefix}
        </span>
      )}
      <span>{label}</span>
      {typeof lap === "number" && lap > 0 && (
        <span className="day-lap">×{lap}</span>
      )}
    </span>
  );
}
