/**
 * 볼륨 계산 — 세션/운동 단위.
 *
 * 순수 함수. kg-볼륨은 Σ(weightKg × reps), 무게 null(자체중량)은 0 으로 취급.
 * 자체중량 진행·표시를 위해 rep-볼륨(Σreps)도 별도 제공.
 */

import type { ExerciseLog, WorkoutSession } from "./types.js";

/**
 * 한 운동 로그의 kg-볼륨: Σ(weightKg × reps).
 * weightKg 가 null 인 세트는 0 으로 더한다(자체중량은 kg-볼륨 제외).
 */
export function exerciseVolume(log: ExerciseLog): number {
  let total = 0;
  for (const set of log.sets) {
    if (set.weightKg === null) continue;
    total += set.weightKg * set.reps;
  }
  return total;
}

/**
 * 한 세션의 kg-볼륨: 모든 운동·모든 세트의 Σ(weightKg × reps).
 * 자체중량 세트는 0.
 */
export function sessionVolume(session: WorkoutSession): number {
  let total = 0;
  for (const log of session.exercises) {
    total += exerciseVolume(log);
  }
  return total;
}

/**
 * 한 세션의 rep-볼륨: 모든 운동·모든 세트의 Σreps.
 * 무게와 무관(자체중량 진행 지표).
 */
export function sessionRepVolume(session: WorkoutSession): number {
  let total = 0;
  for (const log of session.exercises) {
    for (const set of log.sets) {
      total += set.reps;
    }
  }
  return total;
}
