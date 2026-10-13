/**
 * CalendarScreen — 월 그리드 히트맵 + 주간 스트릭 요약.
 *
 * 정보 구조(설계 확정):
 *  - 상단: 주간 스트릭 카드 = current/longest "운동한 주" + 이번 주 N/goal 진행 링.
 *  - 하단: 월 그리드 히트맵. 운동한 날은 up-red 강도(세션 수)로 채운다. 월 이동(◀ ▶).
 *
 * 데이터:
 *  - useProgram(programId).sessions → 이 프로그램 세션만(localDate 오름차순).
 *  - calendarAggregation → Map<localDate, CalendarCell{sessionCount, programIds}>.
 *  - computeWeeklyStreak → WeeklyStreak(연속 활동 주 + 이번 주 진행).
 *
 * 날짜 계산은 전부 "YYYY-MM-DD" 문자열/정수 산술(dateUtil)로만 → 타임존 드리프트 없음.
 * 주 시작 = 월요일(앱 전역 ISO-8601 주 규칙과 일치).
 */

import { useMemo, useState } from "react";
import type { ProgramId, CalendarCell } from "../../domain/types.js";
import { calendarAggregation, computeWeeklyStreak } from "../../domain/streak.js";
import { addDays, todayLocal } from "../../domain/dateUtil.js";
import { useProgram } from "../app/useProgram.js";
import { useStore } from "../useStore.js";
import { Card } from "../components/index.js";

/** 요일 헤더(월요일 시작 — 앱 전역 ISO 주 규칙). */
const DOW_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

/** 한국어 월 이름(0-indexed). */
const MONTH_KR = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
] as const;

/** CalendarScreen props. */
export interface CalendarScreenProps {
  /** 표시할 프로그램(상체/하체). 히트맵·스트릭은 이 프로그램 세션 기준. */
  programId: ProgramId;
}

/** "YYYY-MM-DD" 를 정수 파트로. 형식 불량이면 null. */
function ymd(iso: string): { y: number; m: number; d: number } | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!mt) return null;
  return { y: Number(mt[1]), m: Number(mt[2]), d: Number(mt[3]) };
}

/** 2자리 0-패딩. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * "YYYY-MM-DD" 의 ISO 요일(1=월 … 7=일).
 * UTC 앵커로 계산해 로컬 타임존 영향 배제(dateUtil 과 동일 원칙).
 */
function isoDow(iso: string): number {
  const p = ymd(iso);
  if (!p) return 1;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** 세션 수 → 히트맵 강도 클래스(0=빈칸, 1 / 2 / 3+). */
function heatClass(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "lv1";
  if (count === 2) return "lv2";
  return "lv3";
}

/**
 * 특정 월(anchorYear/anchorMonth0)의 그리드에 들어갈 날짜 리스트.
 * 월요일 시작 주 단위로 앞뒤를 패딩해 7×N 완전한 격자를 만든다.
 * 각 원소: {iso, inMonth}(inMonth=false 는 이웃 달 흐린 표시용).
 */
function buildMonthGrid(
  anchorYear: number,
  anchorMonth0: number
): Array<{ iso: string; inMonth: boolean }> {
  const firstIso = `${anchorYear}-${pad2(anchorMonth0 + 1)}-01`;
  // 그 달 1일이 속한 주의 월요일까지 뒤로.
  const gridStart = addDays(firstIso, -(isoDow(firstIso) - 1));

  // 다음 달 1일 = 이번 달 길이 계산용.
  const nextMonthFirst =
    anchorMonth0 === 11
      ? `${anchorYear + 1}-01-01`
      : `${anchorYear}-${pad2(anchorMonth0 + 2)}-01`;
  // 이번 달 마지막 날 = 다음 달 1일 - 1.
  const lastIso = addDays(nextMonthFirst, -1);
  // 마지막 날이 속한 주의 일요일까지 앞으로.
  const gridEnd = addDays(lastIso, 7 - isoDow(lastIso));

  const cells: Array<{ iso: string; inMonth: boolean }> = [];
  let cursor = gridStart;
  // 무한 방지: 6주 × 7 = 42칸이 최대(가드는 넉넉히 50).
  let guard = 0;
  while (cursor <= gridEnd && guard < 50) {
    const p = ymd(cursor);
    const inMonth = p != null && p.y === anchorYear && p.m === anchorMonth0 + 1;
    cells.push({ iso: cursor, inMonth });
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return cells;
}

/**
 * 캘린더 화면.
 * 월 그리드 히트맵(운동한 날 up-red 강도) + 주간 스트릭 + 이번주 N/goal 진행 링.
 */
export function CalendarScreen({
  programId,
}: CalendarScreenProps): React.ReactElement {
  const { sessions } = useProgram(programId);
  const settings = useStore().settings;
  const today = todayLocal();

  // 이번 달을 앵커로 시작(연/월0). 월 이동은 아래 nav 로 정수 조정.
  const todayParts = ymd(today) ?? { y: 2026, m: 1, d: 1 };
  const [view, setView] = useState<{ year: number; month0: number }>({
    year: todayParts.y,
    month0: todayParts.m - 1,
  });

  // 날짜별 집계(프로그램 세션 기준)와 스트릭.
  const aggregation = useMemo<Map<string, CalendarCell>>(
    () => calendarAggregation(sessions),
    [sessions]
  );
  const streak = useMemo(
    () => computeWeeklyStreak(sessions, today, settings.weeklyGoal),
    [sessions, today, settings.weeklyGoal]
  );

  const grid = useMemo(
    () => buildMonthGrid(view.year, view.month0),
    [view.year, view.month0]
  );

  // 이 달에 실제로 운동한 날 수(월 요약).
  const activeDaysThisMonth = useMemo(() => {
    let n = 0;
    for (const cell of grid) {
      if (cell.inMonth && (aggregation.get(cell.iso)?.sessionCount ?? 0) > 0) {
        n += 1;
      }
    }
    return n;
  }, [grid, aggregation]);

  /** 월 이동(delta 개월). 12월↔1월 경계는 정수 산술로 정규화. */
  function shiftMonth(delta: number): void {
    setView((prev) => {
      const total = prev.year * 12 + prev.month0 + delta;
      return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
    });
  }

  /** 이번 달(오늘 포함 월)로 복귀. */
  function goThisMonth(): void {
    setView({ year: todayParts.y, month0: todayParts.m - 1 });
  }

  const isThisMonth =
    view.year === todayParts.y && view.month0 === todayParts.m - 1;

  // 이번 주 진행 링(N/goal): StreakFlame 과 동일 규칙 — 채운 수 = min(count, goal).
  const goalDots = Math.max(0, Math.floor(streak.weeklyGoal));
  const filledDots = Math.min(streak.thisWeekCount, goalDots);

  return (
    <>
      {/* ── 주간 스트릭 요약 ── */}
      <Card title="🔥 주간 스트릭" accessory="연속 운동한 주">
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div>
            <span className="stat-value up">{streak.current}</span>
            <span className="stat-unit">주 연속</span>
          </div>
          <div className="stat-note" style={{ textAlign: "right" }}>
            최장 <span className="num gold">{streak.longest}</span>주
          </div>
        </div>

        <hr className="hr" />

        {/* 이번 주 N/goal 진행 링 */}
        <div className="row between">
          <span className="stat-label">이번 주 목표</span>
          <span className="num">
            {streak.thisWeekCount}
            <span className="dim"> / {streak.weeklyGoal}</span>
          </span>
        </div>
        {goalDots > 0 && (
          <div
            className="streak-dots"
            style={{ marginTop: 8 }}
            aria-label={`이번 주 ${streak.thisWeekCount}/${streak.weeklyGoal}`}
          >
            {Array.from({ length: goalDots }, (_, i) => (
              <span
                key={i}
                className={`streak-dot${i < filledDots ? " filled" : ""}`}
              />
            ))}
          </div>
        )}
      </Card>

      {/* ── 월 그리드 히트맵 ── */}
      <Card>
        {/* 월 네비게이션 */}
        <div className="row between" style={{ marginBottom: 10 }}>
          <button
            className="btn ghost"
            style={{ minHeight: 36, padding: "6px 12px" }}
            onClick={() => shiftMonth(-1)}
            aria-label="이전 달"
          >
            ◀
          </button>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              <span className="num">{view.year}</span> {MONTH_KR[view.month0]}
            </span>
            {!isThisMonth && (
              <button
                className="btn ghost"
                style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                onClick={goThisMonth}
              >
                오늘
              </button>
            )}
          </div>
          <button
            className="btn ghost"
            style={{ minHeight: 36, padding: "6px 12px" }}
            onClick={() => shiftMonth(1)}
            aria-label="다음 달"
          >
            ▶
          </button>
        </div>

        {/* 요일 헤더(월~일) */}
        <div className="calendar-grid" style={{ marginBottom: 4 }}>
          {DOW_LABELS.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 격자 */}
        <div className="calendar-grid">
          {grid.map((cell) => {
            const p = ymd(cell.iso);
            const dayNum = p ? p.d : 0;
            const count = aggregation.get(cell.iso)?.sessionCount ?? 0;
            const classes = ["cal-cell"];
            if (cell.inMonth) classes.push(heatClass(count));
            if (cell.iso === today) classes.push("today");
            const title =
              count > 0
                ? `${cell.iso} · ${count}세션`
                : cell.iso;
            return (
              <div
                key={cell.iso}
                className={classes.join(" ")}
                style={cell.inMonth ? undefined : { opacity: 0.28 }}
                title={title}
              >
                {dayNum}
              </div>
            );
          })}
        </div>

        {/* 월 요약 + 범례 */}
        <div
          className="row between"
          style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}
        >
          <span className="stat-note">
            이 달 운동 <span className="num up">{activeDaysThisMonth}</span>일
          </span>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <span className="stat-note">적음</span>
            <span
              className="cal-cell lv1"
              style={{ width: 14, height: 14, aspectRatio: "auto" }}
            />
            <span
              className="cal-cell lv2"
              style={{ width: 14, height: 14, aspectRatio: "auto" }}
            />
            <span
              className="cal-cell lv3"
              style={{ width: 14, height: 14, aspectRatio: "auto" }}
            />
            <span className="stat-note">많음</span>
          </div>
        </div>
      </Card>
    </>
  );
}
