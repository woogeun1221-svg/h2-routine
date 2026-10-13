/**
 * 진행(더블 프로그레션) 규칙 — 다음 세션 제안 무게 계산.
 *
 * 핵심 규칙(정통 더블 프로그레션):
 *   해당 운동의 "마지막 완료 세션"의 모든 워킹 세트가 전부 `reps >= def.targetReps` 이면
 *   base + progressionIncrementKg 로 증량(목표 달성 신호). 하나라도 미달이면 같은 무게 유지(유지).
 *
 * 자체중량(가중 불가)은 무게 개념이 없으므로 항상 null/'bodyweight'.
 * 첫 세션(기록 없음)은 defaultStartWeightKg/'first'.
 * weightState.source 가 manual/deload 이면 그 무게를 base 로 존중하되,
 * 증량/유지 규칙은 그 위에서 그대로 적용한다.
 */

import type {
  ExerciseDef,
  ExerciseLog,
  WorkoutSession,
  ExerciseWeightState,
  WeightSuggestion,
} from "./types.js";

/**
 * 자체중량(가중 불가) 여부.
 * kind 가 bodyweight 이고 allowsAddedWeight 가 아니면 무게 진행 규칙 대상이 아니다.
 * (풀업처럼 allowsAddedWeight 인 경우는 weighted 처럼 무게 추적 가능.)
 */
function isPureBodyweight(def: ExerciseDef): boolean {
  return def.kind === "bodyweight" && !def.allowsAddedWeight;
}

/**
 * history 에서 def.id 의 ExerciseLog 를 포함한 "마지막 완료 세션"을 찾아
 * 그 세션 안의 해당 ExerciseLog 를 반환한다. 없으면 null.
 * 완료 세션 = completedAt 이 비어있지 않은 세션.
 * localDate(그다음 startedAt) 오름차순 정렬 후 뒤에서부터 탐색.
 */
function findLastLog(
  def: ExerciseDef,
  history: WorkoutSession[],
): ExerciseLog | null {
  const completed = history
    .filter((s) => s.completedAt != null)
    .slice()
    .sort((a, b) => {
      if (a.localDate !== b.localDate) {
        return a.localDate < b.localDate ? -1 : 1;
      }
      return a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0;
    });

  for (let i = completed.length - 1; i >= 0; i--) {
    const session = completed[i];
    if (session === undefined) continue;
    const log = session.exercises.find((e) => e.exerciseId === def.id);
    if (log !== undefined) return log;
  }
  return null;
}

/**
 * 로그의 세트들에서 base 무게(폴백)를 구한다.
 * plannedWeightKg 가 있으면 그 값, 없으면 세트 중 최대 무게, 그것도 없으면 null.
 */
function baseFromLog(log: ExerciseLog): number | null {
  if (log.plannedWeightKg != null) return log.plannedWeightKg;
  let max: number | null = null;
  for (const set of log.sets) {
    if (set.weightKg != null && (max === null || set.weightKg > max)) {
      max = set.weightKg;
    }
  }
  return max;
}

/**
 * 마지막 세션의 모든 워킹 세트가 전부 목표 횟수 이상인지.
 * 세트가 하나도 없으면(방어) false — 증량 근거 없음.
 */
function allSetsHitTarget(log: ExerciseLog, targetReps: number): boolean {
  if (log.sets.length === 0) return false;
  return log.sets.every((set) => set.reps >= targetReps);
}

/**
 * 다음 세션 제안 무게를 계산한다.
 *
 * @param def         운동 정의
 * @param history     전체 세션 히스토리(완료/미완료 혼재 가능)
 * @param weightState 선택: 종목별 현재 목표 무게 상태(manual/deload 등)
 */
export function suggestedWeight(
  def: ExerciseDef,
  history: WorkoutSession[],
  weightState?: ExerciseWeightState,
): WeightSuggestion {
  // 자체중량(가중 불가) — 무게 진행 없음.
  if (isPureBodyweight(def)) {
    return {
      exerciseId: def.id,
      suggestedKg: null,
      isBump: false,
      reason: "bodyweight",
      incrementKg: 0,
    };
  }

  const lastLog = findLastLog(def, history);

  // 기록 없음 — 첫 세션.
  if (lastLog === null) {
    return {
      exerciseId: def.id,
      suggestedKg: def.defaultStartWeightKg,
      isBump: false,
      reason: "first",
      incrementKg: 0,
    };
  }

  // base = weightState.currentTargetKg > log.plannedWeightKg > 세트 최대 무게.
  const base =
    weightState?.currentTargetKg ?? baseFromLog(lastLog);

  // manual/deload 는 base 로 존중(reason 유지)하되, 증량 규칙은 그 위에서 적용.
  const respectSource =
    weightState?.source === "manual" || weightState?.source === "deload";
  const holdReason: WeightSuggestion["reason"] = respectSource
    ? (weightState.source as "manual" | "deload")
    : "hold";

  // 전 세트 목표 달성 → 증량(목표 달성 신호).
  if (allSetsHitTarget(lastLog, def.targetReps)) {
    const suggested =
      base == null ? null : base + def.progressionIncrementKg;
    // 실제 무게 증가가 있어야만 bump(reason='bump'). base 가 없거나 증가폭이 0이면
    // (예: 풀업 allowsAddedWeight+increment 0) 실무게 변화가 없으므로 유지 경로로 처리 —
    // reason 과 isBump 가 모순되어 UI 가 거짓 증량 신호를 띄우지 않게 한다.
    const isBump = suggested != null && def.progressionIncrementKg !== 0;
    return {
      exerciseId: def.id,
      suggestedKg: suggested,
      isBump,
      reason: isBump ? "bump" : holdReason,
      incrementKg: isBump ? def.progressionIncrementKg : 0,
    };
  }

  // 미달 → 유지(같은 무게 유지).
  return {
    exerciseId: def.id,
    suggestedKg: base,
    isBump: false,
    reason: holdReason,
    incrementKg: 0,
  };
}
