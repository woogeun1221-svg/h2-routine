/**
 * 1RM(1회 최대 반복 무게) 추정 — Epley 공식.
 *
 * 순수 함수. React·저장 계층과 무관하며 단위테스트 대상.
 * 자체중량(무게 null)은 1RM 개념이 없으므로 항상 null 을 반환한다.
 */

import type { ExerciseId, WorkoutSession } from "./types.js";

/**
 * Epley 추정 1RM: w × (1 + reps / 30).
 *
 * - reps ≤ 0  → null (유효한 세트가 아님)
 * - reps === 1 → w 그대로 (1회 = 그 자체가 1RM)
 * - weightKg === null(자체중량) → null (1RM 정의 불가)
 */
export function estimate1RM(weightKg: number | null, reps: number): number | null {
  if (weightKg === null) return null;
  if (reps <= 0) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * 히스토리 전체에서 해당 종목의 최고 추정 1RM.
 *
 * 모든 세션의 해당 exerciseId 로그 → 모든 세트의 estimate1RM 중 최댓값.
 * 유효한 값(null 제외)이 하나도 없으면 null.
 */
export function best1RM(
  history: WorkoutSession[],
  exerciseId: ExerciseId,
): number | null {
  let best: number | null = null;
  for (const session of history) {
    for (const log of session.exercises) {
      if (log.exerciseId !== exerciseId) continue;
      for (const set of log.sets) {
        const e1rm = estimate1RM(set.weightKg, set.reps);
        if (e1rm === null) continue;
        if (best === null || e1rm > best) best = e1rm;
      }
    }
  }
  return best;
}
