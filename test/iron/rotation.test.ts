/**
 * rotation.ts 단위 테스트 (단일 상체 세션 모델).
 *
 * 검증 포인트:
 * - upper 는 단일 "upper" 세션(rotation 길이 1) → 항상 "upper"
 * - 완료 기록 없으면 rotation[0], lap 0
 * - N 회 완료 → lap N (rotation 길이 1 이므로 floor(N/1) = N)
 * - 진행 중(completedAt null) 세션은 무시
 * - 다른 프로그램(lower) 세션은 upper 판정에 영향 없음
 * - lower 도 항상 lower_day 고정
 * - 완료 시각 정렬(입력 순서 무관)
 */

import { describe, expect, it } from "vitest";
import { nextWorkout } from "../../src/iron/domain/rotation.js";
import { PRESET_PROGRAMS, PRESET_TEMPLATES } from "../../src/iron/domain/presets.js";
import type {
  ProgramId,
  SessionTemplateId,
  WorkoutSession,
} from "../../src/iron/domain/types.js";

/**
 * 완료된(또는 진행 중인) 세션 하나를 생성하는 헬퍼.
 * completedAt 을 명시하면 정렬 키로 쓰이고, null 이면 진행 중으로 취급된다.
 */
function makeSession(
  programId: ProgramId,
  templateId: SessionTemplateId,
  completedAt: string | null,
): WorkoutSession {
  return {
    id: `${templateId}-${completedAt ?? "inprogress"}-${Math.random()}`,
    programId,
    templateId,
    localDate: (completedAt ?? "2026-01-01").slice(0, 10),
    startedAt: completedAt ?? "2026-01-01T00:00:00.000Z",
    completedAt,
    exercises: [],
  };
}

describe("nextWorkout — upper 단일 세션", () => {
  it("완료 기록 없으면 rotation[0](upper), lap 0", () => {
    const { template, lap } = nextWorkout(
      PRESET_PROGRAMS.upper,
      PRESET_TEMPLATES,
      [],
    );
    expect(template.id).toBe("upper");
    expect(lap).toBe(0);
  });

  it("upper 1회 완료 후에도 다음은 여전히 upper (lap 1)", () => {
    const sessions = [
      makeSession("upper", "upper", "2026-01-01T10:00:00.000Z"),
    ];
    const { template, lap } = nextWorkout(
      PRESET_PROGRAMS.upper,
      PRESET_TEMPLATES,
      sessions,
    );
    expect(template.id).toBe("upper");
    expect(lap).toBe(1); // floor(1/1)
  });

  it("upper N회 완료 → 다음은 upper, lap N", () => {
    const sessions = [
      makeSession("upper", "upper", "2026-01-01T10:00:00.000Z"),
      makeSession("upper", "upper", "2026-01-03T10:00:00.000Z"),
      makeSession("upper", "upper", "2026-01-05T10:00:00.000Z"),
    ];
    const { template, lap } = nextWorkout(
      PRESET_PROGRAMS.upper,
      PRESET_TEMPLATES,
      sessions,
    );
    expect(template.id).toBe("upper");
    expect(lap).toBe(3); // floor(3/1)
  });

  it("입력 순서가 뒤섞여도 완료 시각 정렬 후 upper 로 귀결", () => {
    const sessions = [
      makeSession("upper", "upper", "2026-01-03T10:00:00.000Z"),
      makeSession("upper", "upper", "2026-01-01T10:00:00.000Z"),
    ];
    const { template, lap } = nextWorkout(
      PRESET_PROGRAMS.upper,
      PRESET_TEMPLATES,
      sessions,
    );
    expect(template.id).toBe("upper");
    expect(lap).toBe(2); // floor(2/1)
  });
});

describe("nextWorkout — 진행 중/타 프로그램 제외", () => {
  it("진행 중(completedAt null) 세션은 완료 수(lap)에서 제외한다", () => {
    const sessions = [
      makeSession("upper", "upper", "2026-01-01T10:00:00.000Z"),
      // 두 번째는 시작만 하고 미완료 → 완료 카운트에서 제외.
      makeSession("upper", "upper", null),
    ];
    const { template, lap } = nextWorkout(
      PRESET_PROGRAMS.upper,
      PRESET_TEMPLATES,
      sessions,
    );
    expect(template.id).toBe("upper");
    expect(lap).toBe(1); // 완료는 1건뿐 → floor(1/1)
  });

  it("다른 프로그램(lower) 세션은 upper 판정에 영향 없음", () => {
    const sessions = [
      makeSession("upper", "upper", "2026-01-01T10:00:00.000Z"),
      makeSession("lower", "lower_day", "2026-01-05T10:00:00.000Z"),
      makeSession("lower", "lower_day", "2026-01-06T10:00:00.000Z"),
    ];
    const { template, lap } = nextWorkout(
      PRESET_PROGRAMS.upper,
      PRESET_TEMPLATES,
      sessions,
    );
    expect(template.id).toBe("upper");
    expect(lap).toBe(1); // upper 완료 1건만 카운트
  });
});

describe("nextWorkout — lower 고정", () => {
  it("완료 기록 없어도 lower_day", () => {
    const { template, lap } = nextWorkout(
      PRESET_PROGRAMS.lower,
      PRESET_TEMPLATES,
      [],
    );
    expect(template.id).toBe("lower_day");
    expect(lap).toBe(0);
  });

  it("여러 번 완료해도 항상 lower_day, lap 은 완료 수와 동일(rotation 길이 1)", () => {
    const sessions = [
      makeSession("lower", "lower_day", "2026-01-01T10:00:00.000Z"),
      makeSession("lower", "lower_day", "2026-01-03T10:00:00.000Z"),
      makeSession("lower", "lower_day", "2026-01-05T10:00:00.000Z"),
    ];
    const { template, lap } = nextWorkout(
      PRESET_PROGRAMS.lower,
      PRESET_TEMPLATES,
      sessions,
    );
    expect(template.id).toBe("lower_day");
    expect(lap).toBe(3); // floor(3/1)
  });
});
