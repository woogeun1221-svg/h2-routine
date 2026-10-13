/**
 * InputScreen — 세트 입력(풀스크린).
 *
 * nextWorkout 으로 "오늘 할 Day"의 종목들을 순서대로 입력한다.
 * 종목마다 setCount 개의 SetRow(무게 ±increment 스테퍼 / reps ±1 스테퍼,
 * inputMode numeric)를 렌더하고, 지난 세션값을 프리필한다.
 * 각 세트가 targetReps(12) 이상이면 그 행에 up-red "달성" 배지를,
 * 그 종목 전 세트가 12회면 NextTargetBanner 를 solid(bump) 로 승격한다.
 *
 * 자체중량(가중 불가) 종목은 무게 입력을 숨기고 reps 만 받는다.
 * 실시간 세션 볼륨(kg-볼륨)을 상단에 표시한다.
 *
 * 저장 시:
 *  - WorkoutSession 을 구성(localDate=todayLocal, startedAt=마운트 시각, completedAt=now)
 *  - logSession 으로 스토어에 반영(진행 규칙 weightState 재계산은 액션 계층이 수행)
 *  - 이 세션이 새로 세운 PR 이 있으면 "🏆 신기록" 토스트를 잠깐 띄우고
 *  - onDone 으로 대시보드로 복귀한다.
 *
 * 데이터 접근:
 *  - 읽기: useProgram(programId) 로 program/templates/exercises/sessions 파생,
 *          store 싱글턴으로 weightState/exercises 정의 조회.
 *  - 쓰기: logSession prop(App→useAppState.logSession).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ExerciseDef,
  ExerciseId,
  ExerciseLog,
  ProgramId,
  SetLog,
  WorkoutSession,
} from "../../domain/types.js";
import { nextWorkout } from "../../domain/rotation.js";
import { suggestedWeight } from "../../domain/progression.js";
import { sessionVolume } from "../../domain/volume.js";
import { prsInSession } from "../../domain/pr.js";
import { todayLocal } from "../../domain/dateUtil.js";
import { useProgram } from "../app/useProgram.js";
import { store } from "../useStore.js";
import { fmtKg, fmtReps, fmtVolume } from "../format/num.js";
import { Card, Badge, NextTargetBanner } from "../components/index.js";
import { Screen } from "../layout/Screen.js";

/** InputScreen props — App(오케스트레이션)이 주입. */
export interface InputScreenProps {
  /** 대상 프로그램(상체/하체). */
  programId: ProgramId;
  /** 세션 저장(신규 upsert + weightState 재계산). useAppState.logSession. */
  logSession: (session: WorkoutSession) => void;
  /** 저장/취소 후 복귀(보통 대시보드로 navigate). */
  onDone: () => void;
  /** 상단 헤더 슬롯(App 이 <Header/> 를 내려줌). 선택. */
  header?: React.ReactNode;
  /** 하단 네비 슬롯(App 이 <BottomNav/> 를 내려줌). 선택. */
  bottomNav?: React.ReactNode;
}

/** 자체중량(가중 불가) 여부 — 무게 입력을 숨긴다. */
function isPureBodyweight(def: ExerciseDef): boolean {
  return def.kind === "bodyweight" && !def.allowsAddedWeight;
}

/** 한 세트의 편집 상태(무게는 자체중량이면 null). */
interface SetDraft {
  weightKg: number | null;
  reps: number;
}

/** 한 종목의 편집 상태. */
interface ExerciseDraft {
  def: ExerciseDef;
  /** 시작(제안) 무게 — plannedWeightKg 로 기록. 자체중량은 null. */
  plannedWeightKg: number | null;
  sets: SetDraft[];
}

/**
 * 특정 종목의 "마지막 완료 세션 로그"를 찾아 프리필 소스로 쓴다.
 * useProgram.sessions 는 localDate 오름차순이라 뒤에서부터 탐색.
 */
function findLastLog(
  exerciseId: ExerciseId,
  sessions: WorkoutSession[],
): ExerciseLog | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s === undefined || s.completedAt === null) continue;
    const log = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (log !== undefined) return log;
  }
  return null;
}

/**
 * 종목 하나의 초기 드래프트를 만든다.
 * 무게: suggestedWeight(진행 규칙) 결과를 우선, 없으면 defaultStartWeightKg.
 * reps: 지난 세션의 세트별 reps 를 프리필, 없으면 targetReps.
 * 세트 수: def.setCount (지난 로그가 더 많으면 그 길이도 허용).
 */
function buildExerciseDraft(
  def: ExerciseDef,
  allSessions: WorkoutSession[],
): ExerciseDraft {
  const bodyweight = isPureBodyweight(def);
  const state = store.getState().weightState[def.id];
  const suggestion = suggestedWeight(def, allSessions, state);
  const lastLog = findLastLog(def.id, allSessions);

  const planned = bodyweight ? null : suggestion.suggestedKg;
  const setCount = Math.max(def.setCount, lastLog?.sets.length ?? 0);

  const sets: SetDraft[] = [];
  for (let i = 0; i < setCount; i++) {
    const prevSet = lastLog?.sets.find((s) => s.setIndex === i);
    const reps = prevSet?.reps ?? def.targetReps;
    const weightKg = bodyweight ? null : planned;
    sets.push({ weightKg, reps });
  }

  return { def, plannedWeightKg: planned, sets };
}

/** 0 미만으로 내려가지 않게 clamp. */
function clampMin(n: number, min: number): number {
  return n < min ? min : n;
}

/** ± 스테퍼(무게/횟수 공용). value 는 표시용 문자열로 포맷된다. */
function Stepper({
  value,
  step,
  min,
  onChange,
  format,
  ariaLabel,
}: {
  value: number;
  step: number;
  min: number;
  onChange: (next: number) => void;
  format: (v: number) => string;
  ariaLabel: string;
}): React.ReactElement {
  return (
    <div className="stepper" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        aria-label={`${ariaLabel} 감소`}
        onClick={() => onChange(clampMin(value - step, min))}
      >
        −
      </button>
      <span className="stepper-val">{format(value)}</span>
      <button
        type="button"
        aria-label={`${ariaLabel} 증가`}
        onClick={() => onChange(value + step)}
      >
        +
      </button>
    </div>
  );
}

/** 세트 한 행: 무게 스테퍼(가중만) + reps 스테퍼 + 12회 달성 배지. */
function SetRow({
  index,
  draft,
  def,
  bodyweight,
  onChange,
}: {
  index: number;
  draft: SetDraft;
  def: ExerciseDef;
  bodyweight: boolean;
  onChange: (next: SetDraft) => void;
}): React.ReactElement {
  const hit = draft.reps >= def.targetReps;
  return (
    <div className={`set-row${hit ? " hit" : ""}`}>
      <span className="set-index">#{index + 1}</span>

      {!bodyweight && (
        <Stepper
          ariaLabel={`${def.name} ${index + 1}세트 무게`}
          value={draft.weightKg ?? 0}
          step={def.progressionIncrementKg || 2.5}
          min={0}
          format={(v) => fmtKg(v)}
          onChange={(next) => onChange({ ...draft, weightKg: next })}
        />
      )}

      <Stepper
        ariaLabel={`${def.name} ${index + 1}세트 횟수`}
        value={draft.reps}
        step={1}
        min={0}
        format={(v) => fmtReps(v)}
        onChange={(next) => onChange({ ...draft, reps: next })}
      />

      {hit && (
        <span className="set-row-badge">
          <Badge variant="up">달성</Badge>
        </span>
      )}
    </div>
  );
}

/**
 * 한 종목 카드: 세트 행들 + "이 무게 전 세트 적용" 퀵필 + NextTargetBanner.
 * 전 세트가 12회면 배너를 bump 로 승격(NextTargetBanner 가 isBump 로 solid 렌더).
 */
function ExerciseCard({
  draft,
  onSetsChange,
}: {
  draft: ExerciseDraft;
  onSetsChange: (sets: SetDraft[]) => void;
}): React.ReactElement {
  const { def, sets } = draft;
  const bodyweight = isPureBodyweight(def);

  // 전 세트 목표 달성(증량 신호) — 배너 승격 조건.
  const allHit = sets.length > 0 && sets.every((s) => s.reps >= def.targetReps);

  // 첫 세트 무게를 나머지 전 세트에 적용(퀵필).
  const firstWeight = sets[0]?.weightKg ?? null;
  const applyToAll = () => {
    if (bodyweight || firstWeight === null) return;
    onSetsChange(sets.map((s) => ({ ...s, weightKg: firstWeight })));
  };

  // NextTargetBanner 용 suggestion 을 즉석 합성(현재 입력 기준).
  // 규칙: 가중 종목에서 전 세트 12회면 다음 +increment(bump), 아니면 hold.
  const inc = def.progressionIncrementKg;
  const base = draft.plannedWeightKg;
  const suggestion = bodyweight
    ? {
        exerciseId: def.id,
        suggestedKg: null,
        isBump: false,
        reason: "bodyweight" as const,
        incrementKg: 0,
      }
    : allHit
      ? {
          exerciseId: def.id,
          suggestedKg: base == null ? null : base + inc,
          isBump: base != null && inc !== 0,
          reason: "bump" as const,
          incrementKg: inc,
        }
      : {
          exerciseId: def.id,
          suggestedKg: base,
          isBump: false,
          reason: "hold" as const,
          incrementKg: 0,
        };

  return (
    <Card
      title={def.name}
      accessory={
        <span className="dim">
          {def.setCount}세트 · 목표 {fmtReps(def.targetReps, true)}
          {!bodyweight && base != null && (
            <> · 제안 <span className="num">{fmtKg(base)}</span>kg</>
          )}
        </span>
      }
    >
      <div className="set-list">
        {sets.map((s, i) => (
          <SetRow
            key={i}
            index={i}
            draft={s}
            def={def}
            bodyweight={bodyweight}
            onChange={(next) =>
              onSetsChange(sets.map((cur, j) => (j === i ? next : cur)))
            }
          />
        ))}
      </div>

      {!bodyweight && firstWeight !== null && sets.length > 1 && (
        <button type="button" className="btn ghost full quickfill" onClick={applyToAll}>
          이 무게({fmtKg(firstWeight)}kg) 전 세트 적용
        </button>
      )}

      <NextTargetBanner suggestion={suggestion} />
    </Card>
  );
}

/** InputScreen — 오늘 Day 의 세트 입력 풀스크린. */
export function InputScreen({
  programId,
  logSession,
  onDone,
  header,
  bottomNav,
}: InputScreenProps): React.ReactElement {
  const view = useProgram(programId);

  // 세션 시작 시각(마운트 시 1회 고정) · 오늘 로컬 날짜.
  const startedAtRef = useRef<string>(new Date().toISOString());
  const localDateRef = useRef<string>(todayLocal());

  // 오늘 할 Day(템플릿) 결정. program 없으면 렌더 자체를 막는다.
  const next = useMemo(() => {
    if (!view.program) return null;
    return nextWorkout(view.program, storeTemplates(), view.sessions);
  }, [view.program, view.sessions]);

  // 이 Day 의 종목 정의(템플릿 순서).
  const defs = useMemo<ExerciseDef[]>(() => {
    if (!next) return [];
    const all = store.getState().exercises;
    const out: ExerciseDef[] = [];
    for (const eid of next.template.exerciseIds) {
      const def = all[eid];
      if (def) out.push(def);
    }
    return out;
  }, [next]);

  // 드래프트 초기화(종목/프로그램/세션 변화 시 재구성).
  const [drafts, setDrafts] = useState<ExerciseDraft[]>([]);
  useEffect(() => {
    if (!next) {
      setDrafts([]);
      return;
    }
    const all = store.getState().sessions;
    setDrafts(defs.map((def) => buildExerciseDraft(def, all)));
    // template.id 로 Day 가 바뀔 때만 재초기화(입력 중 리셋 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.template.id, programId]);

  // 저장 후 PR 토스트.
  const [prToast, setPrToast] = useState<string | null>(null);

  const updateSets = (exerciseId: ExerciseId, sets: SetDraft[]) => {
    setDrafts((prev) =>
      prev.map((d) => (d.def.id === exerciseId ? { ...d, sets } : d)),
    );
  };

  const handleSave = () => {
    if (!next) return;
    const now = new Date().toISOString();
    const localDate = localDateRef.current;

    const exercises: ExerciseLog[] = drafts.map((d) => {
      const bodyweight = isPureBodyweight(d.def);
      const sets: SetLog[] = d.sets.map((s, i) => ({
        setIndex: i,
        weightKg: bodyweight ? null : s.weightKg,
        reps: s.reps,
        completedAt: now,
      }));
      return {
        exerciseId: d.def.id,
        kindAtLog: d.def.kind,
        plannedWeightKg: bodyweight ? null : d.plannedWeightKg,
        sets,
      };
    });

    const sessionId = `${programId}-${localDate}-${startedAtRef.current}`;
    const session: WorkoutSession = {
      id: sessionId,
      programId,
      templateId: next.template.id,
      localDate,
      startedAt: startedAtRef.current,
      completedAt: now,
      exercises,
    };

    // PR 판정은 이 세션이 히스토리에 포함된 상태에서 계산해야 하므로
    // 저장 전 스냅샷에 이 세션을 얹어 미리 검사한다(중복 방지 upsert).
    const snapshot = store.getState().sessions;
    const idx = snapshot.findIndex((s) => s.id === sessionId);
    const withThis =
      idx >= 0
        ? snapshot.map((s) => (s.id === sessionId ? session : s))
        : [...snapshot, session];
    const prs = prsInSession(withThis, sessionId);

    logSession(session);

    if (prs.length > 0) {
      setPrToast(`🏆 신기록 ${prs.length}건 갱신`);
      window.setTimeout(() => {
        setPrToast(null);
        onDone();
      }, 1200);
    } else {
      onDone();
    }
  };

  // program 이 없거나(비정상 스토어) Day 를 못 정하면 안내.
  if (!view.program || !next) {
    return (
      <Screen header={header} bottomNav={bottomNav} title="기록">
        <Card>
          <p className="dim">프로그램을 불러올 수 없습니다.</p>
        </Card>
      </Screen>
    );
  }

  const savedVolume = sessionVolume({
    id: "preview",
    programId,
    templateId: next.template.id,
    localDate: localDateRef.current,
    startedAt: startedAtRef.current,
    completedAt: null,
    exercises: drafts.map((d) => ({
      exerciseId: d.def.id,
      kindAtLog: d.def.kind,
      plannedWeightKg: d.plannedWeightKg,
      sets: d.sets.map((s, i) => ({
        setIndex: i,
        weightKg: isPureBodyweight(d.def) ? null : s.weightKg,
        reps: s.reps,
        completedAt: startedAtRef.current,
      })),
    })),
  });

  return (
    <Screen
      header={header}
      bottomNav={bottomNav}
      title={next.template.label}
      subtitle={
        <span>
          총 볼륨{" "}
          <span className="num up">{fmtVolume(savedVolume, true)}</span>
        </span>
      }
    >
      <div className="input-screen">
        {drafts.map((d) => (
          <ExerciseCard
            key={d.def.id}
            draft={d}
            onSetsChange={(sets) => updateSets(d.def.id, sets)}
          />
        ))}

        <div className="input-actions">
          <button type="button" className="btn ghost" onClick={onDone}>
            취소
          </button>
          <button
            type="button"
            className="btn primary full"
            onClick={handleSave}
          >
            저장 ▲
          </button>
        </div>
      </div>

      {prToast != null && (
        <div className="toast-layer" aria-live="polite">
          <div className="toast pr">{prToast}</div>
        </div>
      )}
    </Screen>
  );
}

/** store 싱글턴에서 templates 레코드를 뽑는 소형 헬퍼(nextWorkout 인자용). */
function storeTemplates() {
  return store.getState().templates;
}
