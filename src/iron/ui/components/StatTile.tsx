/**
 * StatTile — 라벨 + 큰 모노 값 + (선택) 델타/노트.
 *
 * 대시보드 요약 수치용. 값은 모노(tabular-nums)로 자릿수 정렬.
 * 델타는 숫자면 DeltaChip, ReactNode 면 그대로. .stat-tile 토큰 사용.
 */
import type { ReactNode } from "react";
import { DeltaChip } from "./DeltaChip.js";

/** StatTile props. */
export interface StatTileProps {
  /** 상단 라벨(예: "지난 세션 볼륨"). */
  label: ReactNode;
  /** 큰 모노 값(이미 포맷된 문자열/요소). */
  value: ReactNode;
  /** 값 뒤 작은 단위(예: "kg"). */
  unit?: string;
  /** 델타: number 면 DeltaChip 자동 렌더, ReactNode 면 그대로. */
  delta?: number | ReactNode;
  /** 델타 소수 자리(number 델타일 때). 기본 1. */
  deltaDigits?: number;
  /** 델타 단위(number 델타일 때, 예: "kg"). */
  deltaUnit?: string;
  /** 하단 보조 설명. */
  note?: ReactNode;
}

/** 큰 값을 강조하는 통계 타일. */
export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaDigits = 1,
  deltaUnit,
  note,
}: StatTileProps): React.ReactElement {
  const deltaNode =
    typeof delta === "number" ? (
      <DeltaChip delta={delta} digits={deltaDigits} unit={deltaUnit} />
    ) : (
      delta
    );
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <span className="stat-value">
          {value}
          {unit ? <span className="stat-unit">{unit}</span> : null}
        </span>
        {deltaNode}
      </div>
      {note != null && <div className="stat-note">{note}</div>}
    </div>
  );
}
