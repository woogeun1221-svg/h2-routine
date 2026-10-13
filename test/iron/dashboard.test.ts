/**
 * dashboard.ts 단위 테스트 — 대략적 조립 검증 + 빈 상태 방어.
 *
 * buildDashboard 는 규칙을 직접 구현하지 않고 도메인 함수들을 조립하므로,
 * 여기서는 (1) 빈 스토어에서도 안전하게 완전한 요약을 반환하는지,
 * (2) 종목 순회/다음 세션/진행 제안/PR/볼륨이 서로 맞물려 채워지는지를 본다.
 */

import { describe, expect, it } from "vitest";
import { buildDashboard } from "../../src/iron/domain/dashboard.js";
import { initialStore } from "../../src/iron/domain/presets.js";
import type {
  ExerciseId,
  RootStore,
  SessionTemplateId,
  SetLog,
  WorkoutSession,
} from "../../src/iron/domain/types.js";

/** 세트 하나 생성. */
function set(setIndex: number, weightKg: number | null, reps: number): SetLog {
  return {
    setIndex,
    weightKg,
    reps,
    completedAt: `2026-01-0${setIndex + 1}T10:00:00.000Z`,
  };
}

/**
 * 완료 세션 하나 생성. exercises 는 (id, kind, plannedKg, [무게, 횟수]...) 로 지정.
 */
function makeSession(
  opts: {
    id: string;
    programId: "upper" | "lower";
    templateId: SessionTemplateId;
    localDate: string;
    completedAt: string | null;
    exercises: Array<{
      exerciseId: ExerciseId;
      kind: "weighted" | "bodyweight";
      plannedWeightKg: number | null;
      sets: SetLog[];
    }>;
  },
): WorkoutSession {
  return {
    id: opts.id,
    programId: opts.programId,
    templateId: opts.templateId,
    localDate: opts.localDate,
    startedAt: `${opts.localDate}T09:00:00.000Z`,
    completedAt: opts.completedAt,
    exercises: opts.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      kindAtLog: e.kind,
      plannedWeightKg: e.plannedWeightKg,
      sets: e.sets,
    })),
  };
}

describe("buildDashboard — 빈 상태 방어", () => {
  it("세션 0개여도 완전한 요약을 반환한다", () => {
    const store = initialStore();
    const dash = buildDashboard(store, "upper", "2026-01-15");

    expect(dash.program).toBe("upper");
    // 다음 세션은 rotation[0] = 단일 상체 세션.
    expect(dash.next.template.id).toBe("upper");
    expect(dash.next.lap).toBe(0);
    // upper 템플릿 전체 종목(exerciseIds 순서, 페어 인접 배치).
    expect(dash.perExercise.map((p) => p.def.id)).toEqual([
      "bench_press",
      "triceps",
      "pullup",
      "pushup",
      "row",
      "military_press",
    ]);
    // 첫 세션 제안: weighted 는 defaultStart, 자체중량은 bodyweight/null.
    const bench = dash.perExercise.find((p) => p.def.id === "bench_press");
    expect(bench?.suggestion.reason).toBe("first");
    expect(bench?.suggestion.suggestedKg).toBe(60);
    expect(bench?.currentKg).toBe(60);
    expect(bench?.lastResult).toBeNull();
    expect(bench?.best1RM).toBeNull();

    // pushup 은 순수 자체중량(allowsAddedWeight 없음) → bodyweight/null.
    const pushup = dash.perExercise.find((p) => p.def.id === "pushup");
    expect(pushup?.suggestion.reason).toBe("bodyweight");
    expect(pushup?.suggestion.suggestedKg).toBeNull();
    // pullup 은 allowsAddedWeight → weighted 취급(첫 세션 first, defaultStart=null).
    const pullup = dash.perExercise.find((p) => p.def.id === "pullup");
    expect(pullup?.suggestion.reason).toBe("first");
    expect(pullup?.suggestion.suggestedKg).toBeNull();

    expect(dash.lastSessionVolume).toBeNull();
    expect(dash.recentPRs).toEqual([]);
    expect(dash.streak.current).toBe(0);
    expect(dash.streak.weeklyGoal).toBe(3);
  });

  it("알 수 없는 프로그램은 throw", () => {
    const store = initialStore();
    // @ts-expect-error 의도적 잘못된 programId.
    expect(() => buildDashboard(store, "cardio", "2026-01-15")).toThrow();
  });
});

describe("buildDashboard — 조립 검증", () => {
  it("전 세트 12회 달성 → 다음 제안 +2.5(bump), 마지막 결과 allHit, 볼륨/PR 채워짐", () => {
    const store: RootStore = initialStore();
    // 벤치 60kg × 12회 4세트 완료(전 세트 목표 달성).
    const session = makeSession({
      id: "s1",
      programId: "upper",
      templateId: "upper",
      localDate: "2026-01-05",
      completedAt: "2026-01-05T11:00:00.000Z",
      exercises: [
        {
          exerciseId: "bench_press",
          kind: "weighted",
          plannedWeightKg: 60,
          sets: [
            set(0, 60, 12),
            set(1, 60, 12),
            set(2, 60, 12),
            set(3, 60, 12),
          ],
        },
      ],
    });
    store.sessions = [session];

    const dash = buildDashboard(store, "upper", "2026-01-10");

    const bench = dash.perExercise.find((p) => p.def.id === "bench_press");
    expect(bench?.suggestion.reason).toBe("bump");
    expect(bench?.suggestion.isBump).toBe(true);
    expect(bench?.suggestion.suggestedKg).toBe(62.5);
    expect(bench?.lastResult?.allHit).toBe(true);
    expect(bench?.lastResult?.topSetKg).toBe(60);
    expect(bench?.lastResult?.topReps).toBe(12);
    expect(bench?.lastResult?.date).toBe("2026-01-05");
    expect(bench?.best1RM).not.toBeNull();

    // 볼륨 = 60*12*4 = 2880.
    expect(dash.lastSessionVolume).toBe(2880);
    // 첫 등장이므로 PR 이 잡혀야 함.
    expect(dash.recentPRs.length).toBeGreaterThan(0);
  });

  it("미달 세트가 있으면 hold, allHit=false", () => {
    const store = initialStore();
    store.sessions = [
      makeSession({
        id: "s1",
        programId: "upper",
        templateId: "upper",
        localDate: "2026-01-05",
        completedAt: "2026-01-05T11:00:00.000Z",
        exercises: [
          {
            exerciseId: "bench_press",
            kind: "weighted",
            plannedWeightKg: 60,
            sets: [set(0, 60, 12), set(1, 60, 10), set(2, 60, 12), set(3, 60, 12)],
          },
        ],
      }),
    ];

    const dash = buildDashboard(store, "upper", "2026-01-10");
    const bench = dash.perExercise.find((p) => p.def.id === "bench_press");
    expect(bench?.suggestion.reason).toBe("hold");
    expect(bench?.suggestion.suggestedKg).toBe(60);
    expect(bench?.lastResult?.allHit).toBe(false);
    expect(bench?.lastResult?.topReps).toBe(12);
  });

  it("다른 프로그램(lower) 세션은 upper 대시보드에 섞이지 않는다", () => {
    const store = initialStore();
    store.sessions = [
      makeSession({
        id: "low1",
        programId: "lower",
        templateId: "lower_day",
        localDate: "2026-01-05",
        completedAt: "2026-01-05T11:00:00.000Z",
        exercises: [
          {
            exerciseId: "squat",
            kind: "weighted",
            plannedWeightKg: 60,
            sets: [set(0, 60, 12)],
          },
        ],
      }),
    ];

    const dash = buildDashboard(store, "upper", "2026-01-10");
    // upper 에는 스쿼트 없음, 볼륨/PR 은 upper 기준 비어야 함.
    expect(dash.perExercise.some((p) => p.def.id === "squat")).toBe(false);
    expect(dash.lastSessionVolume).toBeNull();
    expect(dash.recentPRs).toEqual([]);
    // 하지만 스트릭은 전체 세션 기준 → 이번 활동이 반영될 수 있음.
    expect(dash.streak.longest).toBeGreaterThanOrEqual(1);
  });

  it("lower 대시보드는 스쿼트 하나만 순회", () => {
    const store = initialStore();
    const dash = buildDashboard(store, "lower", "2026-01-10");
    expect(dash.perExercise.map((p) => p.def.id)).toEqual(["squat"]);
    expect(dash.next.template.id).toBe("lower_day");
  });
});
