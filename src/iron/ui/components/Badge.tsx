/**
 * Badge — pill 라벨 (PR / 목표 달성 / 유지 / 뮤트).
 *
 * variant 로 색을 고른다:
 *  - "pr"    : pr-gold (개인 신기록 · 🏆 신기록)
 *  - "up"    : up-red  (목표 달성 · 증량 · 상승) — "달성" 배지가 이 변형
 *  - "hold"  : amber   (유지 · 경고)
 *  - "muted" : 뮤트    (중립 정보)
 * .badge / .badge.{pr,up,hold,muted} 토큰 사용.
 */
import type { ReactNode } from "react";

/** Badge 색 변형. */
export type BadgeVariant = "pr" | "up" | "hold" | "muted";

/** Badge props. */
export interface BadgeProps {
  /** 색 변형. 기본 "muted". */
  variant?: BadgeVariant;
  /** 앞쪽 아이콘/이모지(예: 🏆). */
  icon?: ReactNode;
  /** 라벨 내용. */
  children: ReactNode;
}

/** pill 배지. */
export function Badge({
  variant = "muted",
  icon,
  children,
}: BadgeProps): React.ReactElement {
  return (
    <span className={`badge ${variant}`}>
      {icon != null && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}
