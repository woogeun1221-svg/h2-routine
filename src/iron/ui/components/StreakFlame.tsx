/**
 * StreakFlame — 🔥 N주 연속 + 이번 주 진행 점 링(N/goal).
 *
 * WeeklyStreak(도메인 streak.ts 결과)를 그대로 받아 표시한다.
 * current 가 0 이면 불꽃을 뮤트 처리한다. .streak / .streak-* 토큰 사용.
 */
import type { WeeklyStreak } from "../../domain/types.js";

/** StreakFlame props. */
export interface StreakFlameProps {
  /** 주간 스트릭 요약. */
  streak: WeeklyStreak;
  /** 이번 주 진행 점 링 표시 여부. 기본 true. */
  showDots?: boolean;
}

/** 🔥 주간 스트릭 표시. */
export function StreakFlame({
  streak,
  showDots = true,
}: StreakFlameProps): React.ReactElement {
  const { current, thisWeekCount, weeklyGoal } = streak;
  const active = current > 0;
  // 이번 주 진행: goal 만큼 점을 찍고 채운 수 = min(thisWeekCount, goal).
  const dotCount = Math.max(0, Math.floor(weeklyGoal));
  const filled = Math.min(thisWeekCount, dotCount);
  return (
    <span className="streak" title={`${current}주 연속`}>
      <span
        className="streak-flame"
        aria-hidden
        style={active ? undefined : { filter: "grayscale(1)", opacity: 0.5 }}
      >
        🔥
      </span>
      <span className="streak-count">{current}</span>
      <span className="streak-goal">주 연속</span>
      {showDots && dotCount > 0 && (
        <span
          className="streak-dots"
          aria-label={`이번 주 ${thisWeekCount}/${weeklyGoal}`}
        >
          {Array.from({ length: dotCount }, (_, i) => (
            <span
              key={i}
              className={`streak-dot${i < filled ? " filled" : ""}`}
            />
          ))}
        </span>
      )}
    </span>
  );
}
