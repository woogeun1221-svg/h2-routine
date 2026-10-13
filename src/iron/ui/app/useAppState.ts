/**
 * useAppState — 앱 전역 상태·액션의 단일 진입점.
 *
 * 두 축의 상태를 합친다:
 *  - program(활성 상체/하체): store.settings.activeProgram 에 영속(새로고침 후 유지).
 *  - route(현재 화면): UI-로컬 useState(영속 안 함).
 *
 * 모든 데이터 변경 액션은 store.setState(updater) 를 래핑한다.
 * setState 는 검증→직렬화→저장→통지를 스스로 하므로 여기서는 순수 변환만 구성한다.
 *
 * 액션:
 *  - setProgram(id)       : 활성 프로그램 전환(설정 영속).
 *  - navigate(route)      : 화면 전환.
 *  - logSession(session)  : 세션 upsert(id 기준) + weightState 재계산.
 *  - updateWeightState(...) : 종목 목표 무게 수동 갱신.
 *  - importData(text,mode): JSON 가져오기(replace 전 자동 백업).
 *  - exportData()         : 현재 스토어를 envelope JSON 문자열로.
 */

import { useCallback, useState } from "react";
import type {
  ExerciseId,
  ExerciseWeightState,
  ProgramId,
  RootStore,
  WorkoutSession,
} from "../../domain/types.js";
import { suggestedWeight } from "../../domain/progression.js";
import {
  exportJson,
  parseImport,
  type ImportMode,
  type ImportResult,
} from "../../storage/exchange.js";
import { CORRUPT_KEY_PREFIX } from "../../storage/store.js";
import { LocalStorageAdapter } from "../../storage/adapter.js";
import { store, useStore } from "../useStore.js";
import { DEFAULT_ROUTE, type Route } from "./routes.js";

/** 가져오기 액션 결과(에러/요약을 UI 로 전달). */
export type ImportOutcome = ImportResult;

/** useAppState 반환 형태. */
export interface AppState {
  /** 현재 활성 프로그램(상체/하체). */
  program: ProgramId;
  /** 현재 화면. */
  route: Route;
  /** 활성 프로그램 전환(설정에 영속). */
  setProgram: (id: ProgramId) => void;
  /** 화면 전환. */
  navigate: (route: Route) => void;
  /** 세션 기록(신규 추가 또는 동일 id 교체) + 진행 규칙에 따른 weightState 재계산. */
  logSession: (session: WorkoutSession) => void;
  /** 특정 종목의 목표 무게 상태를 수동 갱신. */
  updateWeightState: (
    exerciseId: ExerciseId,
    next: ExerciseWeightState,
  ) => void;
  /** JSON 가져오기(replace 시 현재 데이터를 손상 키 접두사로 자동 백업). */
  importData: (text: string, mode: ImportMode) => ImportOutcome;
  /** 현재 스토어를 self-describing envelope JSON 문자열로 내보낸다. */
  exportData: () => string;
}

/**
 * 세션을 스토어에 upsert 한다(동일 id 는 교체, 아니면 추가).
 * 이어서 이 세션에 등장한 종목들의 weightState 를 진행 규칙으로 재계산한다.
 * (자체중량/미제안은 currentTargetKg=null 로 반영.)
 */
function applyLogSession(prev: RootStore, session: WorkoutSession): RootStore {
  const idx = prev.sessions.findIndex((s) => s.id === session.id);
  const sessions =
    idx >= 0
      ? prev.sessions.map((s) => (s.id === session.id ? session : s))
      : [...prev.sessions, session];

  // 진행 규칙 재계산: 이 세션에 포함된 종목만 갱신(마지막 완료 세션 기준).
  const now = new Date().toISOString();
  const weightState: RootStore["weightState"] = { ...prev.weightState };
  for (const log of session.exercises) {
    const def = prev.exercises[log.exerciseId];
    if (!def) continue;
    const suggestion = suggestedWeight(def, sessions, weightState[log.exerciseId]);
    weightState[log.exerciseId] = {
      currentTargetKg: suggestion.suggestedKg,
      source: suggestion.isBump ? "auto_bump" : "hold",
      updatedAt: now,
    };
  }

  return { ...prev, sessions, weightState };
}

/**
 * 앱 전역 상태·액션 훅.
 * 컴포넌트 트리 최상단(App)에서 1회 호출해 컨텍스트/프롭으로 내려준다.
 */
export function useAppState(): AppState {
  const state = useStore();
  const program = state.settings.activeProgram;

  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);

  const setProgram = useCallback((id: ProgramId) => {
    store.setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, activeProgram: id },
    }));
  }, []);

  const navigate = useCallback((next: Route) => {
    setRoute(next);
  }, []);

  const logSession = useCallback((session: WorkoutSession) => {
    store.setState((prev) => applyLogSession(prev, session));
  }, []);

  const updateWeightState = useCallback(
    (exerciseId: ExerciseId, next: ExerciseWeightState) => {
      store.setState((prev) => ({
        ...prev,
        weightState: { ...prev.weightState, [exerciseId]: next },
      }));
    },
    [],
  );

  const importData = useCallback(
    (text: string, mode: ImportMode): ImportOutcome => {
      const current = store.getState();
      const result = parseImport(text, mode, current);
      if (!result.ok || !result.store) return result;

      // replace 는 현재 데이터를 덮어쓰므로 먼저 백업(데이터 절대 소실 금지).
      if (mode === "replace") {
        try {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          new LocalStorageAdapter().writeKey(
            CORRUPT_KEY_PREFIX + "preimport-" + ts,
            JSON.stringify(current),
          );
        } catch {
          // 백업 실패해도 가져오기는 진행(사용자가 명시적으로 요청한 동작)
        }
      }

      const nextStore = result.store;
      store.setState(() => nextStore);
      return result;
    },
    [],
  );

  const exportData = useCallback((): string => {
    return exportJson(store.getState());
  }, []);

  return {
    program,
    route,
    setProgram,
    navigate,
    logSession,
    updateWeightState,
    importData,
    exportData,
  };
}
