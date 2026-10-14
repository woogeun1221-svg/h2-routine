/**
 * DashboardScreen — 홈(대시보드).
 *
 * buildDashboard(store, programId, today) 로 요약을 만들어 카드 순서대로 렌더한다:
 *   1. TodayCard        — 오늘 할 Day + 종목 목록 + "기록 시작 ▶"(navigate("input"))
 *   2. HeroTicker       — 메인 리프트별 현재 무게 + 지난 세션 대비 ▲델타 + e1RM 서브값
 *   3. MiniProgressChart— 메인 리프트 최근 ~8세션 압축 ProgressChart(탭 → 차트 화면)
 *   4. NextTargetBanner — 대표 메인 리프트의 증량/유지 신호(목표 달성 카피)
 *   5. LastSessionCard  — 지난 세션 세트 무게×횟수 칩 + 볼륨 + 이번 세션 PR 배지
 *
 * 완료 세션이 하나도 없으면 EmptyState("첫 무게").
 *
 * 데이터 소스: useStore() 로 RootStore 스냅샷을 구독하고, 도메인 조립은 buildDashboard 에
 * 위임한다(규칙 중복 구현 금지). 차트/PR 등 화면 전용 shape 만 여기서 만든다.
 */

import { useMemo } from "react";
import { Play, TrendingUp } from "lucide-react";
import type {
  ExerciseDef,
  ExerciseId,
  PRRecord,
  ProgramId,
  WorkoutSession,
} from "../../domain/types.js";
import { buildDashboard } from "../../domain/dashboard.js";
import { detectPRs } from "../../domain/pr.js";
import { useStore } from "../useStore.js";
import type { Route } from "../app/routes.js";
import {
  Badge,
  Card,
  DayChip,
  EmptyState,
  NextTargetBanner,
  StatTile,
  Ticker,
} from "../components/index.js";
import { ProgressChart, type ProgressPoint } from "../charts/ProgressChart.js";
import { fmtKg, fmtReps, fmtSetChip, fmtVolume, fmt1 } from "../format/num.js";
import { fmtRelativeDay } from "../format/date.js";

/** MiniProgressChart 에 태우는 최근 세션 수. */
const MINI_SESSION_LIMIT = 8;

/** DashboardScreen props. */
export interface DashboardScreenProps {
  /** 현재 활성 프로그램(상체/하체). */
  programId: ProgramId;
  /** "YYYY-MM-DD" 로컬 오늘(스트릭 계산 기준). */
  today: string;
  /** 화면 전환(기록 시작/차트 이동). */
  navigate: (route: Route) => void;
}

/** 이 프로그램의 완료 세션만 완료 시각 오름차순 정렬(차트·PR shape 용). */
function completedSessionsAsc(
  sessions: WorkoutSession[],
  programId: ProgramId,
): WorkoutSession[] {
  return sessions
    .filter((s) => s.programId === programId && s.completedAt != null)
    .slice()
    .sort((a, b) => {
      const at = a.completedAt ?? "";
      const bt = b.completedAt ?? "";
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
}

/** 로그 세트 중 최대 무게(전부 null 이면 null). */
function topWeight(sets: { weightKg: number | null }[]): number | null {
  let max: number | null = null;
  for (const s of sets) {
    if (s.weightKg != null && (max === null || s.weightKg > max)) max = s.weightKg;
  }
  return max;
}

/** 로그 세트 중 최대 횟수(세트 없으면 0). */
function topReps(sets: { reps: number }[]): number {
  let max = 0;
  for (const s of sets) if (s.reps > max) max = s.reps;
  return max;
}

/**
 * 한 종목의 세션별 진행 포인트(오래된→최신). PR 세션은 isPR 로 표시.
 * weighted → 세션 탑세트 무게, bodyweight → 세션 대표 reps.
 */
function progressPoints(
  history: WorkoutSession[],
  def: ExerciseDef,
  prSessionIds: Set<string>,
): ProgressPoint[] {
  const points: ProgressPoint[] = [];
  for (const session of history) {
    const log = session.exercises.find((e) => e.exerciseId === def.id);
    if (log === undefined) continue;
    const value =
      def.kind === "weighted" ? topWeight(log.sets) : topReps(log.sets);
    points.push({
      localDate: session.localDate,
      value,
      isPR: prSessionIds.has(session.id),
    });
  }
  return points;
}

/** DashboardScreen 본체. */
export function DashboardScreen({
  programId,
  today,
  navigate,
}: DashboardScreenProps): React.ReactElement {
  const store = useStore();

  const summary = useMemo(
    () => buildDashboard(store, programId, today),
    [store, programId, today],
  );

  // 차트·PR shape 를 위한 프로그램 완료 세션(오름차순)과 전역 PR 스캔.
  const history = useMemo(
    () => completedSessionsAsc(store.sessions, programId),
    [store, programId],
  );
  const allPRs = useMemo<PRRecord[]>(() => detectPRs(history), [history]);
  const prSessionIds = useMemo(
    () => new Set(allPRs.map((p) => p.sessionId)),
    [allPRs],
  );

  const hasHistory = history.length > 0;

  // ── 빈 상태: 완료 세션이 하나도 없음(첫 무게 유도) ──
  if (!hasHistory) {
    return (
      <div className="col">
        <Card>
          <DayChip
            label={summary.next.template.shortLabel}
            lap={summary.next.lap}
          />
          <div className="dim" style={{ fontSize: 13, marginTop: 8 }}>
            {summary.next.template.label} ·{" "}
            {summary.next.template.exerciseIds.length}종목
          </div>
        </Card>
        <EmptyState
          icon={<TrendingUp size={30} strokeWidth={1.5} />}
          title="첫 기록을 남겨보세요"
          sub="여기가 당신의 시작 무게입니다. 첫 세션을 기록하면 추세·기록이 쌓입니다."
          action={
            <div className="row wrap" style={{ gap: 10, justifyContent: "center" }}>
              <button
                className="btn primary"
                onClick={() => navigate("input")}
              >
                <Play size={16} strokeWidth={2.5} /> 첫 기록 시작
              </button>
              <button className="btn" onClick={() => navigate("settings")}>
                예전 기록 이사
              </button>
            </div>
          }
        />
      </div>
    );
  }

  // ── 메인 리프트(HeroTicker/미니차트 대상): role==="main" ──
  const mains = summary.perExercise.filter((p) => p.def.role === "main");

  // 대표 메인(첫 메인) — NextTargetBanner·MiniProgressChart 기준.
  const primary = mains[0];

  // 지난(마지막) 완료 세션과 그 PR.
  const lastSession = history[history.length - 1];
  const lastPRs = lastSession
    ? allPRs.filter((p) => p.sessionId === lastSession.id)
    : [];

  return (
    <div className="col">
      {/* 1. TodayCard — 오늘 할 차례 */}
      <Card
        title="오늘 할 차례"
        accessory={<DayChip label={summary.next.template.shortLabel} lap={summary.next.lap} />}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          {summary.next.template.label}
        </div>
        <div className="dim" style={{ fontSize: 12.5, marginBottom: 12 }}>
          {summary.perExercise.map((p) => p.def.name).join(" · ")}
        </div>
        <button
          className="btn primary full"
          onClick={() => navigate("input")}
        >
          <Play size={16} strokeWidth={2.5} /> 기록 시작
        </button>
      </Card>

      {/* 2. HeroTicker — 메인 리프트 현재 값 */}
      {mains.length > 0 && (
        <Card title="현재 무게" accessory={<span className="dim">메인 리프트</span>}>
          {mains.map((p) => {
            const isBw = p.def.kind === "bodyweight";
            // 헤드라인 값(price): weighted=현재 목표 무게, bodyweight=마지막 탑 reps.
            const points = progressPoints(history, p.def, prSessionIds);
            const vals = points
              .map((pt) => pt.value)
              .filter((v): v is number => v != null);
            const cur = isBw
              ? (vals.length > 0 ? vals[vals.length - 1] ?? null : null)
              : p.currentKg;
            // 델타는 항상 세션 대 세션 실측 변화(마지막 실측 - 직전 실측)로 계산한다.
            // weighted 도 목표(cur)가 아니라 실측 탑세트끼리 비교해야 target/actual 혼용이 없다.
            const lastActual =
              vals.length >= 1 ? vals[vals.length - 1] ?? null : null;
            const prevActual =
              vals.length >= 2 ? vals[vals.length - 2] ?? null : null;
            const delta =
              lastActual != null && prevActual != null
                ? lastActual - prevActual
                : undefined;

            const sub = isBw
              ? "반복 수(회)"
              : p.best1RM != null
                ? `e1RM ${fmt1(p.best1RM)}`
                : "e1RM —";

            return (
              <Ticker
                key={p.def.id}
                name={p.def.name}
                sub={sub}
                price={isBw ? fmtReps(cur) : fmtKg(cur)}
                unit={isBw ? "회" : "kg"}
                delta={delta}
                deltaDigits={isBw ? 0 : 1}
                deltaUnit={isBw ? "회" : "kg"}
                onClick={() => navigate("charts")}
              />
            );
          })}
        </Card>
      )}

      {/* 3. MiniProgressChart — 대표 메인 리프트 최근 압축 라인 */}
      {primary !== undefined &&
        (() => {
          const full = progressPoints(history, primary.def, prSessionIds);
          const data = full.slice(-MINI_SESSION_LIMIT);
          const isWeighted = primary.def.kind === "weighted";
          return (
            <div
              onClick={() => navigate("charts")}
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
            >
              <ProgressChart
                title={primary.def.name}
                caption={isWeighted ? "무게 추이" : "반복 수 추이"}
                kind={primary.def.kind}
                data={data}
                targetKg={
                  isWeighted ? primary.suggestion.suggestedKg : null
                }
                height={120}
              />
            </div>
          );
        })()}

      {/* 4. NextTargetBanner — 대표 메인 리프트 증량/유지 신호 */}
      {primary !== undefined && (
        <NextTargetBanner suggestion={primary.suggestion} />
      )}

      {/* 5. LastSessionCard — 지난 세션 세트 칩 + 볼륨 + PR */}
      {lastSession !== undefined && (
        <LastSessionCard
          session={lastSession}
          exerciseName={(id: ExerciseId) => store.exercises[id]?.name ?? id}
          targetReps={(id: ExerciseId) => store.exercises[id]?.targetReps ?? Infinity}
          volume={summary.lastSessionVolume}
          prs={lastPRs}
          today={today}
        />
      )}
    </div>
  );
}

/** LastSessionCard props. */
interface LastSessionCardProps {
  session: WorkoutSession;
  exerciseName: (id: ExerciseId) => string;
  targetReps: (id: ExerciseId) => number;
  volume: number | null;
  prs: PRRecord[];
  today: string;
}

/** PR 종류 → 한국어 배지 라벨. */
function prLabel(kind: PRRecord["kind"]): string {
  switch (kind) {
    case "weight":
      return "무게";
    case "reps":
      return "횟수";
    case "e1rm":
      return "e1RM";
    case "volume":
      return "볼륨";
  }
}

/**
 * 지난 세션 카드 — 종목별 세트 무게×횟수 칩(목표 도달 세트는 up-red hit),
 * 세션 볼륨, 이번 세션에서 세운 PR(신기록) 배지.
 */
function LastSessionCard({
  session,
  exerciseName,
  targetReps,
  volume,
  prs,
  today,
}: LastSessionCardProps): React.ReactElement {
  const when = fmtRelativeDay(session.localDate, today);

  return (
    <Card
      title="지난 세션"
      accessory={<span className="dim">{when}</span>}
    >
      <div className="col" style={{ gap: 12 }}>
        {session.exercises.map((log) => {
          const tgt = targetReps(log.exerciseId);
          return (
            <div key={log.exerciseId}>
              <div
                className="dim"
                style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}
              >
                {exerciseName(log.exerciseId)}
              </div>
              <div className="set-chips">
                {log.sets.map((set) => (
                  <span
                    key={set.setIndex}
                    className={`set-chip${set.reps >= tgt ? " hit" : ""}`}
                  >
                    {fmtSetChip(set.weightKg, set.reps)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <hr className="hr" />

      <div className="row between">
        <StatTile
          label="총 볼륨"
          value={fmtVolume(volume)}
          unit={volume != null ? "kg" : undefined}
        />
        {prs.length > 0 && (
          <div className="row wrap" style={{ gap: 6, justifyContent: "flex-end" }}>
            {prs.map((pr, i) => (
              <Badge key={`${pr.exerciseId}-${pr.kind}-${i}`} variant="pr" icon="🏆">
                {prLabel(pr.kind)} 신기록
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
