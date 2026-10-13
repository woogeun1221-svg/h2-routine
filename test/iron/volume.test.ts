/**
 * volume 도메인 테스트 — kg-볼륨과 rep-볼륨.
 */

import { describe, expect, it } from "vitest";
import {
  exerciseVolume,
  sessionRepVolume,
  sessionVolume,
} from "../../src/iron/domain/volume.js";
import type { ExerciseLog, WorkoutSession } from "../../src/iron/domain/types.js";

/** ExerciseLog 헬퍼. */
function log(
  exerciseId: string,
  kind: "weighted" | "bodyweight",
  sets: Array<{ weightKg: number | null; reps: number }>,
): ExerciseLog {
  return {
    exerciseId,
    kindAtLog: kind,
    plannedWeightKg: sets[0]?.weightKg ?? null,
    sets: sets.map((s, i) => ({
      setIndex: i,
      weightKg: s.weightKg,
      reps: s.reps,
      completedAt: "2026-06-01T10:30:00.000Z",
    })),
  };
}

/** 여러 ExerciseLog 를 담은 세션. */
function session(id: string, logs: ExerciseLog[]): WorkoutSession {
  return {
    id,
    programId: "upper",
    templateId: "upper",
    localDate: "2026-06-01",
    startedAt: "2026-06-01T10:00:00.000Z",
    completedAt: "2026-06-01T11:00:00.000Z",
    exercises: logs,
  };
}

describe("exerciseVolume", () => {
  it("Σ(weightKg × reps)", () => {
    // 60*12 + 60*10 = 720 + 600 = 1320
    const l = log("bench_press", "weighted", [
      { weightKg: 60, reps: 12 },
      { weightKg: 60, reps: 10 },
    ]);
    expect(exerciseVolume(l)).toBe(1320);
  });

  it("자체중량(무게 null) 세트는 0 으로 취급 → kg-볼륨 0", () => {
    const l = log("pullup", "bodyweight", [
      { weightKg: null, reps: 12 },
      { weightKg: null, reps: 8 },
    ]);
    expect(exerciseVolume(l)).toBe(0);
  });
});

describe("sessionVolume", () => {
  it("혼합 세션: weighted 는 더하고 bodyweight 는 0", () => {
    // bench: 60*12 + 62.5*10 = 720 + 625 = 1345
    // pullup: 0
    const s = session("s1", [
      log("bench_press", "weighted", [
        { weightKg: 60, reps: 12 },
        { weightKg: 62.5, reps: 10 },
      ]),
      log("pullup", "bodyweight", [
        { weightKg: null, reps: 12 },
        { weightKg: null, reps: 10 },
      ]),
    ]);
    expect(sessionVolume(s)).toBe(1345);
  });

  it("운동이 없으면 0", () => {
    expect(sessionVolume(session("s0", []))).toBe(0);
  });
});

describe("sessionRepVolume", () => {
  it("혼합 세션: 모든 세트 Σreps (무게 무관)", () => {
    // 12 + 10 + 12 + 10 = 44
    const s = session("s1", [
      log("bench_press", "weighted", [
        { weightKg: 60, reps: 12 },
        { weightKg: 62.5, reps: 10 },
      ]),
      log("pullup", "bodyweight", [
        { weightKg: null, reps: 12 },
        { weightKg: null, reps: 10 },
      ]),
    ]);
    expect(sessionRepVolume(s)).toBe(44);
  });

  it("자체중량만 있어도 reps 는 집계된다", () => {
    const s = session("s1", [
      log("pullup", "bodyweight", [
        { weightKg: null, reps: 12 },
        { weightKg: null, reps: 8 },
        { weightKg: null, reps: 6 },
      ]),
    ]);
    expect(sessionRepVolume(s)).toBe(26);
  });
});
