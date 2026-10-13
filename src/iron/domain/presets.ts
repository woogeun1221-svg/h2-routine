/**
 * Iron Terminal 프리셋 — 종목/템플릿/프로그램 기본값 + 초기 스토어 팩토리.
 *
 * 첫 실행 시 이 프리셋으로 RootStore 를 시드한다.
 * 시작 무게 중 벤치(60kg)만 확정, 나머지는 합리적 기본값(설정/첫 세션에서 조정 가능).
 */

import type {
  ExerciseDef,
  ExerciseId,
  Program,
  ProgramId,
  RootStore,
  SessionTemplate,
  SessionTemplateId,
} from "./types.js";
import { SCHEMA_VERSION } from "./types.js";

/** 프리셋 운동 종목. weighted 는 defaultStartWeightKg, bodyweight 는 null. */
export const PRESET_EXERCISES: Record<ExerciseId, ExerciseDef> = {
  bench_press: {
    id: "bench_press",
    name: "벤치프레스",
    kind: "weighted",
    role: "main",
    setCount: 4,
    targetReps: 12,
    progressionIncrementKg: 2.5,
    defaultStartWeightKg: 60,
  },
  triceps: {
    id: "triceps",
    name: "트라이셉스",
    kind: "weighted",
    role: "accessory",
    setCount: 4,
    targetReps: 12,
    progressionIncrementKg: 2.5,
    defaultStartWeightKg: 15,
  },
  pullup: {
    id: "pullup",
    name: "풀업",
    kind: "bodyweight",
    role: "main",
    setCount: 4,
    targetReps: 12,
    progressionIncrementKg: 0,
    defaultStartWeightKg: null,
    allowsAddedWeight: true,
  },
  pushup: {
    id: "pushup",
    name: "푸쉬업",
    kind: "bodyweight",
    role: "accessory",
    setCount: 4,
    targetReps: 12,
    progressionIncrementKg: 0,
    defaultStartWeightKg: null,
  },
  row: {
    id: "row",
    name: "등 당기기",
    kind: "weighted",
    role: "main",
    setCount: 4,
    targetReps: 12,
    progressionIncrementKg: 2.5,
    defaultStartWeightKg: 40,
  },
  military_press: {
    id: "military_press",
    name: "밀리터리프레스",
    kind: "weighted",
    role: "accessory",
    setCount: 4,
    targetReps: 12,
    progressionIncrementKg: 2.5,
    defaultStartWeightKg: 30,
  },
  squat: {
    id: "squat",
    name: "스쿼트",
    kind: "weighted",
    role: "main",
    setCount: 7,
    targetReps: 12,
    progressionIncrementKg: 5,
    defaultStartWeightKg: 60,
  },
};

/** 프리셋 세션 템플릿(하루 단위). */
export const PRESET_TEMPLATES: Record<SessionTemplateId, SessionTemplate> = {
  upper: {
    id: "upper",
    label: "상체",
    shortLabel: "상체",
    exerciseIds: [
      "bench_press",
      "triceps",
      "pullup",
      "pushup",
      "row",
      "military_press",
    ],
  },
  lower_day: {
    id: "lower_day",
    label: "하체 · 스쿼트",
    shortLabel: "스쿼트",
    exerciseIds: ["squat"],
  },
};

/** 프리셋 프로그램. upper=상체 단일 세션, lower=스쿼트 고정. */
export const PRESET_PROGRAMS: Record<ProgramId, Program> = {
  upper: {
    id: "upper",
    label: "상체",
    rotation: ["upper"],
  },
  lower: {
    id: "lower",
    label: "하체",
    rotation: ["lower_day"],
  },
};

/**
 * 초기 RootStore 생성.
 * weightState 는 각 종목의 defaultStartWeightKg 로 시드(source: "default").
 * sessions 는 빈 배열, settings 는 상체 활성 + 주간목표 3.
 */
export function initialStore(): RootStore {
  const now = new Date().toISOString();

  const weightState: RootStore["weightState"] = {};
  for (const def of Object.values(PRESET_EXERCISES)) {
    weightState[def.id] = {
      currentTargetKg: def.defaultStartWeightKg,
      source: "default",
      updatedAt: now,
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    exercises: { ...PRESET_EXERCISES },
    programs: { ...PRESET_PROGRAMS },
    templates: { ...PRESET_TEMPLATES },
    sessions: [],
    weightState,
    settings: {
      activeProgram: "upper",
      unit: "kg",
      weeklyGoal: 3,
    },
  };
}
