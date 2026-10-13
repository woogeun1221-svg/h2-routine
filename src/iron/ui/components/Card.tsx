/**
 * Card — 기본 surface 컨테이너.
 *
 * .card 표면 위에 선택적 헤더(제목 + 서브/우측 액세서리)를 얹는다.
 * hero=true 면 히어로 강조(up-red 그라데이션). styles.css 의 .card / .card.hero 토큰 사용.
 */
import type { ReactNode } from "react";

/** Card props. children 은 카드 본문. */
export interface CardProps {
  /** 카드 제목(좌상단). 없으면 헤더 생략. */
  title?: ReactNode;
  /** 제목 우측 보조 텍스트/요소(예: 날짜, 배지). */
  accessory?: ReactNode;
  /** 히어로 강조(up-red 그라데이션 보더). */
  hero?: boolean;
  /** 추가 클래스. */
  className?: string;
  /** 카드 클릭(탭 시 화면 이동 등). 있으면 role=button. */
  onClick?: () => void;
  /** 카드 본문. */
  children?: ReactNode;
}

/** 기본 카드 표면. */
export function Card({
  title,
  accessory,
  hero = false,
  className,
  onClick,
  children,
}: CardProps): React.ReactElement {
  const cls = ["card", hero ? "hero" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {(title != null || accessory != null) && (
        <div className="card-head">
          {title != null && <div className="card-title">{title}</div>}
          {accessory != null && <div className="card-sub">{accessory}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
