/**
 * BottomNav — 하단 5칸 네비게이션.
 *
 * 순서: 홈 / 차트 / (가운데 돌출 FAB ＋기록) / 히스토리 / 캘린더.
 * 가운데 input 은 가장 빈번한 액션이라 원형 FAB 로 돌출(styles.css .nav-fab / .nav-fab-btn).
 * 라우팅은 상태 기반 — active 라우트는 up-red(.nav-item[aria-selected]).
 * 아이콘은 lucide-react: Home / TrendingUp / Plus / History / CalendarDays.
 */

import {
  CalendarDays,
  History,
  Home,
  Plus,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { BOTTOM_NAV_ROUTES, ROUTE_LABELS, type Route } from "../app/routes.js";

/** BottomNav props — 최소·명시적. */
export interface BottomNavProps {
  /** 현재 화면(활성 표시용). */
  active: Route;
  /** 탭 선택 시 화면 전환. */
  onNavigate: (route: Route) => void;
}

/** 라우트별 lucide 아이콘. 가운데(input)는 FAB 로 별도 렌더. */
const ROUTE_ICONS: Record<Route, LucideIcon> = {
  dashboard: Home,
  charts: TrendingUp,
  input: Plus,
  history: History,
  calendar: CalendarDays,
  settings: Home, // 하단 네비 미노출(헤더 진입), 매핑 완전성용 폴백.
};

/** 하단 고정 5칸 네비 + 가운데 FAB. */
export function BottomNav({
  active,
  onNavigate,
}: BottomNavProps): React.ReactElement {
  return (
    <nav className="bottomnav" aria-label="주요 네비게이션">
      {BOTTOM_NAV_ROUTES.map((route) => {
        const Icon = ROUTE_ICONS[route];
        const label = ROUTE_LABELS[route];

        // 가운데 기록(input)은 돌출 FAB.
        if (route === "input") {
          return (
            <div key={route} className="nav-fab">
              <button
                type="button"
                className="nav-fab-btn"
                aria-label={label}
                onClick={() => onNavigate(route)}
              >
                <Icon aria-hidden />
              </button>
            </div>
          );
        }

        const selected = route === active;
        return (
          <button
            key={route}
            type="button"
            className="nav-item"
            aria-selected={selected}
            aria-label={label}
            onClick={() => onNavigate(route)}
          >
            <Icon aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
