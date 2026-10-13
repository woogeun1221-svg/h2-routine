/**
 * Header — sticky 상단 헤더.
 *
 * 구성(styles.css .header / .header-row):
 *  좌: ProgramTabs [ 상체 | 하체 ]
 *  우: 오프라인 배지(navigator.onLine=false 일 때만) · 🔥 주간 스트릭 · 오늘 Day 칩
 *
 * 스트릭은 StreakFlame 상당의 인라인 마크업(.streak / .streak-dot)으로 렌더한다
 * — 헤더 자족성을 위해 외부 컴포넌트 의존 없이 WeeklyStreak 만 받는다.
 * 오프라인 상태는 online/offline 이벤트를 useSyncExternalStore 로 구독(SSR 안전).
 */

import { useSyncExternalStore } from "react";
import { Settings } from "lucide-react";
import type { Program, ProgramId, WeeklyStreak } from "../../domain/types.js";
import { ProgramTabs } from "./ProgramTabs.js";

/** Header props — 최소·명시적. */
export interface HeaderProps {
  /** 상체/하체 프로그램 정의(ProgramTabs 라벨용). */
  programs: Program[];
  /** 현재 활성 프로그램. */
  program: ProgramId;
  /** 활성 프로그램 전환. */
  onSelectProgram: (id: ProgramId) => void;
  /** 주간 스트릭 요약(🔥 + 이번 주 N/goal 링). */
  streak: WeeklyStreak;
  /** 오늘 할 차례 Day 칩(예: shortLabel="D1", lap=3). 없으면 칩 생략. */
  day?: { shortLabel: string; lap: number } | null;
  /** 설정 화면 진입(헤더 우측 톱니). 없으면 버튼 생략. */
  onOpenSettings?: () => void;
}

/** navigator.onLine 을 online/offline 이벤트로 구독. */
function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** 현재 온라인 여부(브라우저). SSR/프리렌더에선 true 로 간주. */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * 🔥 주간 스트릭 인라인 렌더.
 * 연속 주 수 + 이번 주 진행 점(N/goal). goal 은 방어적으로 최소 1로 클램프.
 */
function StreakInline({ streak }: { streak: WeeklyStreak }): React.ReactElement {
  const goal = Math.max(1, Math.floor(streak.weeklyGoal));
  const filled = Math.min(goal, Math.max(0, Math.floor(streak.thisWeekCount)));
  const dots = Array.from({ length: goal }, (_, i) => i < filled);
  return (
    <div className="streak" aria-label={`주간 스트릭 ${streak.current}주 연속`}>
      <span className="streak-flame" aria-hidden>
        🔥
      </span>
      <span className="streak-count">{streak.current}</span>
      <span className="streak-dots" aria-hidden>
        {dots.map((on, i) => (
          <span
            key={i}
            className={on ? "streak-dot filled" : "streak-dot"}
          />
        ))}
      </span>
      <span className="streak-goal">
        {filled}/{goal}
      </span>
    </div>
  );
}

/** sticky 헤더: ProgramTabs + 스트릭 + Day 칩 + 오프라인 배지. */
export function Header({
  programs,
  program,
  onSelectProgram,
  streak,
  day,
  onOpenSettings,
}: HeaderProps): React.ReactElement {
  const online = useOnline();

  return (
    <header className="header">
      <div className="header-row">
        <ProgramTabs
          programs={programs}
          active={program}
          onSelect={onSelectProgram}
        />
        <div className="row">
          {!online && (
            <span className="offline-badge" role="status">
              오프라인
            </span>
          )}
          <StreakInline streak={streak} />
          {day != null && (
            <span className="day-chip">
              {day.shortLabel}
              <span className="day-lap">·{day.lap}</span>
            </span>
          )}
          {onOpenSettings != null && (
            <button
              type="button"
              className="btn ghost"
              aria-label="설정"
              onClick={onOpenSettings}
              style={{ minHeight: 36, minWidth: 36, padding: 6 }}
            >
              <Settings size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
