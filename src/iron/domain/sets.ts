/**
 * 세트 수 조정 규칙 — 종목 기본값(def.setCount)은 출발점일 뿐이고, 그날 몇 세트를 했는지는
 * 기록 화면에서 더하고 빼며, 다음 기록은 마지막에 실제로 한 세트 수로 시작한다.
 * (2026-10-14 사용자 요청: "벤치프레스를 4번 할 수도, 3번 할 수도 있다")
 */

import type { ExerciseDef, ExerciseLog } from "./types.js";

export const MIN_SETS = 1;
export const MAX_SETS = 12;

export function clampSetCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_SETS;
  return Math.min(MAX_SETS, Math.max(MIN_SETS, Math.round(n)));
}

/** 기록 화면 초기 세트 수: 지난 기록이 있으면 그때 한 세트 수, 없으면 종목 기본값. */
export function initialSetCount(def: ExerciseDef, lastLog: ExerciseLog | null): number {
  const n = lastLog !== null && lastLog.sets.length > 0 ? lastLog.sets.length : def.setCount;
  return clampSetCount(n);
}

/** 세트 하나 추가(상한 MAX_SETS). make 는 마지막 세트를 받아 새 세트를 만든다. */
export function appendSet<T>(sets: readonly T[], make: (last: T | undefined) => T): T[] {
  if (sets.length >= MAX_SETS) return [...sets];
  return [...sets, make(sets[sets.length - 1])];
}

/** index 세트 제거(하한 MIN_SETS 아래로는 안 내려간다). */
export function removeSetAt<T>(sets: readonly T[], index: number): T[] {
  if (sets.length <= MIN_SETS || index < 0 || index >= sets.length) return [...sets];
  return sets.filter((_, i) => i !== index);
}
