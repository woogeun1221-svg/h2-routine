/**
 * NextTargetBanner — 증량 신호 / 유지 / 자체중량 배너.
 *
 * WeightSuggestion(도메인 progression.ts 결과)를 카피로 번역한다:
 *  - isBump(전 세트 12회 달성): solid up-red "전 세트 12회 달성 · 다음 +Xkg 적용 ▲"
 *  - hold(12회 미달):           amber      "12회 미달 · 같은 무게 유지"
 *  - bodyweight/first 등:       neutral    중립 안내
 * .next-banner / .next-banner.{bump,hold,neutral} 토큰 사용.
 */
import { TrendingUp, Minus, Info } from "lucide-react";
import type { WeightSuggestion } from "../../domain/types.js";
import { fmtKg } from "../format/num.js";

/** NextTargetBanner props. */
export interface NextTargetBannerProps {
  /** 다음 세션 제안(증량/유지/자체중량). */
  suggestion: WeightSuggestion;
}

/** 배너 표시 상태 유형. */
type BannerTone = "bump" | "hold" | "neutral";

/** suggestion.reason → 배너 톤. */
function toneOf(s: WeightSuggestion): BannerTone {
  if (s.isBump || s.reason === "bump") return "bump";
  if (s.reason === "hold") return "hold";
  return "neutral";
}

/** 다음 목표 배너. */
export function NextTargetBanner({
  suggestion,
}: NextTargetBannerProps): React.ReactElement {
  const tone = toneOf(suggestion);
  const inc = fmtKg(suggestion.incrementKg);

  let icon: React.ReactElement;
  let title: string;
  let sub: string | null;

  if (tone === "bump") {
    icon = <TrendingUp size={18} strokeWidth={2.5} />;
    title = `전 세트 12회 달성 · 다음 세션 +${inc}kg 적용 ▲`;
    sub = `다음 세션 ${fmtKg(suggestion.suggestedKg)}kg 로 증량`;
  } else if (tone === "hold") {
    icon = <Minus size={18} strokeWidth={2.5} />;
    title = "12회 미달 · 같은 무게 유지";
    sub =
      suggestion.suggestedKg != null
        ? `현재 무게 ${fmtKg(suggestion.suggestedKg)}kg 유지`
        : null;
  } else if (suggestion.reason === "bodyweight") {
    icon = <Info size={18} strokeWidth={2.5} />;
    title = "자체중량 — 횟수로 진행";
    sub = "무게 대신 반복 수량을 늘려 나갑니다";
  } else {
    // first / manual / deload 등 중립
    icon = <Info size={18} strokeWidth={2.5} />;
    title =
      suggestion.reason === "first"
        ? "첫 무게 설정"
        : "다음 세션 준비";
    sub =
      suggestion.suggestedKg != null
        ? `제안 ${fmtKg(suggestion.suggestedKg)}kg`
        : null;
  }

  return (
    <div className={`next-banner ${tone}`}>
      <span className="nb-icon">{icon}</span>
      <div>
        <div>{title}</div>
        {sub != null && <div className="nb-sub">{sub}</div>}
      </div>
    </div>
  );
}
