/**
 * ChartsScreen — 종목별 진행/볼륨/e1RM 차트 스택 화면.
 *
 * 정보구조:
 *  1) 상단 종목 선택 세그먼트 칩(.program-tabs 재사용) — 선택 프로그램의 종목 중 하나 선택.
 *  2) 선택 종목의 차트 세로 스택:
 *     - ProgressChart : weighted=탑세트 무게 추이("메인 리프트 무게 추이")
 *                       bodyweight=대표 reps 추이("반복 수 추이")
 *     - VolumeChart   : 세션 볼륨(kg-볼륨 또는 자체중량 rep-볼륨) "세션 볼륨"
 *     - OneRMChart    : (메인 weighted 만) Epley e1RM 추이 "추정 최대 1RM(e1RM)"
 *  각 차트는 ChartFrame(제목+서브카피) 카드로 렌더된다.
 *
 * 데이터 shape 는 전적으로 이 화면단 책임 — 도메인 함수(estimate1RM/sessionVolume/
 * sessionRepVolume/best1RM/detectPRs)로 세션 배열을 차트 포인트 배열로 변환한 뒤
 * 이미 shape 된 배열을 차트 컴포넌트에 props 로 넘긴다. 차트는 도메인을 직접 호출하지 않는다.
 *
 * 세션 <2 이면 추세선이 의미가 없어 힌트(EmptyState)만 보인다.
 */

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import type {
  ExerciseDef,
  ExerciseId,
  ExerciseLog,
  ProgramId,
  WorkoutSession,
} from "../../domain/types.js";
import { estimate1RM, best1RM } from "../../domain/oneRepMax.js";
import { exerciseVolume } from "../../domain/volume.js";
import { detectPRs } from "../../domain/pr.js";
import { suggestedWeight } from "../../domain/progression.js";
import { useProgram } from "../app/useProgram.js";
import { EmptyState } from "../components/index.js";
import { ProgressChart, type ProgressPoint } from "../charts/ProgressChart.js";
import { VolumeChart, type VolumePoint } from "../charts/VolumeChart.js";
import { OneRMChart, type OneRMPoint } from "../charts/OneRMChart.js";

/** ChartsScreen props — 활성 프로그램(상체/하체)만 받고 데이터는 훅에서 파생. */
export interface ChartsScreenProps {
  /** 현재 활성 프로그램. ProgramTabs 전환 시 이 값이 바뀐다. */
  programId: ProgramId;
}

/** 한 종목의 세션 내 로그(있으면)와 소속 세션을 묶은 스캔 단위. */
interface ExercisePoint {
  session: WorkoutSession;
  log: ExerciseLog;
}

/**
 * 완료된 세션 중, 대상 종목의 로그를 포함한 것만 시간순으로 추린다.
 * sessions 는 useProgram 이 localDate 오름차순으로 이미 정렬해 준다(그대로 신뢰).
 * 완료(completedAt != null)만 차트에 태운다 — 진행 중 세션은 추세 왜곡.
 */
function pointsFor(
  sessions: WorkoutSession[],
  exerciseId: ExerciseId,
): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const session of sessions) {
    if (session.completedAt == null) continue;
    const log = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (log === undefined) continue;
    out.push({ session, log });
  }
  return out;
}

/** 로그 세트 중 최대 무게(자체중량 null 제외). 없으면 null. */
function topSetKg(log: ExerciseLog): number | null {
  let max: number | null = null;
  for (const set of log.sets) {
    if (set.weightKg != null && (max === null || set.weightKg > max)) {
      max = set.weightKg;
    }
  }
  return max;
}

/** 로그 세트 중 최대 reps. 세트 없으면 0. */
function topReps(log: ExerciseLog): number {
  let max = 0;
  for (const set of log.sets) {
    if (set.reps > max) max = set.reps;
  }
  return max;
}

/** 로그의 세션 내 최고 e1RM(자체중량이면 항상 null). */
function topE1rm(log: ExerciseLog): number | null {
  let best: number | null = null;
  for (const set of log.sets) {
    const e = estimate1RM(set.weightKg, set.reps);
    if (e === null) continue;
    if (best === null || e > best) best = e;
  }
  return best;
}

/**
 * 종목 하나에 대한 세 차트의 데이터·메타를 조립한다.
 * 도메인 함수 호출은 전부 여기서 끝내고, 반환값은 이미 shape 된 차트 props 뿐.
 */
function useExerciseCharts(
  def: ExerciseDef,
  sessions: WorkoutSession[],
  fullHistory: WorkoutSession[],
): {
  count: number;
  isWeighted: boolean;
  showOneRM: boolean;
  progress: ProgressPoint[];
  volume: VolumePoint[];
  oneRM: OneRMPoint[];
  targetKg: number | null;
} {
  return useMemo(() => {
    const isWeighted = def.kind === "weighted";
    const pts = pointsFor(sessions, def.id);

    // 이 종목이 PR 을 세운 세션 id 집합(진행 차트 다이아 마커용).
    const prSessionIds = new Set<string>();
    const e1rmPrSessionIds = new Set<string>();
    for (const pr of detectPRs(fullHistory)) {
      if (pr.exerciseId !== def.id) continue;
      prSessionIds.add(pr.sessionId);
      if (pr.kind === "e1rm") e1rmPrSessionIds.add(pr.sessionId);
    }

    // ProgressChart: weighted=탑세트 무게, bodyweight=대표 reps.
    const progress: ProgressPoint[] = pts.map((p) => ({
      localDate: p.session.localDate,
      value: isWeighted ? topSetKg(p.log) : topReps(p.log),
      isPR: prSessionIds.has(p.session.id),
    }));

    // VolumeChart: weighted=이 종목의 kg-볼륨, bodyweight=이 종목의 rep-볼륨.
    const volume: VolumePoint[] = pts.map((p) => ({
      localDate: p.session.localDate,
      volume: isWeighted
        ? exerciseVolume(p.log)
        : p.log.sets.reduce((s, set) => s + set.reps, 0),
    }));

    // OneRMChart: 메인 weighted 만. bodyweight 은 렌더 자체를 생략.
    const showOneRM = isWeighted && def.role === "main";
    const oneRM: OneRMPoint[] = showOneRM
      ? pts.map((p) => ({
          localDate: p.session.localDate,
          e1rm: topE1rm(p.log),
          isPR: e1rmPrSessionIds.has(p.session.id),
        }))
      : [];

    // 다음 목표 무게(진행 차트 점선 ReferenceLine). weighted 만 의미.
    const suggestion = isWeighted
      ? suggestedWeight(def, sessions)
      : null;
    const targetKg = suggestion?.suggestedKg ?? null;

    return {
      count: pts.length,
      isWeighted,
      showOneRM,
      progress,
      volume,
      oneRM,
      targetKg,
    };
  }, [def, sessions, fullHistory]);
}

/**
 * 선택된 한 종목의 차트 스택(진행 → 볼륨 → e1RM).
 * 세션 <2 면 추세선 대신 힌트를 보인다.
 */
function ExerciseCharts({
  def,
  sessions,
  fullHistory,
}: {
  def: ExerciseDef;
  sessions: WorkoutSession[];
  fullHistory: WorkoutSession[];
}): React.ReactElement {
  const {
    count,
    isWeighted,
    showOneRM,
    progress,
    volume,
    oneRM,
    targetKg,
  } = useExerciseCharts(def, sessions, fullHistory);

  if (count === 0) {
    return (
      <EmptyState
        icon={<TrendingUp size={28} strokeWidth={1.6} />}
        title="아직 기록이 없습니다"
        sub={`${def.name} 첫 세션을 남기면 여기가 시작 무게가 됩니다.`}
      />
    );
  }
  if (count < 2) {
    return (
      <EmptyState
        icon={<TrendingUp size={28} strokeWidth={1.6} />}
        title="세션 2개부터 추세선"
        sub={`${def.name} 세션이 하나 더 쌓이면 진행 추이가 그려집니다.`}
      />
    );
  }

  const best = showOneRM ? best1RM(fullHistory, def.id) : null;

  return (
    <div className="charts-stack">
      <ProgressChart
        title={def.name}
        caption={isWeighted ? "무게 추이" : "반복 수 추이"}
        kind={def.kind}
        data={progress}
        targetKg={isWeighted ? targetKg : null}
      />
      <VolumeChart
        title={`${def.name} · 총 볼륨`}
        caption={
          isWeighted
            ? "총 볼륨(무게×횟수×세트)"
            : "총 볼륨(총 반복 수)"
        }
        data={volume}
        unit={isWeighted ? "kg" : "reps"}
      />
      {showOneRM ? (
        <OneRMChart
          title={`${def.name} · e1RM`}
          caption={
            best != null
              ? `추정 1RM(e1RM) · 최고 ${best.toFixed(1)}kg`
              : "추정 1RM(e1RM)"
          }
          kind={def.kind}
          data={oneRM}
        />
      ) : null}
    </div>
  );
}

/**
 * 차트 화면.
 * 상단 종목 칩 → 선택 종목의 차트 스택. 프로그램 전환 시 선택 유효성 자동 보정.
 */
export function ChartsScreen({
  programId,
}: ChartsScreenProps): React.ReactElement {
  const { exercises, sessions } = useProgram(programId);

  // PR 탐지는 전체 세션(프로그램 무관 종목 id 유일) 기준으로 하되,
  // 여기선 프로그램별 종목만 다루므로 해당 프로그램 세션으로 충분하다.
  const fullHistory = sessions;

  // 선택 종목 id. 프로그램이 바뀌어 더 이상 존재하지 않으면 첫 종목으로 폴백.
  const [selectedId, setSelectedId] = useState<ExerciseId | null>(null);
  const activeId = useMemo<ExerciseId | null>(() => {
    if (selectedId != null && exercises.some((e) => e.id === selectedId)) {
      return selectedId;
    }
    return exercises[0]?.id ?? null;
  }, [selectedId, exercises]);

  const activeDef = useMemo<ExerciseDef | null>(
    () => exercises.find((e) => e.id === activeId) ?? null,
    [exercises, activeId],
  );

  // 프로그램에 종목이 하나도 없으면(비정상) 안내만.
  if (exercises.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp size={28} strokeWidth={1.6} />}
        title="표시할 종목이 없습니다"
        sub="프로그램에 종목이 설정되면 차트가 나타납니다."
      />
    );
  }

  return (
    <div className="charts-screen">
      <div
        className="program-tabs charts-picker"
        role="tablist"
        aria-label="종목 선택"
      >
        {exercises.map((def) => {
          const selected = def.id === activeId;
          return (
            <button
              key={def.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className="program-tab"
              onClick={() => setSelectedId(def.id)}
            >
              {def.name}
            </button>
          );
        })}
      </div>

      {activeDef ? (
        <ExerciseCharts
          key={`${programId}:${activeDef.id}`}
          def={activeDef}
          sessions={sessions}
          fullHistory={fullHistory}
        />
      ) : null}
    </div>
  );
}
