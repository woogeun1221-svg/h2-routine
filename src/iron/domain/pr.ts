/**
 * PR(개인 신기록) 탐지.
 *
 * 운동 종목별로 완료된 세션을 시간순(completedAt)으로 스캔하며
 * 4종 지표의 running max 를 유지한다: weight / reps / e1rm / volume.
 * 이전 최고를 "초과"(strictly greater)하는 첫 시점마다 PRRecord 를 emit 한다.
 * 동점(같은 값)은 신기록이 아니므로 스킵한다.
 *
 * 자체중량(kindAtLog === "bodyweight", weightKg === null)은 reps PR 만 인정하고
 * weight / e1rm / volume PR 은 제외한다(kg 기반 지표는 자체중량에서 의미 없음).
 */

import type {
  ExerciseId,
  ExerciseLog,
  PRRecord,
  WorkoutSession,
} from "./types.js";
import { estimate1RM } from "./oneRepMax.js";

/** 한 운동의 세션 내 등장(스캔 단위): 소속 세션 + 그 세션의 로그. */
interface ExerciseAppearance {
  session: WorkoutSession;
  log: ExerciseLog;
}

/** 운동별 running max 누산기. */
interface RunningMax {
  weight: number | null;
  reps: number | null;
  e1rm: number | null;
  volume: number | null;
}

/**
 * 완료된 세션만 completedAt 오름차순으로 정렬해 반환.
 * completedAt 이 null(진행 중)인 세션은 PR 판정에서 제외한다.
 */
function completedSessionsSorted(history: WorkoutSession[]): WorkoutSession[] {
  return history
    .filter((s): s is WorkoutSession & { completedAt: string } =>
      s.completedAt !== null,
    )
    .slice()
    .sort((a, b) => {
      // completedAt 은 위 filter 로 non-null 보장.
      const at = a.completedAt as string;
      const bt = b.completedAt as string;
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
}

/**
 * 운동 종목별로 시간순 등장 목록을 만든다.
 * key = ExerciseId, value = 시간순 정렬된 등장 배열.
 */
function appearancesByExercise(
  history: WorkoutSession[],
): Map<ExerciseId, ExerciseAppearance[]> {
  const map = new Map<ExerciseId, ExerciseAppearance[]>();
  for (const session of completedSessionsSorted(history)) {
    for (const log of session.exercises) {
      let bucket = map.get(log.exerciseId);
      if (bucket === undefined) {
        bucket = [];
        map.set(log.exerciseId, bucket);
      }
      bucket.push({ session, log });
    }
  }
  return map;
}

/** 한 운동 로그의 kg-볼륨(Σ weightKg×reps, null 무게는 0). */
function logVolume(log: ExerciseLog): number {
  let total = 0;
  for (const set of log.sets) {
    if (set.weightKg === null) continue;
    total += set.weightKg * set.reps;
  }
  return total;
}

/**
 * 한 운동의 한 등장(session+log)에서, 직전까지의 running max 를 초과하는
 * 지표들에 대해 PRRecord 를 생성하고 running max 를 갱신한다.
 * running 은 in-place 로 갱신된다.
 */
function detectAppearancePRs(
  exerciseId: ExerciseId,
  appearance: ExerciseAppearance,
  running: RunningMax,
): PRRecord[] {
  const { session, log } = appearance;
  const achievedAt = session.completedAt as string; // 완료 세션만 스캔.
  const isBodyweight = log.kindAtLog === "bodyweight";
  const records: PRRecord[] = [];

  // 이 등장 내 세트들에서의 최고치 집계.
  let bestReps: number | null = null;
  let bestWeight: number | null = null;
  let bestE1rm: number | null = null;

  for (const set of log.sets) {
    if (bestReps === null || set.reps > bestReps) bestReps = set.reps;

    if (set.weightKg !== null) {
      if (bestWeight === null || set.weightKg > bestWeight) {
        bestWeight = set.weightKg;
      }
      const e = estimate1RM(set.weightKg, set.reps);
      if (e !== null && (bestE1rm === null || e > bestE1rm)) {
        bestE1rm = e;
      }
    }
  }

  // reps PR — 모든 종목(자체중량 포함) 대상.
  if (bestReps !== null && (running.reps === null || bestReps > running.reps)) {
    running.reps = bestReps;
    records.push({
      exerciseId,
      kind: "reps",
      value: bestReps,
      sessionId: session.id,
      achievedAt,
    });
  }

  // 자체중량은 여기까지(weight / e1rm / volume 스킵).
  if (isBodyweight) return records;

  // weight PR.
  if (
    bestWeight !== null &&
    (running.weight === null || bestWeight > running.weight)
  ) {
    running.weight = bestWeight;
    records.push({
      exerciseId,
      kind: "weight",
      value: bestWeight,
      sessionId: session.id,
      achievedAt,
    });
  }

  // e1rm PR.
  if (
    bestE1rm !== null &&
    (running.e1rm === null || bestE1rm > running.e1rm)
  ) {
    running.e1rm = bestE1rm;
    records.push({
      exerciseId,
      kind: "e1rm",
      value: bestE1rm,
      sessionId: session.id,
      achievedAt,
    });
  }

  // volume PR — 이 세션의 해당 운동 kg-볼륨.
  const vol = logVolume(log);
  if (vol > 0 && (running.volume === null || vol > running.volume)) {
    running.volume = vol;
    records.push({
      exerciseId,
      kind: "volume",
      value: vol,
      sessionId: session.id,
      achievedAt,
    });
  }

  return records;
}

/**
 * 전체 히스토리에서 모든 PR 을 시간순으로 탐지한다.
 * 운동별 running max 를 시간순 스캔하며 초과 첫 시점마다 emit.
 */
export function detectPRs(history: WorkoutSession[]): PRRecord[] {
  const byExercise = appearancesByExercise(history);
  const all: PRRecord[] = [];

  for (const [exerciseId, appearances] of byExercise) {
    const running: RunningMax = {
      weight: null,
      reps: null,
      e1rm: null,
      volume: null,
    };
    for (const appearance of appearances) {
      const recs = detectAppearancePRs(exerciseId, appearance, running);
      for (const r of recs) all.push(r);
    }
  }

  // 전역 시간순 정렬(운동별로 모았으므로 최종 정렬).
  all.sort((a, b) =>
    a.achievedAt < b.achievedAt ? -1 : a.achievedAt > b.achievedAt ? 1 : 0,
  );
  return all;
}

/**
 * 특정 세션에서 "새로" 세운 PR 만 반환한다.
 * 전체 히스토리 기준으로 탐지한 뒤 sessionId 로 필터링한다.
 */
export function prsInSession(
  history: WorkoutSession[],
  sessionId: string,
): PRRecord[] {
  return detectPRs(history).filter((pr) => pr.sessionId === sessionId);
}
