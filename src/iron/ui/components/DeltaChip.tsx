/**
 * DeltaChip — 변화량 색칩 (▲/▼ + 값).
 *
 * 상승(up-red) / 하락(파랑) / 무변화(뮤트). "빨강=나쁨" 아님, up-red 는 상승/증량.
 * 값은 fmtDelta 로 문자열화, 부호 방향은 deltaSign 으로 결정. .delta-chip 토큰 사용.
 */
import { fmtDelta, deltaSign } from "../format/num.js";

/** DeltaChip props. */
export interface DeltaChipProps {
  /** 변화량(kg 또는 reps). null/0 → 무변화 칩. */
  delta: number | null | undefined;
  /** 소수 자리(무게 델타 1, reps 델타 0). 기본 1. */
  digits?: number;
  /** 접미 단위(예: "kg"). 화살표+값 뒤에 붙는다. */
  unit?: string;
}

/** +2.5kg / +5kg 등 색칩. */
export function DeltaChip({
  delta,
  digits = 1,
  unit,
}: DeltaChipProps): React.ReactElement {
  const dir = deltaSign(delta);
  const text = fmtDelta(delta, digits);
  return (
    <span className={`delta-chip ${dir}`}>
      {text}
      {unit ? <span>{unit}</span> : null}
    </span>
  );
}
