/**
 * oneRepMax 도메인 테스트 — Epley 추정과 히스토리 최고 1RM.
 */

import { describe, expect, it } from "vitest";
import { best1RM, estimate1RM } from "../../src/iron/domain/oneRepMax.js";
import type { WorkoutSession } from "../../src/iron/domain/types.js";

describe("estimate1RM (Epley)", () => {
  it("100kg × 10회 → 133.33 (w × (1 + reps/30))", () => {
    const e1rm = estimate1RM(100, 10);
    expect(e1rm).not.toBeNull();
    expect(e1rm!).toBeCloseTo(133.333, 3);
  });

  it("reps === 1 이면 무게 그대로", () => {
    expect(estimate1RM(140, 1)).toBe(140);
  });

  it("reps <= 0 이면 null", () => {
    expect(estimate1RM(100, 0)).toBeNull();
    expect(estimate1RM(100, -5)).toBeNull();
  });

  it("무게 null(자체중량)이면 null", () => {
    expect(estimate1RM(null, 12)).toBeNull();
    expect(estimate1RM(null, 1)).toBeNull();
  });

  it("60kg × 5회 → 70 (60 × (1 + 5/30))", () => {
    expect(estimate1RM(60, 5)!).toBeCloseTo(70, 6);
  });
});

/** 세션 하나를 간단히 만드는 헬퍼. */
function session(
  id: string,
  exerciseId: string,
  sets: Array<{ weightKg: number | null; reps: number }>,
): WorkoutSession {
  return {
    id,
    programId: "upper",
    templateId: "upper",
    localDate: "2026-06-01",
    startedAt: "2026-06-01T10:00:00.000Z",
    completedAt: "2026-06-01T11:00:00.000Z",
    exercises: [
      {
        exerciseId,
        kindAtLog: sets.some((s) => s.weightKg === null) ? "bodyweight" : "weighted",
        plannedWeightKg: sets[0]?.weightKg ?? null,
        sets: sets.map((s, i) => ({
          setIndex: i,
          weightKg: s.weightKg,
          reps: s.reps,
          completedAt: "2026-06-01T10:30:00.000Z",
        })),
      },
    ],
  };
}

describe("best1RM", () => {
  it("여러 세션·세트 중 최고 추정 1RM 을 고른다", () => {
    const history: WorkoutSession[] = [
      session("s1", "bench_press", [
        { weightKg: 60, reps: 10 }, // 80
        { weightKg: 62.5, reps: 8 }, // 62.5*(1+8/30)=79.17
      ]),
      session("s2", "bench_press", [
        { weightKg: 70, reps: 5 }, // 70*(1+5/30)=81.67  ← 최고
        { weightKg: 65, reps: 3 }, // 71.5
      ]),
    ];
    const best = best1RM(history, "bench_press");
    expect(best).not.toBeNull();
    expect(best!).toBeCloseTo(81.667, 3);
  });

  it("다른 종목 로그는 무시한다", () => {
    const history: WorkoutSession[] = [
      session("s1", "row", [{ weightKg: 100, reps: 5 }]),
    ];
    expect(best1RM(history, "bench_press")).toBeNull();
  });

  it("자체중량만 있으면 null (1RM 정의 불가)", () => {
    const history: WorkoutSession[] = [
      session("s1", "pullup", [
        { weightKg: null, reps: 12 },
        { weightKg: null, reps: 10 },
      ]),
    ];
    expect(best1RM(history, "pullup")).toBeNull();
  });

  it("히스토리가 비면 null", () => {
    expect(best1RM([], "bench_press")).toBeNull();
  });

  it("reps<=0 세트는 후보에서 제외", () => {
    const history: WorkoutSession[] = [
      session("s1", "bench_press", [
        { weightKg: 200, reps: 0 }, // 제외
        { weightKg: 50, reps: 10 }, // 66.67
      ]),
    ];
    expect(best1RM(history, "bench_press")!).toBeCloseTo(66.667, 3);
  });
});
