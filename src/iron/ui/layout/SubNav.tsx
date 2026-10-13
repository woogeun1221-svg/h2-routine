/**
 * SubNav — 루틴 앱 '헬스' 탭 안에서 쓰는 헤더 아래 보조 메뉴.
 *
 * 호스트(루틴 앱)의 하단 탭바와 겹치지 않도록 BottomNav(fixed) 대신 헤더 바로 아래에
 * 가로 칩으로 같은 라우트(홈/차트/기록/히스토리/캘린더)를 노출한다.
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

const ICONS: Record<Route, LucideIcon> = {
  dashboard: Home,
  charts: TrendingUp,
  input: Plus,
  history: History,
  calendar: CalendarDays,
  settings: Home,
};

export interface SubNavProps {
  active: Route;
  onNavigate: (route: Route) => void;
}

export function SubNav({ active, onNavigate }: SubNavProps): React.ReactElement {
  return (
    <nav className="iron-subnav" aria-label="헬스 화면">
      {BOTTOM_NAV_ROUTES.map((route) => {
        const Icon = ICONS[route];
        const selected = route === active;
        return (
          <button
            key={route}
            type="button"
            className={"iron-subnav-item" + (route === "input" ? " is-input" : "")}
            aria-selected={selected}
            onClick={() => onNavigate(route)}
          >
            <Icon aria-hidden size={16} />
            <span>{ROUTE_LABELS[route]}</span>
          </button>
        );
      })}
    </nav>
  );
}
