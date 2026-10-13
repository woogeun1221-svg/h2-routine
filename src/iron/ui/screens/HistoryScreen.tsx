/**
 * HistoryScreen — 활성 프로그램 세션 타임라인(최신순).
 *
 * 한 세션 = 하루(Day) = 카드 하나. 카드 구성:
 *  - 헤더: 상대 날짜("오늘"/"어제"/M/D) + 전체 날짜 + Day 라벨 칩(+lap) + 이 세션 PR 배지
 *  - 종목별 블록: 종목명 + 세트 "무게×횟수" 칩(전 세트 targetReps 도달 시 up-red "hit")
 *    + 종목 단위 "달성"(전 워킹세트 목표 도달) 배지 / 종목 PR 배지
 *  - 푸터: 세션 kg-볼륨 — 자체중량만 있는 세션은 Σreps 로 대체 표기
 *
 * 데이터는 스토어에서 직접 파생한다(useProgram: 세션·종목 정의).
 * 세션은 useProgram 이 localDate 오름차순으로 주므로 여기서 역순(최신 먼저)으로 뒤집는다.
 * 진행 중(completedAt === null) 세션도 표시하되 "진행 중" 표식만 얹는다(PR·달성 판정 제외).
 *
 * 빈 상태: 세션이 하나도 없으면 첫 기록을 유도한다.
 *
 * 계약: types.ts 의 타입만 import, 상대경로는 .js 확장자. React 19 함수형 named export.
 */

import { useMemo } from "react";
import { History as HistoryIcon } from "lucide-react";
import type {
  ExerciseDef,
  ExerciseId,
  ExerciseLog,
  PRRecord,
  ProgramId,
  SessionTemplate,
  WorkoutSession,
} from "../../domain/types.js";
import { detectPRs } from "../../domain/pr.js";
import {
  sessionVolume,
  sessionRepVolume,
} from "../../domain/volume.js";
import { useProgram } from "../app/useProgram.js";
import { useStore } from "../useStore.js";
import { Badge } from "../components/Badge.js";
import { Card } from "../components/Card.js";
import { EmptyState } from "../components/EmptyState.js";
import { fmtSetChip, fmtVolume, fmtReps } from "../format/num.js";
import { fmtDateFull, fmtRelativeDay } from "../format/date.js";

/** HistoryScreen props — App 이 활성 프로그램·오늘 날짜·기록 이동 콜백을 내려준다. */
export interface HistoryScreenProps {
  /** 표시할 프로그램(상체/하체). */
  programId: ProgramId;
  /** 오늘 로컬 날짜(YYYY-MM-DD, dateUtil.todayLocal()). 상대 날짜 계산용. */
  today: string;
  /** 빈 상태에서 "첫 기록 시작" 시 호출(기록 화면으로 이동). 없으면 버튼 생략. */
  onStartInput?: () => void;
}

/** PR 종류 → 배지 라벨(한국어). */
const PR_LABEL: Record<PRRecord["kind"], string> = {
  weight: "무게 신기록",
  reps: "횟수 신기록",
  e1rm: "e1RM 신기록",
  volume: "총 볼륨 신기록",
};

/**
 * 한 종목 로그가 "목표 달성(증량 신호)"인지 — 전 워킹세트 reps 가 목표 이상.
 * 세트가 하나도 없으면 false. 자체중량도 횟수 목표 도달이면 달성으로 본다.
 */
function isExerciseBump(log: ExerciseLog, def: ExerciseDef | undefined): boolean {
  if (def === undefined) return false;
  if (log.sets.length === 0) return false;
  return log.sets.every((s) => s.reps >= def.targetReps);
}

/** 한 세트가 목표 횟수에 도달했는지(칩 강조용). */
function isSetHit(reps: number, def: ExerciseDef | undefined): boolean {
  if (def === undefined) return false;
  return reps >= def.targetReps;
}

/** 세션이 자체중량 종목만 포함하는지(볼륨 표기를 Σreps 로 바꿀지 판단). */
function isBodyweightOnly(session: WorkoutSession): boolean {
  if (session.exercises.length === 0) return false;
  return session.exercises.every((log) => log.kindAtLog === "bodyweight");
}

/** 세션 카드 헤더의 Day 라벨(가능하면 shortLabel). 템플릿 미상이면 templateId. */
function dayLabel(
  template: SessionTemplate | undefined,
  templateId: string,
): string {
  if (template === undefined) return templateId;
  return template.shortLabel || template.label || templateId;
}

/**
 * 활성 프로그램의 세션 히스토리 타임라인.
 */
export function HistoryScreen({
  programId,
  today,
  onStartInput,
}: HistoryScreenProps): React.ReactElement {
  const store = useStore();
  const { sessions, templates } = useProgram(programId);

  /** 최신 먼저(useProgram 은 오름차순 → 역순). */
  const ordered = useMemo(
    () => sessions.slice().reverse(),
    [sessions],
  );

  /** templateId → SessionTemplate 조회 맵(이 프로그램 rotation 기준). */
  const templateById = useMemo(() => {
    const m = new Map<string, SessionTemplate>();
    for (const t of templates) m.set(t.id, t);
    return m;
  }, [templates]);

  /**
   * 세션별 PR 그룹. detectPRs 는 완료 세션만 판정하므로 이 프로그램 세션 전체로 1회 계산 후
   * sessionId 로 묶는다. (다른 프로그램 세션은 useProgram 에서 이미 걸러짐.)
   */
  const prsBySession = useMemo(() => {
    const m = new Map<string, PRRecord[]>();
    for (const pr of detectPRs(sessions)) {
      const bucket = m.get(pr.sessionId);
      if (bucket === undefined) m.set(pr.sessionId, [pr]);
      else bucket.push(pr);
    }
    return m;
  }, [sessions]);

  if (ordered.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon size={32} />}
        title="아직 기록이 없습니다"
        sub="첫 기록을 남겨보세요 — 여기가 당신의 시작 무게입니다."
        action={
          onStartInput ? (
            <button className="btn primary" onClick={onStartInput}>
              첫 기록 시작
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="col">
      {ordered.map((session) => {
        const template = templateById.get(session.templateId);
        const inProgress = session.completedAt === null;
        const prs = inProgress ? [] : prsBySession.get(session.id) ?? [];
        const bwOnly = isBodyweightOnly(session);

        // 볼륨 표기: 자체중량만이면 Σreps, 아니면 kg-볼륨.
        const kgVol = sessionVolume(session);
        const repVol = sessionRepVolume(session);

        // 종목별 PR 종류 집계(종목명 옆 배지용).
        const prKindsByExercise = new Map<ExerciseId, Set<PRRecord["kind"]>>();
        for (const pr of prs) {
          const set = prKindsByExercise.get(pr.exerciseId);
          if (set === undefined) {
            prKindsByExercise.set(pr.exerciseId, new Set([pr.kind]));
          } else {
            set.add(pr.kind);
          }
        }

        return (
          <Card
            key={session.id}
            accessory={
              <span className="row" style={{ gap: 6 }}>
                <span className="badge muted">
                  {dayLabel(template, session.templateId)}
                </span>
                {inProgress && (
                  <Badge variant="hold">진행 중</Badge>
                )}
                {prs.length > 0 && (
                  <Badge variant="pr" icon="🏆">
                    신기록 {fmtReps(prs.length)}
                  </Badge>
                )}
              </span>
            }
            title={
              <span className="row" style={{ gap: 8, alignItems: "baseline" }}>
                <span>{fmtRelativeDay(session.localDate, today)}</span>
                <span className="dim" style={{ fontSize: 12, fontWeight: 500 }}>
                  {fmtDateFull(session.localDate)}
                </span>
              </span>
            }
          >
            <div className="col" style={{ gap: 10 }}>
              {session.exercises.map((log) => {
                const def = store.exercises[log.exerciseId];
                const name = def?.name ?? log.exerciseId;
                const bump = !inProgress && isExerciseBump(log, def);
                const prKinds = prKindsByExercise.get(log.exerciseId);

                return (
                  <div key={log.exerciseId}>
                    <div
                      className="row wrap"
                      style={{ gap: 6, marginBottom: 5 }}
                    >
                      <span
                        className="ticker-name"
                        style={{ fontSize: 13 }}
                      >
                        {name}
                      </span>
                      {bump && (
                        <Badge variant="up" icon="▲">
                          달성
                        </Badge>
                      )}
                      {prKinds &&
                        [...prKinds].map((kind) => (
                          <Badge key={kind} variant="pr" icon="🏆">
                            {PR_LABEL[kind]}
                          </Badge>
                        ))}
                    </div>
                    <div className="set-chips">
                      {log.sets.length === 0 ? (
                        <span className="set-chip dim">기록 없음</span>
                      ) : (
                        log.sets
                          .slice()
                          .sort((a, b) => a.setIndex - b.setIndex)
                          .map((set) => {
                            const hit = isSetHit(set.reps, def);
                            return (
                              <span
                                key={set.setIndex}
                                className={hit ? "set-chip hit" : "set-chip"}
                              >
                                {fmtSetChip(set.weightKg, set.reps)}
                              </span>
                            );
                          })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <hr className="hr" />
            <div className="row between">
              <span className="stat-label">총 볼륨</span>
              <span className="mono" style={{ fontWeight: 700 }}>
                {bwOnly ? (
                  <>
                    {fmtReps(repVol)} <span className="dim">회</span>
                  </>
                ) : (
                  <>
                    {fmtVolume(kgVol)} <span className="dim">kg</span>
                  </>
                )}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
