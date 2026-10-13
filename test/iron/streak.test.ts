import { describe, it, expect } from "vitest";
import {
  computeWeeklyStreak,
  calendarAggregation,
} from "../../src/iron/domain/streak.js";
import { isoWeekKey, addDays, todayLocal, toLocalDate } from "../../src/iron/domain/dateUtil.js";
import type { WorkoutSession, ProgramId } from "../../src/iron/domain/types.js";

/** 테스트용 최소 세션 팩토리. 스트릭/캘린더는 localDate·programId 만 사용. */
function session(
  localDate: string,
  programId: ProgramId = "upper",
  id = localDate + "-" + programId
): WorkoutSession {
  return {
    id,
    programId,
    templateId: "t",
    localDate,
    startedAt: localDate + "T00:00:00.000Z",
    completedAt: localDate + "T01:00:00.000Z",
    exercises: [],
  };
}

describe("dateUtil", () => {
  it("todayLocal / toLocalDate 는 YYYY-MM-DD 형태", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 로컬 자정 앵커로 만든 Date 의 로컬 날짜는 그대로 나와야 한다.
    const d = new Date(2026, 2, 9); // 로컬 2026-03-09
    expect(toLocalDate(d)).toBe("2026-03-09");
  });

  it("addDays 는 월/연 경계와 음수를 처리", () => {
    expect(addDays("2026-01-01", 1)).toBe("2026-01-02");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // 윤년
  });

  it("addDays 는 DST 전환 주에도 하루가 밀리지 않음", () => {
    // 미국 DST 시작(2026-03-08) 전후를 넘어도 UTC 산술이라 안전.
    expect(addDays("2026-03-07", 3)).toBe("2026-03-10");
  });

  it("isoWeekKey 는 ISO-8601 월요일 시작 주", () => {
    // 2026-01-01 은 목요일 → 2026-W01.
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    // 같은 주 월요일(2025-12-29)도 2026-W01.
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01");
    // 그 주 일요일(2026-01-04)까지 동일 주.
    expect(isoWeekKey("2026-01-04")).toBe("2026-W01");
    // 다음 월요일(2026-01-05)은 W02.
    expect(isoWeekKey("2026-01-05")).toBe("2026-W02");
  });

  it("isoWeekKey week-year 경계: 2027-01-01(금)은 전해 마지막 주에 속함", () => {
    // 2027-01-01 은 금요일 → ISO 로는 2026-W53.
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-04")).toBe("2027-W01"); // 월요일
  });
});

describe("computeWeeklyStreak", () => {
  it("빈 상태", () => {
    const s = computeWeeklyStreak([], "2026-07-01");
    expect(s).toEqual({
      current: 0,
      longest: 0,
      thisWeekCount: 0,
      weeklyGoal: 3,
      lastActiveWeek: null,
    });
  });

  it("연속 3주 운동 → current=longest=3", () => {
    const today = "2026-07-01"; // 수요일
    const sessions = [
      session("2026-07-01"), // 이번 주
      session(addDays("2026-07-01", -7)), // 지난 주
      session(addDays("2026-07-01", -14)), // 2주 전
    ];
    const s = computeWeeklyStreak(sessions, today);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.thisWeekCount).toBe(1);
    expect(s.lastActiveWeek).toBe(isoWeekKey(today));
  });

  it("한 주 건너뜀 → current 는 최근 연속만, longest 는 더 긴 과거 런", () => {
    const today = "2026-07-01";
    const sessions = [
      // 이번 주 활동
      session(today),
      // 지난 주 없음(건너뜀) → current 는 1
      // 그 이전 3주 연속(2,3,4주 전)
      session(addDays(today, -14)),
      session(addDays(today, -21)),
      session(addDays(today, -28)),
    ];
    const s = computeWeeklyStreak(sessions, today);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(3);
  });

  it("이번 주는 비었지만 지난 주 활동 → 스트릭 유지(지난 주부터 카운트)", () => {
    const today = "2026-07-01";
    const sessions = [
      session(addDays(today, -7)), // 지난 주
      session(addDays(today, -14)), // 2주 전
    ];
    const s = computeWeeklyStreak(sessions, today);
    expect(s.thisWeekCount).toBe(0);
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
  });

  it("이번 주도 지난 주도 없음 → current=0, longest 는 과거 런", () => {
    const today = "2026-07-01";
    const sessions = [
      session(addDays(today, -21)),
      session(addDays(today, -28)),
    ];
    const s = computeWeeklyStreak(sessions, today);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
  });

  it("한 주에 여러 세션이어도 thisWeekCount 는 세션 수, 주 스트릭은 1주로 카운트", () => {
    const today = "2026-07-01";
    const sessions = [
      session(today, "upper"),
      session(addDays(today, 1), "lower"),
      session(addDays(today, -1), "upper"),
    ];
    // 위 세 날짜가 모두 today 의 ISO 주 안에 있는지 확인(수요일 기준 ±1일).
    const wk = isoWeekKey(today);
    expect(isoWeekKey(addDays(today, 1))).toBe(wk);
    expect(isoWeekKey(addDays(today, -1))).toBe(wk);

    const s = computeWeeklyStreak(sessions, today);
    expect(s.thisWeekCount).toBe(3);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
  });

  it("weeklyGoal 커스텀 값 반영", () => {
    const s = computeWeeklyStreak([session("2026-07-01")], "2026-07-01", 4);
    expect(s.weeklyGoal).toBe(4);
    // 0 이나 음수는 기본값으로 폴백.
    const s2 = computeWeeklyStreak([], "2026-07-01", 0);
    expect(s2.weeklyGoal).toBe(3);
  });

  it("주-연도 경계를 넘는 연속(2026-W53 → 2027-W01)", () => {
    const today = "2027-01-04"; // 2027-W01 월요일
    const sessions = [
      session("2027-01-04"), // 2027-W01
      session("2026-12-28"), // 2026-W53 (월요일)
      session("2026-12-21"), // 2026-W52
    ];
    const s = computeWeeklyStreak(sessions, today);
    expect(isoWeekKey("2026-12-28")).toBe("2026-W53");
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });
});

describe("calendarAggregation", () => {
  it("빈 상태는 빈 맵", () => {
    expect(calendarAggregation([]).size).toBe(0);
  });

  it("같은 날 여러 세션 카운트 + 프로그램 중복 제거", () => {
    const sessions = [
      session("2026-07-01", "upper"),
      session("2026-07-01", "lower", "x2"),
      session("2026-07-01", "upper", "x3"),
      session("2026-06-30", "lower"),
    ];
    const map = calendarAggregation(sessions);
    const day1 = map.get("2026-07-01");
    expect(day1?.sessionCount).toBe(3);
    expect(day1?.programIds).toEqual(["upper", "lower"]);
    const day0 = map.get("2026-06-30");
    expect(day0?.sessionCount).toBe(1);
    expect(day0?.programIds).toEqual(["lower"]);
  });
});
