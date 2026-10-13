/**
 * EmptyState — 빈/첫 실행 안내.
 *
 * 첫 기록 유도("여기가 당신의 시작 무게입니다") 또는 데이터 부족 안내에 사용.
 * 아이콘(lucide 요소), 제목, 서브카피, 선택 액션. .empty-state / .es-* 토큰 사용.
 */
import type { ReactNode } from "react";

/** EmptyState props. */
export interface EmptyStateProps {
  /** 상단 아이콘(lucide 요소 등). 없으면 생략. */
  icon?: ReactNode;
  /** 큰 제목. */
  title: ReactNode;
  /** 보조 설명. */
  sub?: ReactNode;
  /** 하단 액션(버튼 등). */
  action?: ReactNode;
}

/** 빈 상태 안내. */
export function EmptyState({
  icon,
  title,
  sub,
  action,
}: EmptyStateProps): React.ReactElement {
  return (
    <div className="empty-state">
      {icon != null && (
        <span className="es-icon" aria-hidden>
          {icon}
        </span>
      )}
      <div className="es-title">{title}</div>
      {sub != null && <div className="es-sub">{sub}</div>}
      {action != null && <div>{action}</div>}
    </div>
  );
}
