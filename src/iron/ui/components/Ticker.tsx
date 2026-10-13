/**
 * Ticker — 현재 값 표시 행: 종목명 · 현재값 · ▲/▼ 델타.
 *
 * 메인 리프트별 "현재 톱 무게 + 지난 세션 대비 델타 + e1RM 서브값" 표시에 사용.
 * up-red 상승 강조. 값은 이미 포맷된 문자열/요소로 받는다. .ticker 토큰 사용.
 */
import type { ReactNode } from "react";
import { DeltaChip } from "./DeltaChip.js";

/** Ticker props. */
export interface TickerProps {
  /** 종목명(예: "벤치프레스"). */
  name: ReactNode;
  /** 이름 아래 서브(예: "e1RM 82.5"). */
  sub?: ReactNode;
  /** 현재값(이미 포맷된 무게/횟수 문자열). */
  price: ReactNode;
  /** 값 뒤 단위(예: "kg"). */
  unit?: string;
  /** 지난 세션 대비 델타. number 면 DeltaChip 자동. */
  delta?: number | ReactNode;
  /** 델타 소수 자리. 기본 1. */
  deltaDigits?: number;
  /** 델타 단위(예: "kg"). */
  deltaUnit?: string;
  /** 행 클릭(차트 화면 이동 등). */
  onClick?: () => void;
}

/** 현재 값 표시 행. */
export function Ticker({
  name,
  sub,
  price,
  unit,
  delta,
  deltaDigits = 1,
  deltaUnit,
  onClick,
}: TickerProps): React.ReactElement {
  const deltaNode =
    typeof delta === "number" ? (
      <DeltaChip delta={delta} digits={deltaDigits} unit={deltaUnit} />
    ) : (
      delta
    );
  return (
    <div
      className="ticker"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div>
        <div className="ticker-name">{name}</div>
        {sub != null && <div className="ticker-sub">{sub}</div>}
      </div>
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <span className="ticker-price">
          {price}
          {unit ? <span className="stat-unit">{unit}</span> : null}
        </span>
        {deltaNode}
      </div>
    </div>
  );
}
