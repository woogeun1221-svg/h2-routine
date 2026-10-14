/**
 * App — 앱 셸 오케스트레이션(배선).
 *
 * 상태·액션은 useAppState 로 단일화하고, 활성 프로그램의 파생 뷰는 useProgram 으로 얻는다.
 * 셸 구성: <Header/>(ProgramTabs+스트릭+오늘 Day 칩+설정 진입) + 화면 본문 + <BottomNav/>.
 * route(useAppState) 에 따라 각 Screen 을 렌더한다.
 *
 * 화면별 셸 처리:
 *  - InputScreen 은 자체적으로 <Screen/>(header/bottomNav 슬롯 주입) 을 렌더하는 풀스크린이라
 *    App 은 header/bottomNav 노드만 내려주고 바깥 Screen 으로 감싸지 않는다.
 *  - 나머지 화면은 순수 본문만 반환하므로 App 이 <Screen/> 셸로 감싼다.
 *
 * 설정 액션(updateSettings/resetData)은 useAppState 에 없어 store 싱글턴으로 직접 배선한다
 * (App 은 배선 계층이므로 store/initialStore 접근 허용). 데이터 규칙은 건드리지 않는다.
 */

import { useCallback, useMemo } from "react";
import type { AppSettings, ExerciseId } from "../domain/types.js";
import { clampSetCount } from "../domain/sets.js";
import { initialStore } from "../domain/presets.js";
import { nextWorkout } from "../domain/rotation.js";
import { computeWeeklyStreak } from "../domain/streak.js";
import { todayLocal } from "../domain/dateUtil.js";
import { useAppState } from "./app/useAppState.js";
import { useProgram } from "./app/useProgram.js";
import { store, useStore } from "./useStore.js";
import { Header } from "./layout/Header.js";
import { BottomNav } from "./layout/BottomNav.js";
import { SubNav } from "./layout/SubNav.js";
import { Screen } from "./layout/Screen.js";
import { InstallPrompt, UpdateToast } from "./components/index.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { ChartsScreen } from "./screens/ChartsScreen.js";
import { InputScreen } from "./screens/InputScreen.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { CalendarScreen } from "./screens/CalendarScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { ROUTE_LABELS } from "./app/routes.js";
import { applyTransferPayload } from "../transfer-apply.js";

/** App props. embedded=true 면 루틴 앱의 '헬스' 탭 안(호스트 탭바·PWA 존재)에서 동작한다. */
export interface AppProps {
  embedded?: boolean;
}

/** 앱 루트 — 셸 + 상태 기반 라우팅. */
export function App({ embedded = false }: AppProps = {}): React.ReactElement {
  const root = useStore();
  const {
    program,
    route,
    setProgram,
    navigate,
    logSession,
    updateWeightState,
    importData,
  } = useAppState();

  const view = useProgram(program);
  const today = todayLocal();

  // ── 헤더용 파생: 프로그램 정의 목록 · 주간 스트릭 · 오늘 할 Day 칩 ──
  const programs = useMemo(() => Object.values(root.programs), [root.programs]);

  const streak = useMemo(
    () => computeWeeklyStreak(root.sessions, today, root.settings.weeklyGoal),
    [root.sessions, today, root.settings.weeklyGoal],
  );

  const day = useMemo(() => {
    if (!view.program) return null;
    const next = nextWorkout(view.program, root.templates, root.sessions);
    return { shortLabel: next.template.shortLabel, lap: next.lap };
  }, [view.program, root.templates, root.sessions]);

  // ── 설정 액션(useAppState 미노출분): store 싱글턴으로 직접 배선 ──
  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    store.setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  // 종목 기본 세트 수(기록 화면 초기값) 갱신.
  const updateSetCount = useCallback((exerciseId: ExerciseId, setCount: number) => {
    store.setState((prev) => {
      const def = prev.exercises[exerciseId];
      if (!def) return prev;
      return {
        ...prev,
        exercises: { ...prev.exercises, [exerciseId]: { ...def, setCount: clampSetCount(setCount) } },
      };
    });
  }, []);

  const resetData = useCallback(() => {
    // 프리셋 상태로 완전 대체(현재 활성 프로그램은 보존해 UX 연속성 유지).
    store.setState((prev) => {
      const fresh = initialStore();
      return {
        ...fresh,
        settings: { ...fresh.settings, activeProgram: prev.settings.activeProgram },
      };
    });
  }, []);

  const openSettings = useCallback(() => navigate("settings"), [navigate]);

  // 예전 Iron 의 이사 코드 → 현재 기록이 있으면 교체 전에 확인.
  const importTransfer = useCallback(
    (payload: string) =>
      applyTransferPayload(payload, {
        confirmReplace: (count, summary) =>
          window.confirm(`현재 세션 ${count}개를 가져온 기록(${summary})으로 교체할까요? 교체 전 자동 백업됩니다.`),
      }),
    [],
  );

  const headerBar = (
    <Header
      programs={programs}
      program={program}
      onSelectProgram={setProgram}
      streak={streak}
      day={day}
      onOpenSettings={openSettings}
    />
  );

  // embedded: 호스트(루틴 앱) 탭바가 하단을 쓰므로 Iron 네비는 헤더 아래 보조 메뉴로.
  // 설치 안내·SW 갱신 토스트도 호스트 PWA 가 담당한다.
  const header = embedded ? (
    <div className="iron-top">
      {headerBar}
      <SubNav active={route} onNavigate={navigate} />
    </div>
  ) : (
    headerBar
  );
  const bottomNav = embedded ? null : <BottomNav active={route} onNavigate={navigate} />;
  const overlays = embedded ? null : (
    <>
      <InstallPrompt />
      <UpdateToast />
    </>
  );

  // ── InputScreen: 자체 <Screen/> 렌더(풀스크린). 슬롯만 주입. ──
  if (route === "input") {
    return (
      <>
        <InputScreen
          programId={program}
          logSession={logSession}
          onDone={() => navigate("dashboard")}
          header={header}
          bottomNav={bottomNav}
        />
        {overlays}
      </>
    );
  }

  // ── 나머지 화면: 본문만 반환 → App 이 <Screen/> 으로 감싼다. ──
  let body: React.ReactNode;
  switch (route) {
    case "dashboard":
      body = (
        <DashboardScreen programId={program} today={today} navigate={navigate} />
      );
      break;
    case "charts":
      body = <ChartsScreen programId={program} />;
      break;
    case "history":
      body = (
        <HistoryScreen
          programId={program}
          today={today}
          onStartInput={() => navigate("input")}
        />
      );
      break;
    case "calendar":
      body = <CalendarScreen programId={program} />;
      break;
    case "settings":
      body = (
        <SettingsScreen
          store={root}
          importData={importData}
          importTransfer={embedded ? importTransfer : undefined}
          updateWeightState={updateWeightState}
          updateSettings={updateSettings}
          updateSetCount={updateSetCount}
          resetData={resetData}
        />
      );
      break;
    default:
      body = (
        <DashboardScreen programId={program} today={today} navigate={navigate} />
      );
  }

  return (
    <>
      <Screen header={header} bottomNav={bottomNav} title={ROUTE_LABELS[route]}>
        {body}
      </Screen>
      {overlays}
    </>
  );
}
