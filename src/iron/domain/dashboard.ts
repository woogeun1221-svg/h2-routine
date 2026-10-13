/**
 * 대시보드(홈) 셀렉터 — 여러 도메인 함수를 조립해 DashboardSummary 를 만든다.
 *
 * 순수 함수. store 스냅샷을 입력받아, 특정 프로그램(programId) 관점의 요약을 반환한다.
 * 내부에서 rotation/progression/oneRepMax/volume/pr/streak 를 호출만 하고,
 * 규칙 자체는 각 도메인 모듈에 위임한다(중복 구현 금지).
 *
 * 스코프 규칙:
 * - 다음 세션·종목별 진행·최근 PR·지난 세션 볼륨은 "그 프로그램의 완료 세션"만 대상.
 * - 스트릭(주간 연속)은 설계상 프로그램 무관 전체 세션 기준 → store.sessions 전체를 넘긴다.
 */

import type {
  DashboardSummary,
  ExerciseDef,
  ExerciseId,
  ExerciseLog,
  PRRecord,
  ProgramId,
  RootStore,
  WorkoutSession,
} from "./types.js";
import { nextWorkout } from "./rotation.js";
import { suggestedWeight } from "./progression.js";
import { best1RM } from "./oneRepMax.js";
import { sessionVolume } from "./volume.js";
import { detectPRs } from "./pr.js";
import { computeWeeklyStreak } from "./streak.js";

/** 최근 PR 카드에 노출할 최대 개수. */
const RECENT_PR_LIMIT = 6;

/**
 * 프로그램 템플릿에 등장하는 모든 종목 id 를 순서대로(중복 제거) 모은다.
 * rotation 순서 → 각 템플릿의 exerciseIds 순서. 이미 본 id 는 건너뛴다.
 */
function programExerciseIds(store: RootStore, programId: ProgramId): ExerciseId[] {
  const program = store.programs[programId];
  if (program === undefined) return [];

  const seen = new Set<ExerciseId>();
  const ordered: ExerciseId[] = [];
  for (const templateId of program.rotation) {
    const template = store.templates[templateId];
    if (template === undefined) continue;
    for (const exId of template.exerciseIds) {
      if (seen.has(exId)) continue;
      seen.add(exId);
      ordered.push(exId);
    }
  }
  return ordered;
}

/**
 * 해당 프로그램의 완료 세션만 완료 시각 오름차순으로 정렬해 반환.
 * 완료 세션(completedAt != null)만 대시보드 집계 대상.
 */
function completedProgramSessions(
  store: RootStore,
  programId: ProgramId,
): WorkoutSession[] {
  return store.sessions
    .filter((s) => s.programId === programId && s.completedAt != null)
    .slice()
    .sort((a, b) => {
      const at = a.completedAt ?? "";
      const bt = b.completedAt ?? "";
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
}

/**
 * 특정 종목의 "마지막 완료 세션"에서의 결과 요약을 만든다.
 * @param history 완료 시각 오름차순 정렬된 프로그램 세션.
 * @returns 기록이 없으면 null.
 *   - allHit: 그 세션의 모든 세트가 def.targetReps 이상(전 세트 목표 달성)인지.
 *   - topSetKg: 세트 중 최대 무게(자체중량이면 null).
 *   - topReps: 세트 중 최대 횟수.
 */
function lastResultFor(
  def: ExerciseDef,
  history: WorkoutSession[],
): DashboardSummary["perExercise"][number]["lastResult"] {
  // 뒤에서부터: 이미 완료시각 오름차순이므로 마지막 등장이 최신.
  for (let i = history.length - 1; i >= 0; i--) {
    const session = history[i];
    if (session === undefined) continue;
    const log = session.exercises.find((e) => e.exerciseId === def.id);
    if (log === undefined) continue;

    return {
      date: session.localDate,
      allHit: allSetsHit(log, def.targetReps),
      topSetKg: topSetWeight(log),
      topReps: topReps(log),
    };
  }
  return null;
}

/** 로그의 모든 세트가 targetReps 이상인지. 세트가 없으면 false. */
function allSetsHit(log: ExerciseLog, targetReps: number): boolean {
  if (log.sets.length === 0) return false;
  return log.sets.every((set) => set.reps >= targetReps);
}

/** 로그 세트 중 최대 무게(전부 null 이면 null). */
function topSetWeight(log: ExerciseLog): number | null {
  let max: number | null = null;
  for (const set of log.sets) {
    if (set.weightKg != null && (max === null || set.weightKg > max)) {
      max = set.weightKg;
    }
  }
  return max;
}

/** 로그 세트 중 최대 횟수(세트 없으면 0). */
function topReps(log: ExerciseLog): number {
  let max = 0;
  for (const set of log.sets) {
    if (set.reps > max) max = set.reps;
  }
  return max;
}

/**
 * 대시보드 요약을 조립한다.
 *
 * @param store     루트 스토어 스냅샷.
 * @param programId 대상 프로그램(상체/하체).
 * @param today     "YYYY-MM-DD" 로컬 오늘(스트릭 계산 기준).
 */
export function buildDashboard(
  store: RootStore,
  programId: ProgramId,
  today: string,
): DashboardSummary {
  const program = store.programs[programId];
  if (program === undefined) {
    throw new Error(`unknown program "${programId}"`);
  }

  const history = completedProgramSessions(store, programId);

  // 다음 세션(로테이션). rotation 은 완료 여부를 내부에서 다시 필터하므로 전체 세션을 넘겨도 되지만,
  // 프로그램 스코프를 명확히 하기 위해 store.sessions 전체를 전달(내부에서 programId 로 필터).
  const next = nextWorkout(program, store.templates, store.sessions);

  // 종목별 요약 — 프로그램 템플릿에 등장하는 모든 종목(중복 제거) 순회.
  const perExercise: DashboardSummary["perExercise"] = [];
  for (const exId of programExerciseIds(store, programId)) {
    const def = store.exercises[exId];
    if (def === undefined) continue; // 정의 없는 id 는 방어적으로 스킵.

    const weightState = store.weightState[exId];
    const suggestion = suggestedWeight(def, history, weightState);

    perExercise.push({
      def,
      currentKg: weightState?.currentTargetKg ?? def.defaultStartWeightKg,
      lastResult: lastResultFor(def, history),
      suggestion,
      best1RM: best1RM(history, exId),
    });
  }

  // 지난(마지막) 완료 세션 볼륨.
  const lastSession = history[history.length - 1];
  const lastSessionVolume =
    lastSession === undefined ? null : sessionVolume(lastSession);

  // 스트릭 — 설계상 프로그램 무관 전체 세션 기준. weeklyGoal 은 설정값 사용.
  const streak = computeWeeklyStreak(
    store.sessions,
    today,
    store.settings.weeklyGoal,
  );

  // 최근 PR — 이 프로그램 완료 세션 기준, 시간 역순으로 상위 N개.
  const allPRs: PRRecord[] = detectPRs(history);
  const recentPRs = allPRs
    .slice()
    .sort((a, b) =>
      a.achievedAt < b.achievedAt ? 1 : a.achievedAt > b.achievedAt ? -1 : 0,
    )
    .slice(0, RECENT_PR_LIMIT);

  return {
    program: programId,
    next,
    perExercise,
    lastSessionVolume,
    streak,
    recentPRs,
  };
}
