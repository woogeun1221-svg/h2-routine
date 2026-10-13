/**
 * useProgram — 특정 프로그램(상체/하체)의 파생 데이터를 스토어에서 뽑아낸다.
 *
 * 주어진 ProgramId 로:
 *  - program: Program 정의
 *  - templates: 이 프로그램 rotation 에 속한 SessionTemplate[](순서 보존)
 *  - exercises: 이 프로그램에서 등장하는 ExerciseDef[](템플릿 순서·중복 제거)
 *  - sessions: 이 프로그램의 세션만 필터(localDate 오름차순)
 *
 * store 는 참조가 안정적이므로(setState 시에만 교체) 파생은 useMemo 로 캐시한다.
 */

import { useMemo } from "react";
import type {
  ExerciseDef,
  Program,
  ProgramId,
  SessionTemplate,
  WorkoutSession,
} from "../../domain/types.js";
import { useStore } from "../useStore.js";

/** useProgram 반환 형태. */
export interface ProgramView {
  /** 프로그램 정의(없으면 null — 정상 스토어에선 항상 존재). */
  program: Program | null;
  /** rotation 순서대로의 세션 템플릿. */
  templates: SessionTemplate[];
  /** 이 프로그램에서 등장하는 종목 정의(템플릿 등장 순서, 중복 제거). */
  exercises: ExerciseDef[];
  /** 이 프로그램의 세션(localDate 오름차순, tie-break startedAt). */
  sessions: WorkoutSession[];
}

/**
 * 활성 프로그램의 파생 뷰를 반환한다.
 * @param programId 상체/하체 선택.
 */
export function useProgram(programId: ProgramId): ProgramView {
  const store = useStore();

  return useMemo<ProgramView>(() => {
    const program = store.programs[programId] ?? null;

    const templates: SessionTemplate[] = [];
    if (program) {
      for (const tid of program.rotation) {
        const t = store.templates[tid];
        if (t) templates.push(t);
      }
    }

    const exercises: ExerciseDef[] = [];
    const seen = new Set<string>();
    for (const t of templates) {
      for (const eid of t.exerciseIds) {
        if (seen.has(eid)) continue;
        const def = store.exercises[eid];
        if (def) {
          seen.add(eid);
          exercises.push(def);
        }
      }
    }

    const sessions = store.sessions
      .filter((s) => s.programId === programId)
      .sort((a, b) => {
        if (a.localDate !== b.localDate) {
          return a.localDate < b.localDate ? -1 : 1;
        }
        return a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0;
      });

    return { program, templates, exercises, sessions };
  }, [store, programId]);
}
