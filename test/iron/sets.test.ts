/** 세트 수 조정 규칙 — 초기 세트 수(지난 기록 기억), 추가/삭제 상·하한. */
import { describe, it, expect } from "vitest";
import { PRESET_EXERCISES } from "../../src/iron/domain/presets.js";
import type { ExerciseLog } from "../../src/iron/domain/types.js";
import { MAX_SETS, MIN_SETS, appendSet, clampSetCount, initialSetCount, removeSetAt } from "../../src/iron/domain/sets.js";

const bench = PRESET_EXERCISES.bench_press!;
function log(n: number): ExerciseLog {
  return { exerciseId: "bench_press", kindAtLog: "weighted", plannedWeightKg: 60,
    sets: Array.from({ length: n }, (_, i) => ({ setIndex: i, weightKg: 60, reps: 12, completedAt: "2026-10-13T00:00:00Z" })) };
}

describe("sets", () => {
  it("지난 기록이 없으면 종목 기본값, 있으면 그때 한 세트 수", () => {
    expect(initialSetCount(bench, null)).toBe(4);
    expect(initialSetCount(bench, log(3))).toBe(3);
    expect(initialSetCount(bench, log(5))).toBe(5);
    expect(initialSetCount(bench, log(0))).toBe(4);
  });

  it("추가는 마지막 세트를 복제하고 상한에서 멈춘다", () => {
    const next = appendSet([{ reps: 10 }, { reps: 8 }], (last) => ({ reps: last?.reps ?? 12 }));
    expect(next).toEqual([{ reps: 10 }, { reps: 8 }, { reps: 8 }]);
    const full = Array.from({ length: MAX_SETS }, () => ({ reps: 1 }));
    expect(appendSet(full, () => ({ reps: 1 })).length).toBe(MAX_SETS);
  });

  it("삭제는 하한에서 멈추고 범위 밖은 무시한다", () => {
    expect(removeSetAt([1, 2, 3], 1)).toEqual([1, 3]);
    expect(removeSetAt([1], 0)).toEqual([1]);
    expect(removeSetAt([1, 2], 5)).toEqual([1, 2]);
    expect(MIN_SETS).toBe(1);
  });

  it("clamp", () => {
    expect(clampSetCount(0)).toBe(1);
    expect(clampSetCount(99)).toBe(MAX_SETS);
    expect(clampSetCount(3.6)).toBe(4);
    expect(clampSetCount(Number.NaN)).toBe(1);
  });
});
