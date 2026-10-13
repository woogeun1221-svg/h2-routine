/**
 * progression.ts — suggestedWeight 단위 테스트.
 *
 * 검증: 전 세트 12회 → +2.5(상체)/+5(스쿼트) bump, 한 세트라도 11 → hold,
 * 첫 세션 default, 자체중량 null, 빈 세트 방어, 4세트/7세트, manual/deload 존중.
 */

import { describe, it, expect } from "vitest";
import { suggestedWeight } from "../../src/iron/domain/progression.js";
import type {
  ExerciseDef,
  ExerciseLog,
  SetLog,
  WorkoutSession,
  ExerciseWeightState,
} from "../../src/iron/domain/types.js";

// ─────────────────────────────────────────────────────────────
// 팩토리 헬퍼
// ─────────────────────────────────────────────────────────────

const benchDef: ExerciseDef = {
  id: "bench_press",
  name: "벤치프레스",
  kind: "weighted",
  role: "main",
  setCount: 4,
  targetReps: 12,
  progressionIncrementKg: 2.5,
  defaultStartWeightKg: 60,
};

const squatDef: ExerciseDef = {
  id: "squat",
  name: "스쿼트",
  kind: "weighted",
  role: "main",
  setCount: 7,
  targetReps: 12,
  progressionIncrementKg: 5,
  defaultStartWeightKg: 80,
};

const pushupDef: ExerciseDef = {
  id: "pushup",
  name: "푸쉬업",
  kind: "bodyweight",
  role: "accessory",
  setCount: 4,
  targetReps: 12,
  progressionIncrementKg: 0,
  defaultStartWeightKg: null,
};

const pullupDef: ExerciseDef = {
  id: "pullup",
  name: "풀업",
  kind: "bodyweight",
  role: "main",
  setCount: 4,
  targetReps: 12,
  progressionIncrementKg: 0,
  defaultStartWeightKg: null,
  allowsAddedWeight: true,
};

/** 균일한 세트 목록 생성(모두 같은 무게/횟수). */
function makeSets(
  count: number,
  weightKg: number | null,
  reps: number,
): SetLog[] {
  return Array.from({ length: count }, (_, i) => ({
    setIndex: i,
    weightKg,
    reps,
    completedAt: `2026-06-01T10:0${i}:00.000Z`,
  }));
}

/** 개별 reps 배열로 세트 목록 생성(무게 동일). */
function makeSetsWithReps(weightKg: number | null, reps: number[]): SetLog[] {
  return reps.map((r, i) => ({
    setIndex: i,
    weightKg,
    reps: r,
    completedAt: `2026-06-01T10:0${i}:00.000Z`,
  }));
}

function makeLog(
  exerciseId: string,
  plannedWeightKg: number | null,
  sets: SetLog[],
  kind: "weighted" | "bodyweight" = "weighted",
): ExerciseLog {
  return { exerciseId, kindAtLog: kind, plannedWeightKg, sets };
}

let sessionCounter = 0;
function makeSession(
  logs: ExerciseLog[],
  opts: {
    localDate?: string;
    completed?: boolean;
    programId?: "upper" | "lower";
    templateId?: string;
  } = {},
): WorkoutSession {
  sessionCounter += 1;
  const localDate = opts.localDate ?? "2026-06-01";
  return {
    id: `s${sessionCounter}`,
    programId: opts.programId ?? "upper",
    templateId: opts.templateId ?? "upper",
    localDate,
    startedAt: `${localDate}T10:00:00.000Z`,
    completedAt: opts.completed === false ? null : `${localDate}T11:00:00.000Z`,
    exercises: logs,
  };
}

// ─────────────────────────────────────────────────────────────
// 자체중량
// ─────────────────────────────────────────────────────────────

describe("자체중량", () => {
  it("가중 불가 자체중량은 항상 null/bodyweight", () => {
    const r = suggestedWeight(pushupDef, []);
    expect(r.suggestedKg).toBeNull();
    expect(r.isBump).toBe(false);
    expect(r.reason).toBe("bodyweight");
    expect(r.incrementKg).toBe(0);
    expect(r.exerciseId).toBe("pushup");
  });

  it("히스토리가 있어도 자체중량은 bodyweight", () => {
    const history = [
      makeSession([makeLog("pushup", null, makeSets(4, null, 15), "bodyweight")]),
    ];
    const r = suggestedWeight(pushupDef, history);
    expect(r.reason).toBe("bodyweight");
    expect(r.suggestedKg).toBeNull();
  });

  it("allowsAddedWeight(풀업)는 자체중량 예외 — 무게 진행 대상", () => {
    // 첫 세션이면 default(null) 이지만 reason 은 first(bodyweight 아님).
    const r = suggestedWeight(pullupDef, []);
    expect(r.reason).toBe("first");
    expect(r.suggestedKg).toBeNull(); // defaultStartWeightKg 가 null
  });
});

// ─────────────────────────────────────────────────────────────
// 첫 세션
// ─────────────────────────────────────────────────────────────

describe("첫 세션", () => {
  it("기록 없으면 defaultStartWeightKg/first", () => {
    const r = suggestedWeight(benchDef, []);
    expect(r.suggestedKg).toBe(60);
    expect(r.reason).toBe("first");
    expect(r.isBump).toBe(false);
    expect(r.incrementKg).toBe(0);
  });

  it("다른 종목만 있는 히스토리도 첫 세션 취급", () => {
    const history = [
      makeSession([makeLog("squat", 80, makeSets(7, 80, 12))]),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.reason).toBe("first");
    expect(r.suggestedKg).toBe(60);
  });

  it("미완료 세션만 있으면 첫 세션 취급", () => {
    const history = [
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 12))], {
        completed: false,
      }),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.reason).toBe("first");
  });
});

// ─────────────────────────────────────────────────────────────
// 증량(bump)
// ─────────────────────────────────────────────────────────────

describe("증량(bump)", () => {
  it("상체: 전 4세트 12회 → +2.5", () => {
    const history = [
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 12))]),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.suggestedKg).toBe(62.5);
    expect(r.isBump).toBe(true);
    expect(r.reason).toBe("bump");
    expect(r.incrementKg).toBe(2.5);
  });

  it("스쿼트: 전 7세트 12회 → +5", () => {
    const history = [
      makeSession([makeLog("squat", 80, makeSets(7, 80, 12))], {
        programId: "lower",
        templateId: "squat",
      }),
    ];
    const r = suggestedWeight(squatDef, history);
    expect(r.suggestedKg).toBe(85);
    expect(r.isBump).toBe(true);
    expect(r.reason).toBe("bump");
    expect(r.incrementKg).toBe(5);
  });

  it("12회 초과(13,14…)도 증량", () => {
    const history = [
      makeSession([makeLog("bench_press", 60, makeSetsWithReps(60, [13, 12, 14, 12]))]),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.suggestedKg).toBe(62.5);
    expect(r.reason).toBe("bump");
  });

  it("plannedWeightKg 없으면 세트 최대 무게를 base 로", () => {
    const history = [
      makeSession([makeLog("bench_press", null, makeSetsWithReps(62.5, [12, 12, 12, 12]))]),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.suggestedKg).toBe(65); // 62.5(최대) + 2.5
    expect(r.reason).toBe("bump");
  });

  it("increment 0(풀업 allowsAddedWeight) 전 세트 달성 시 실무게 변화 없음 → reason 은 hold, isBump=false", () => {
    // 풀업은 allowsAddedWeight 라 무게 추적 대상이지만 증가폭이 0이므로
    // 전 세트 목표를 달성해도 실제 증량이 없다. reason 이 'bump' 가 아니어야
    // (isBump 와 모순되지 않아) UI 가 거짓 증량 신호를 띄우지 않는다.
    const history = [
      makeSession([
        makeLog("pullup", 5, makeSets(4, 5, 12), "bodyweight"),
      ]),
    ];
    const r = suggestedWeight(pullupDef, history);
    expect(r.isBump).toBe(false);
    expect(r.reason).toBe("hold");
    expect(r.suggestedKg).toBe(5); // base(+0) 그대로
    expect(r.incrementKg).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 홀드(hold)
// ─────────────────────────────────────────────────────────────

describe("홀드(hold)", () => {
  it("한 세트라도 11회면 hold(같은 무게)", () => {
    const history = [
      makeSession([makeLog("bench_press", 60, makeSetsWithReps(60, [12, 12, 11, 12]))]),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.suggestedKg).toBe(60);
    expect(r.isBump).toBe(false);
    expect(r.reason).toBe("hold");
    expect(r.incrementKg).toBe(0);
  });

  it("스쿼트 7세트 중 마지막만 미달 → hold", () => {
    const history = [
      makeSession([makeLog("squat", 80, makeSetsWithReps(80, [12, 12, 12, 12, 12, 12, 10]))], {
        programId: "lower",
        templateId: "squat",
      }),
    ];
    const r = suggestedWeight(squatDef, history);
    expect(r.suggestedKg).toBe(80);
    expect(r.reason).toBe("hold");
  });

  it("전 세트 미달이면 hold", () => {
    const history = [
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 8))]),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.suggestedKg).toBe(60);
    expect(r.reason).toBe("hold");
  });
});

// ─────────────────────────────────────────────────────────────
// 빈 세트 방어
// ─────────────────────────────────────────────────────────────

describe("빈 세트 방어", () => {
  it("세트가 하나도 없으면 증량하지 않고 hold", () => {
    const history = [
      makeSession([makeLog("bench_press", 60, [])]),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.reason).toBe("hold");
    expect(r.isBump).toBe(false);
    expect(r.suggestedKg).toBe(60); // plannedWeightKg 를 base 로 존중
  });

  it("세트도 planned 도 없으면 base null → hold null", () => {
    const history = [
      makeSession([makeLog("bench_press", null, [])]),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.reason).toBe("hold");
    expect(r.suggestedKg).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// 마지막 완료 세션 선택
// ─────────────────────────────────────────────────────────────

describe("마지막 완료 세션 선택", () => {
  it("가장 최근 완료 세션 기준(날짜 오름차순 뒤에서)", () => {
    const history = [
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 12))], {
        localDate: "2026-06-01",
      }),
      // 최신 세션은 미달 → hold 여야 함
      makeSession([makeLog("bench_press", 62.5, makeSets(4, 62.5, 10))], {
        localDate: "2026-06-05",
      }),
    ];
    const r = suggestedWeight(benchDef, history);
    expect(r.reason).toBe("hold");
    expect(r.suggestedKg).toBe(62.5);
  });

  it("배열 순서가 뒤섞여도 localDate 최신을 사용", () => {
    const history = [
      makeSession([makeLog("bench_press", 65, makeSets(4, 65, 12))], {
        localDate: "2026-06-10",
      }),
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 8))], {
        localDate: "2026-06-01",
      }),
    ];
    const r = suggestedWeight(benchDef, history);
    // 최신(06-10)은 전 세트 12 → bump
    expect(r.reason).toBe("bump");
    expect(r.suggestedKg).toBe(67.5);
  });

  it("최신 미완료 세션은 무시하고 이전 완료 세션 사용", () => {
    const history = [
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 12))], {
        localDate: "2026-06-01",
      }),
      makeSession([makeLog("bench_press", 62.5, makeSets(4, 62.5, 5))], {
        localDate: "2026-06-05",
        completed: false,
      }),
    ];
    const r = suggestedWeight(benchDef, history);
    // 완료된 06-01(전 세트 12) 기준 → bump
    expect(r.reason).toBe("bump");
    expect(r.suggestedKg).toBe(62.5);
  });
});

// ─────────────────────────────────────────────────────────────
// weightState(manual/deload/auto)
// ─────────────────────────────────────────────────────────────

describe("weightState", () => {
  it("currentTargetKg 를 base 로 우선 사용(증량)", () => {
    const ws: ExerciseWeightState = {
      currentTargetKg: 70,
      source: "auto_bump",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const history = [
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 12))]),
    ];
    const r = suggestedWeight(benchDef, history, ws);
    expect(r.suggestedKg).toBe(72.5); // 70(state) + 2.5, planned 60 무시
    expect(r.reason).toBe("bump");
  });

  it("manual: hold 시 reason=manual 유지, base 는 state 존중", () => {
    const ws: ExerciseWeightState = {
      currentTargetKg: 55,
      source: "manual",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const history = [
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 10))]),
    ];
    const r = suggestedWeight(benchDef, history, ws);
    expect(r.suggestedKg).toBe(55);
    expect(r.reason).toBe("manual");
    expect(r.isBump).toBe(false);
  });

  it("deload: hold 시 reason=deload 유지", () => {
    const ws: ExerciseWeightState = {
      currentTargetKg: 50,
      source: "deload",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const history = [
      makeSession([makeLog("bench_press", 60, makeSets(4, 60, 9))]),
    ];
    const r = suggestedWeight(benchDef, history, ws);
    expect(r.suggestedKg).toBe(50);
    expect(r.reason).toBe("deload");
  });

  it("manual 이라도 전 세트 12회면 규칙대로 bump(reason=bump)", () => {
    const ws: ExerciseWeightState = {
      currentTargetKg: 55,
      source: "manual",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const history = [
      makeSession([makeLog("bench_press", 55, makeSets(4, 55, 12))]),
    ];
    const r = suggestedWeight(benchDef, history, ws);
    expect(r.suggestedKg).toBe(57.5);
    expect(r.reason).toBe("bump");
    expect(r.isBump).toBe(true);
  });
});
