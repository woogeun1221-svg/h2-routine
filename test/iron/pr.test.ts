import { describe, expect, it } from "vitest";
import { detectPRs, prsInSession } from "../../src/iron/domain/pr.js";
import type { ExerciseKind, SetLog, WorkoutSession } from "../../src/iron/domain/types.js";

/** 세트 하나 생성 헬퍼. */
function set(setIndex: number, weightKg: number | null, reps: number): SetLog {
  return { setIndex, weightKg, reps, completedAt: "" };
}

/**
 * 완료 세션 하나 생성 헬퍼(운동 하나만 담음).
 * completedAt 은 정렬 기준이므로 iso 순서가 곧 시간순.
 */
function session(
  id: string,
  completedAt: string,
  exerciseId: string,
  kind: ExerciseKind,
  sets: SetLog[],
): WorkoutSession {
  return {
    id,
    programId: "upper",
    templateId: "upper",
    localDate: completedAt.slice(0, 10),
    startedAt: completedAt,
    completedAt,
    exercises: [
      { exerciseId, kindAtLog: kind, plannedWeightKg: null, sets },
    ],
  };
}

describe("pr — 무게 PR 갱신", () => {
  it("무게가 초과할 때만 weight PR, 동점은 PR 아님", () => {
    const history: WorkoutSession[] = [
      session("s1", "2026-01-01T10:00:00Z", "bench_press", "weighted", [
        set(0, 60, 10),
      ]),
      // 같은 무게 → weight PR 아님(동점).
      session("s2", "2026-01-02T10:00:00Z", "bench_press", "weighted", [
        set(0, 60, 10),
      ]),
      // 초과 → weight PR.
      session("s3", "2026-01-03T10:00:00Z", "bench_press", "weighted", [
        set(0, 62.5, 8),
      ]),
    ];
    const weightPRs = detectPRs(history).filter((p) => p.kind === "weight");
    expect(weightPRs.map((p) => [p.sessionId, p.value])).toEqual([
      ["s1", 60],
      ["s3", 62.5],
    ]);
  });
});

describe("pr — 자체중량은 reps PR만", () => {
  it("bodyweight 는 weight/e1rm/volume PR 없이 reps PR만", () => {
    const history: WorkoutSession[] = [
      session("s1", "2026-01-01T10:00:00Z", "pullup", "bodyweight", [
        set(0, null, 8),
      ]),
      session("s2", "2026-01-02T10:00:00Z", "pullup", "bodyweight", [
        set(0, null, 12),
      ]),
    ];
    const prs = detectPRs(history);
    expect(prs.every((p) => p.kind === "reps")).toBe(true);
    expect(prs.map((p) => [p.sessionId, p.value])).toEqual([
      ["s1", 8],
      ["s2", 12],
    ]);
  });
});

describe("pr — e1rm PR", () => {
  it("같은 톱무게라도 reps가 늘면 e1rm PR", () => {
    // Epley: 60*(1+8/30)=76, 60*(1+10/30)=80 → 두 번째가 e1rm 신고가.
    const history: WorkoutSession[] = [
      session("s1", "2026-01-01T10:00:00Z", "bench_press", "weighted", [
        set(0, 60, 8),
      ]),
      session("s2", "2026-01-02T10:00:00Z", "bench_press", "weighted", [
        set(0, 60, 10),
      ]),
    ];
    const e1rmPRs = detectPRs(history).filter((p) => p.kind === "e1rm");
    // 첫 세션은 e1rm 최초 확립, 둘째는 초과.
    expect(e1rmPRs.map((p) => p.sessionId)).toEqual(["s1", "s2"]);
    // weight PR 은 첫 세션만(동점 60).
    const weightPRs = detectPRs(history).filter((p) => p.kind === "weight");
    expect(weightPRs.map((p) => p.sessionId)).toEqual(["s1"]);
  });
});

describe("pr — 동점은 PR 아님 (전 지표)", () => {
  it("완전 동일 반복 세션은 첫 세션만 PR", () => {
    const mk = (id: string, t: string) =>
      session(id, t, "row", "weighted", [set(0, 50, 12), set(1, 50, 12)]);
    const history = [
      mk("s1", "2026-01-01T10:00:00Z"),
      mk("s2", "2026-01-02T10:00:00Z"),
    ];
    const prs = detectPRs(history);
    // 첫 세션에서 weight/reps/e1rm/volume 4종 확립, 둘째는 전부 동점.
    expect(prs.every((p) => p.sessionId === "s1")).toBe(true);
    expect(new Set(prs.map((p) => p.kind))).toEqual(
      new Set(["weight", "reps", "e1rm", "volume"]),
    );
  });
});

describe("pr — volume PR", () => {
  it("세션 kg-볼륨이 늘면 volume PR", () => {
    const history: WorkoutSession[] = [
      // 볼륨 60*10=600.
      session("s1", "2026-01-01T10:00:00Z", "bench_press", "weighted", [
        set(0, 60, 10),
      ]),
      // 볼륨 60*10 + 60*10 = 1200 → volume PR(무게/reps 동점이라도).
      session("s2", "2026-01-02T10:00:00Z", "bench_press", "weighted", [
        set(0, 60, 10),
        set(1, 60, 10),
      ]),
    ];
    const volPRs = detectPRs(history).filter((p) => p.kind === "volume");
    expect(volPRs.map((p) => [p.sessionId, p.value])).toEqual([
      ["s1", 600],
      ["s2", 1200],
    ]);
  });
});

describe("pr — prsInSession", () => {
  it("해당 세션에서 새로 세운 PR만 반환", () => {
    const history: WorkoutSession[] = [
      session("s1", "2026-01-01T10:00:00Z", "bench_press", "weighted", [
        set(0, 60, 10),
      ]),
      session("s2", "2026-01-02T10:00:00Z", "bench_press", "weighted", [
        set(0, 65, 10),
      ]),
    ];
    const s2prs = prsInSession(history, "s2");
    // s2 에서 weight/e1rm/volume 신고가(reps 는 동점 10이라 제외).
    expect(s2prs.every((p) => p.sessionId === "s2")).toBe(true);
    expect(new Set(s2prs.map((p) => p.kind))).toEqual(
      new Set(["weight", "e1rm", "volume"]),
    );
  });

  it("진행 중(completedAt null) 세션은 PR 스캔에서 제외", () => {
    const history: WorkoutSession[] = [
      session("s1", "2026-01-01T10:00:00Z", "bench_press", "weighted", [
        set(0, 60, 10),
      ]),
      {
        ...session("s2", "2026-01-02T10:00:00Z", "bench_press", "weighted", [
          set(0, 100, 10),
        ]),
        completedAt: null,
      },
    ];
    expect(prsInSession(history, "s2")).toEqual([]);
  });
});
