/**
 * 주간 스트릭 & 캘린더 집계.
 *
 * 스트릭 정의(설계 확정): "운동한 주"가 연속이면 유지.
 * - 주 경계 = ISO-8601 주(월요일 시작), isoWeekKey 로 판정.
 * - current: 오늘 주(또는 오늘 주가 비었으면 지난 주)부터 과거로 끊기지 않고 이어진 활동 주 수.
 * - longest: 전체 기록에서 가장 긴 연속 활동 주 수.
 * - thisWeekCount: 오늘이 속한 주의 (완료 여부 무관) 세션 수.
 * - weeklyGoal: 설정 없으면 3.
 * - lastActiveWeek: 활동한 주 중 가장 최근 주 키(없으면 null).
 */

import type {
  WorkoutSession,
  WeeklyStreak,
  CalendarCell,
  ProgramId,
} from "./types.js";
import { isoWeekKey, addDays } from "./dateUtil.js";

/** weeklyGoal 미설정 시 기본값. */
const DEFAULT_WEEKLY_GOAL = 3;

/**
 * 연속 "운동한 주" 스트릭 계산.
 * @param sessions 전체 세션(프로그램 무관). localDate 기준으로 주를 판정.
 * @param today "YYYY-MM-DD" 로컬 오늘.
 * @param weeklyGoal 주간 목표(미지정 시 3).
 */
export function computeWeeklyStreak(
  sessions: WorkoutSession[],
  today: string,
  weeklyGoal: number = DEFAULT_WEEKLY_GOAL
): WeeklyStreak {
  const goal = weeklyGoal > 0 ? weeklyGoal : DEFAULT_WEEKLY_GOAL;

  // 활동한 주 키 집합 + 이번 주 세션 수.
  const activeWeeks = new Set<string>();
  const thisWeek = isoWeekKey(today);
  let thisWeekCount = 0;

  for (const s of sessions) {
    const wk = isoWeekKey(s.localDate);
    activeWeeks.add(wk);
    if (wk === thisWeek) thisWeekCount += 1;
  }

  if (activeWeeks.size === 0) {
    return {
      current: 0,
      longest: 0,
      thisWeekCount: 0,
      weeklyGoal: goal,
      lastActiveWeek: null,
    };
  }

  // lastActiveWeek: 키 문자열 정렬이 곧 시간순("YYYY-Www" 형태라 사전순=시간순).
  let lastActiveWeek: string | null = null;
  for (const wk of activeWeeks) {
    if (lastActiveWeek === null || wk > lastActiveWeek) lastActiveWeek = wk;
  }

  // current: 오늘 주부터 과거로 7일씩 물러나며 연속 활동 주를 센다.
  // 오늘 주가 비어 있으면 스트릭이 아직 안 끊긴 것으로 보고 지난 주부터 시작.
  let current = 0;
  let cursorDate = today;
  if (!activeWeeks.has(thisWeek)) {
    cursorDate = addDays(cursorDate, -7);
  }
  // 무한 방지: 활동 주 개수 이상은 셀 수 없다.
  let guard = 0;
  while (guard <= activeWeeks.size) {
    if (activeWeeks.has(isoWeekKey(cursorDate))) {
      current += 1;
      cursorDate = addDays(cursorDate, -7);
      guard += 1;
    } else {
      break;
    }
  }

  // longest: 활동 주들을 시간순으로 훑으며 "직전 주"와 연속인지 판정.
  const sortedWeeks = [...activeWeeks].sort();
  let longest = 0;
  let run = 0;
  let prevWeek: string | null = null;
  for (const wk of sortedWeeks) {
    if (prevWeek !== null && prevWeekKey(wk) === prevWeek) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prevWeek = wk;
  }

  return { current, longest, thisWeekCount, weeklyGoal: goal, lastActiveWeek };
}

/**
 * 어떤 ISO 주 키의 "직전 주" 키.
 * 주차 산술 대신 날짜(해당 주의 목요일)에서 7일 빼서 재계산 → 연말/연초 주-연도 경계 안전.
 */
function prevWeekKey(weekKey: string): string {
  return isoWeekKey(addDays(thursdayOfWeek(weekKey), -7));
}

/**
 * "YYYY-Www" → 그 ISO 주의 목요일 날짜("YYYY-MM-DD").
 * 목요일은 항상 해당 ISO week-year 안에 있으므로 안전한 앵커.
 */
function thursdayOfWeek(weekKey: string): string {
  const parts = weekKey.split("-W");
  const weekYear = Number(parts[0] ?? 0);
  const week = Number(parts[1] ?? 1);

  // 그 해 1월 4일은 정의상 항상 1주에 속한다. 그 주의 목요일을 기준점으로.
  const jan4 = `${weekYear}-01-04`;
  const jan4Dow = isoDow(jan4);
  const week1Thursday = addDays(jan4, 4 - jan4Dow);
  return addDays(week1Thursday, (week - 1) * 7);
}

/** "YYYY-MM-DD" 의 ISO 요일(1=월 … 7=일). */
function isoDow(isoDate: string): number {
  const parts = isoDate.split("-").map((s) => Number(s));
  const dow = new Date(
    Date.UTC(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1)
  ).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/**
 * 날짜별 캘린더 히트맵 셀 집계.
 * @returns Map<localDate, CalendarCell{localDate, sessionCount, programIds}>
 *   programIds 는 그 날 등장한 프로그램(중복 제거, 등장 순서 유지).
 */
export function calendarAggregation(
  sessions: WorkoutSession[]
): Map<string, CalendarCell> {
  const map = new Map<string, CalendarCell>();
  for (const s of sessions) {
    const existing = map.get(s.localDate);
    if (existing) {
      existing.sessionCount += 1;
      if (!existing.programIds.includes(s.programId)) {
        existing.programIds.push(s.programId);
      }
    } else {
      map.set(s.localDate, {
        localDate: s.localDate,
        sessionCount: 1,
        programIds: [s.programId as ProgramId],
      });
    }
  }
  return map;
}
