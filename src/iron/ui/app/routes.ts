/**
 * routes — 상태 기반 라우팅 정의(라우터 라이브러리 불필요).
 *
 * 화면 전환은 useAppState 의 route 상태로 관리한다.
 * BottomNav 5칸(홈/차트/기록/히스토리/캘린더) + Settings(헤더 진입).
 */

/** 앱 화면 식별자. */
export type Route =
  | "dashboard"
  | "charts"
  | "input"
  | "history"
  | "calendar"
  | "settings";

/** 화면별 한국어 라벨. */
export const ROUTE_LABELS: Record<Route, string> = {
  dashboard: "홈",
  charts: "차트",
  input: "기록",
  history: "히스토리",
  calendar: "캘린더",
  settings: "설정",
};

/** 하단 네비게이션에 노출되는 라우트 순서(가운데 input 은 FAB). */
export const BOTTOM_NAV_ROUTES: readonly Route[] = [
  "dashboard",
  "charts",
  "input",
  "history",
  "calendar",
];

/** 앱 최초 진입 라우트. */
export const DEFAULT_ROUTE: Route = "dashboard";
