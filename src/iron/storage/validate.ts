/**
 * 런타임 검증 — 손수 짠 RootStore 검증기(zod 등 의존성 없음).
 *
 * 목적: localStorage/가져오기로 들어온 unknown 값이 RootStore 계약을 만족하는지
 * 필수 필드·타입·배열·교차참조까지 확인한다. 실패 시 StorageError throw.
 *
 * 복구: 결측 optional map(programs/templates/exercises/weightState)은 프리셋과
 * 병합해 최대한 복구한다(데이터 소실 방지 원칙). 그래도 필수 구조가 깨지면 throw.
 */

import type {
  AppSettings,
  ExerciseDef,
  ExerciseKind,
  ExerciseLog,
  ExerciseRole,
  Program,
  ProgramId,
  RootStore,
  SessionTemplate,
  SetLog,
  WorkoutSession,
} from "../domain/types.js";
import {
  PRESET_EXERCISES,
  PRESET_PROGRAMS,
  PRESET_TEMPLATES,
} from "../domain/presets.js";

/** 저장 계층 전용 오류. 검증/파싱 실패를 명확히 구분한다. */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

// ─────────────────────────────────────────────────────────────
// 원시 가드
// ─────────────────────────────────────────────────────────────

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** number | null 필드. */
function isNumberOrNull(x: unknown): x is number | null {
  return x === null || isFiniteNumber(x);
}

function isBoolean(x: unknown): x is boolean {
  return typeof x === "boolean";
}

function fail(path: string, expected: string): never {
  throw new StorageError(`검증 실패: ${path} — 기대: ${expected}`);
}

// ─────────────────────────────────────────────────────────────
// 도메인 서브구조 검증
// ─────────────────────────────────────────────────────────────

const EXERCISE_KINDS: readonly ExerciseKind[] = ["weighted", "bodyweight"];
const EXERCISE_ROLES: readonly ExerciseRole[] = ["main", "accessory"];
const PROGRAM_IDS: readonly ProgramId[] = ["upper", "lower"];
const WEIGHT_SOURCES = ["default", "auto_bump", "hold", "manual", "deload"] as const;

function validateExerciseDef(x: unknown, path: string): ExerciseDef {
  if (!isObject(x)) fail(path, "object");
  if (!isString(x.id)) fail(`${path}.id`, "string");
  if (!isString(x.name)) fail(`${path}.name`, "string");
  if (!isString(x.kind) || !EXERCISE_KINDS.includes(x.kind as ExerciseKind))
    fail(`${path}.kind`, "weighted|bodyweight");
  if (!isString(x.role) || !EXERCISE_ROLES.includes(x.role as ExerciseRole))
    fail(`${path}.role`, "main|accessory");
  if (!isFiniteNumber(x.setCount)) fail(`${path}.setCount`, "number");
  if (!isFiniteNumber(x.targetReps)) fail(`${path}.targetReps`, "number");
  if (!isFiniteNumber(x.progressionIncrementKg))
    fail(`${path}.progressionIncrementKg`, "number");
  if (!isNumberOrNull(x.defaultStartWeightKg))
    fail(`${path}.defaultStartWeightKg`, "number|null");
  const def: ExerciseDef = {
    id: x.id,
    name: x.name,
    kind: x.kind as ExerciseKind,
    role: x.role as ExerciseRole,
    setCount: x.setCount,
    targetReps: x.targetReps,
    progressionIncrementKg: x.progressionIncrementKg,
    defaultStartWeightKg: x.defaultStartWeightKg as number | null,
  };
  if (x.allowsAddedWeight !== undefined) {
    if (!isBoolean(x.allowsAddedWeight))
      fail(`${path}.allowsAddedWeight`, "boolean|undefined");
    def.allowsAddedWeight = x.allowsAddedWeight;
  }
  return def;
}

function validateSessionTemplate(x: unknown, path: string): SessionTemplate {
  if (!isObject(x)) fail(path, "object");
  if (!isString(x.id)) fail(`${path}.id`, "string");
  if (!isString(x.label)) fail(`${path}.label`, "string");
  if (!isString(x.shortLabel)) fail(`${path}.shortLabel`, "string");
  if (!Array.isArray(x.exerciseIds)) fail(`${path}.exerciseIds`, "array");
  const exerciseIds: string[] = [];
  x.exerciseIds.forEach((eid, i) => {
    if (!isString(eid)) fail(`${path}.exerciseIds[${i}]`, "string");
    exerciseIds.push(eid);
  });
  return { id: x.id, label: x.label, shortLabel: x.shortLabel, exerciseIds };
}

function validateProgram(x: unknown, path: string): Program {
  if (!isObject(x)) fail(path, "object");
  if (!isString(x.id) || !PROGRAM_IDS.includes(x.id as ProgramId))
    fail(`${path}.id`, "upper|lower");
  if (!isString(x.label)) fail(`${path}.label`, "string");
  if (!Array.isArray(x.rotation)) fail(`${path}.rotation`, "array");
  const rotation: string[] = [];
  x.rotation.forEach((r, i) => {
    if (!isString(r)) fail(`${path}.rotation[${i}]`, "string");
    rotation.push(r);
  });
  return { id: x.id as ProgramId, label: x.label, rotation };
}

function validateSetLog(x: unknown, path: string): SetLog {
  if (!isObject(x)) fail(path, "object");
  if (!isFiniteNumber(x.setIndex)) fail(`${path}.setIndex`, "number");
  if (!isNumberOrNull(x.weightKg)) fail(`${path}.weightKg`, "number|null");
  if (!isFiniteNumber(x.reps)) fail(`${path}.reps`, "number");
  if (!isString(x.completedAt)) fail(`${path}.completedAt`, "string");
  return {
    setIndex: x.setIndex,
    weightKg: x.weightKg as number | null,
    reps: x.reps,
    completedAt: x.completedAt,
  };
}

function validateExerciseLog(x: unknown, path: string): ExerciseLog {
  if (!isObject(x)) fail(path, "object");
  if (!isString(x.exerciseId)) fail(`${path}.exerciseId`, "string");
  if (
    !isString(x.kindAtLog) ||
    !EXERCISE_KINDS.includes(x.kindAtLog as ExerciseKind)
  )
    fail(`${path}.kindAtLog`, "weighted|bodyweight");
  if (!isNumberOrNull(x.plannedWeightKg))
    fail(`${path}.plannedWeightKg`, "number|null");
  if (!Array.isArray(x.sets)) fail(`${path}.sets`, "array");
  const sets = x.sets.map((s, i) => validateSetLog(s, `${path}.sets[${i}]`));
  return {
    exerciseId: x.exerciseId,
    kindAtLog: x.kindAtLog as ExerciseKind,
    plannedWeightKg: x.plannedWeightKg as number | null,
    sets,
  };
}

function validateSession(x: unknown, path: string): WorkoutSession {
  if (!isObject(x)) fail(path, "object");
  if (!isString(x.id)) fail(`${path}.id`, "string");
  if (!isString(x.programId) || !PROGRAM_IDS.includes(x.programId as ProgramId))
    fail(`${path}.programId`, "upper|lower");
  if (!isString(x.templateId)) fail(`${path}.templateId`, "string");
  if (!isString(x.localDate)) fail(`${path}.localDate`, "string");
  if (!isString(x.startedAt)) fail(`${path}.startedAt`, "string");
  if (x.completedAt !== null && !isString(x.completedAt))
    fail(`${path}.completedAt`, "string|null");
  if (!Array.isArray(x.exercises)) fail(`${path}.exercises`, "array");
  const exercises = x.exercises.map((e, i) =>
    validateExerciseLog(e, `${path}.exercises[${i}]`),
  );
  const session: WorkoutSession = {
    id: x.id,
    programId: x.programId as ProgramId,
    templateId: x.templateId,
    localDate: x.localDate,
    startedAt: x.startedAt,
    completedAt: x.completedAt as string | null,
    exercises,
  };
  if (x.manualWeightOverride !== undefined) {
    if (!isBoolean(x.manualWeightOverride))
      fail(`${path}.manualWeightOverride`, "boolean|undefined");
    session.manualWeightOverride = x.manualWeightOverride;
  }
  if (x.note !== undefined) {
    if (!isString(x.note)) fail(`${path}.note`, "string|undefined");
    session.note = x.note;
  }
  return session;
}

function validateSettings(x: unknown, path: string): AppSettings {
  if (!isObject(x)) fail(path, "object");
  if (
    !isString(x.activeProgram) ||
    !PROGRAM_IDS.includes(x.activeProgram as ProgramId)
  )
    fail(`${path}.activeProgram`, "upper|lower");
  if (x.unit !== "kg") fail(`${path}.unit`, '"kg"');
  if (!isFiniteNumber(x.weeklyGoal)) fail(`${path}.weeklyGoal`, "number");
  const settings: AppSettings = {
    activeProgram: x.activeProgram as ProgramId,
    unit: "kg",
    weeklyGoal: x.weeklyGoal,
  };
  if (x.bodyweightKg !== undefined) {
    if (!isFiniteNumber(x.bodyweightKg))
      fail(`${path}.bodyweightKg`, "number|undefined");
    settings.bodyweightKg = x.bodyweightKg;
  }
  return settings;
}

/**
 * exercises 맵 검증 + 프리셋 병합 복구.
 * 결측이면 프리셋을, 부분 존재면 검증 후 프리셋과 병합(프리셋 baseline 보존).
 */
function validateExercisesMap(x: unknown): RootStore["exercises"] {
  const merged: RootStore["exercises"] = {};
  for (const [id, def] of Object.entries(PRESET_EXERCISES)) {
    merged[id] = { ...def };
  }
  if (x === undefined || x === null) return merged;
  if (!isObject(x)) fail("exercises", "object");
  for (const [id, raw] of Object.entries(x)) {
    merged[id] = validateExerciseDef(raw, `exercises.${id}`);
  }
  return merged;
}

function validateTemplatesMap(x: unknown): RootStore["templates"] {
  const merged: RootStore["templates"] = {};
  for (const [id, tpl] of Object.entries(PRESET_TEMPLATES)) {
    merged[id] = { ...tpl, exerciseIds: [...tpl.exerciseIds] };
  }
  if (x === undefined || x === null) return merged;
  if (!isObject(x)) fail("templates", "object");
  for (const [id, raw] of Object.entries(x)) {
    merged[id] = validateSessionTemplate(raw, `templates.${id}`);
  }
  return merged;
}

function validateProgramsMap(x: unknown): RootStore["programs"] {
  const merged: RootStore["programs"] = {
    upper: { ...PRESET_PROGRAMS.upper, rotation: [...PRESET_PROGRAMS.upper.rotation] },
    lower: { ...PRESET_PROGRAMS.lower, rotation: [...PRESET_PROGRAMS.lower.rotation] },
  };
  if (x === undefined || x === null) return merged;
  if (!isObject(x)) fail("programs", "object");
  for (const [id, raw] of Object.entries(x)) {
    if (!PROGRAM_IDS.includes(id as ProgramId)) fail(`programs.${id}`, "upper|lower key");
    merged[id as ProgramId] = validateProgram(raw, `programs.${id}`);
  }
  return merged;
}

/**
 * weightState 맵 검증 + 복구.
 * 결측 종목은 프리셋 default 로 채우고, 존재분은 검증한다.
 */
function validateWeightStateMap(
  x: unknown,
  exercises: RootStore["exercises"],
  nowIso: string,
): RootStore["weightState"] {
  const out: RootStore["weightState"] = {};
  if (x !== undefined && x !== null) {
    if (!isObject(x)) fail("weightState", "object");
    for (const [id, raw] of Object.entries(x)) {
      if (!isObject(raw)) fail(`weightState.${id}`, "object");
      if (!isNumberOrNull(raw.currentTargetKg))
        fail(`weightState.${id}.currentTargetKg`, "number|null");
      if (
        !isString(raw.source) ||
        !(WEIGHT_SOURCES as readonly string[]).includes(raw.source)
      )
        fail(`weightState.${id}.source`, WEIGHT_SOURCES.join("|"));
      if (!isString(raw.updatedAt)) fail(`weightState.${id}.updatedAt`, "string");
      out[id] = {
        currentTargetKg: raw.currentTargetKg as number | null,
        source: raw.source as RootStore["weightState"][string]["source"],
        updatedAt: raw.updatedAt,
      };
    }
  }
  // 결측 종목 복구: 프리셋/정의의 defaultStartWeightKg 로 시드
  for (const def of Object.values(exercises)) {
    if (!out[def.id]) {
      out[def.id] = {
        currentTargetKg: def.defaultStartWeightKg,
        source: "default",
        updatedAt: nowIso,
      };
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 루트 검증
// ─────────────────────────────────────────────────────────────

/**
 * unknown 값을 검증해 RootStore 로 반환한다.
 * 필수 구조(schemaVersion/timestamps/sessions/settings)가 없거나 타입이 틀리면 throw.
 * optional map(exercises/templates/programs/weightState)은 프리셋 병합으로 복구.
 * 교차참조(세션의 programId/templateId, 세트 내 exerciseId)도 확인한다.
 */
export function validateStore(x: unknown): RootStore {
  if (!isObject(x)) throw new StorageError("검증 실패: 루트 — 기대: object");

  if (!isFiniteNumber(x.schemaVersion))
    fail("schemaVersion", "number");
  if (!isString(x.createdAt)) fail("createdAt", "string");
  if (!isString(x.updatedAt)) fail("updatedAt", "string");

  const exercises = validateExercisesMap(x.exercises);
  const templates = validateTemplatesMap(x.templates);
  const programs = validateProgramsMap(x.programs);

  if (!Array.isArray(x.sessions)) fail("sessions", "array");
  const sessions = x.sessions.map((s, i) =>
    validateSession(s, `sessions[${i}]`),
  );

  const nowIso = isString(x.updatedAt) ? x.updatedAt : new Date().toISOString();
  const weightState = validateWeightStateMap(x.weightState, exercises, nowIso);

  const settings = validateSettings(x.settings, "settings");

  // 교차참조 검증(soft): 세션이 참조하는 template 이 존재하는지 확인.
  // 프리셋 병합으로 대부분 복구되지만, 완전 미지의 참조는 데이터 무결성 신호이므로 throw.
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (!s) continue;
    if (!templates[s.templateId]) {
      fail(`sessions[${i}].templateId`, `존재하는 templateId (참조: ${s.templateId})`);
    }
    for (let j = 0; j < s.exercises.length; j++) {
      const ex = s.exercises[j];
      if (!ex) continue;
      if (!exercises[ex.exerciseId]) {
        fail(
          `sessions[${i}].exercises[${j}].exerciseId`,
          `존재하는 exerciseId (참조: ${ex.exerciseId})`,
        );
      }
    }
  }

  return {
    schemaVersion: x.schemaVersion,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    exercises,
    programs,
    templates,
    sessions,
    weightState,
    settings,
  };
}
