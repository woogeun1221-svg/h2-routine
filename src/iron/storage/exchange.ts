/**
 * JSON 내보내기/가져오기 — 기기 이전·백업용 자기기술(envelope) 포맷.
 *
 * envelope: { format:"ironterminal-export", formatVersion, exportedAt, appVersion, data:RootStore }
 * 가져오기는 마이그레이션(loadAndMigrate)을 재사용해 구버전 export 도 수용한다.
 * replace/merge 두 모드 지원. replace 전에는 현재 데이터를 백업(호출측 책임/헬퍼 제공).
 */

import type { ProgramId, RootStore, WorkoutSession } from "../domain/types.js";
import { SCHEMA_VERSION } from "../domain/types.js";
import { loadAndMigrate } from "./migration.js";
import { StorageError, validateStore } from "./validate.js";

/** export 봉투 포맷 식별자. */
export const EXPORT_FORMAT = "ironterminal-export";
/** export 봉투 포맷 버전(스키마 버전과 별개, 봉투 구조 자체의 버전). */
export const EXPORT_FORMAT_VERSION = 1;
/** 앱 버전 문자열(package.json 과 동기, 표시용). */
export const APP_VERSION = "0.1.0";

/** export 봉투 구조. */
export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  exportedAt: string;
  appVersion: string;
  data: RootStore;
}

/** 가져오기 모드: 전체 교체 / 세션·상태 병합. */
export type ImportMode = "replace" | "merge";

/** parseImport 결과. */
export interface ImportResult {
  ok: boolean;
  store?: RootStore;
  error?: string;
  summary?: string;
}

/**
 * RootStore 를 self-describing envelope JSON 문자열로 직렬화한다(들여쓰기 2칸).
 */
export function exportJson(store: RootStore): string {
  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data: store,
  };
  return JSON.stringify(envelope, null, 2);
}

/** 세션 배열을 id 기준으로 병합(들어온 쪽이 우선, localDate→startedAt 순 정렬). */
function mergeSessions(
  base: WorkoutSession[],
  incoming: WorkoutSession[],
): WorkoutSession[] {
  const byId = new Map<string, WorkoutSession>();
  for (const s of base) byId.set(s.id, s);
  for (const s of incoming) byId.set(s.id, s); // incoming 우선
  return [...byId.values()].sort((a, b) => {
    if (a.localDate !== b.localDate) return a.localDate < b.localDate ? -1 : 1;
    return a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0;
  });
}

/**
 * incoming 스토어를 current 위에 병합한다.
 * - sessions: id 기준 union(incoming 우선).
 * - exercises/templates/programs/weightState: incoming 을 current 위에 덮어쓰기(키 병합).
 * - settings: 현재 설정(activeProgram/weeklyGoal/bodyweightKg)을 그대로 유지.
 *     (병합은 데이터 합류이지 환경설정 교체가 아니므로 라이브 설정을 클로버링하지 않는다.
 *      설정 전체 교체는 replace 모드에서만 일어난다.)
 * - timestamps: createdAt 은 더 이른 값 유지, updatedAt 은 now.
 * 병합 결과도 validateStore 로 최종 검증한다.
 */
function mergeStores(current: RootStore, incoming: RootStore): RootStore {
  const merged: RootStore = {
    schemaVersion: SCHEMA_VERSION,
    createdAt:
      current.createdAt < incoming.createdAt
        ? current.createdAt
        : incoming.createdAt,
    updatedAt: new Date().toISOString(),
    exercises: { ...current.exercises, ...incoming.exercises },
    programs: { ...current.programs, ...incoming.programs },
    templates: { ...current.templates, ...incoming.templates },
    sessions: mergeSessions(current.sessions, incoming.sessions),
    weightState: { ...current.weightState, ...incoming.weightState },
    settings: { ...current.settings },
  };
  return validateStore(merged);
}

/**
 * 사람 친화적 요약 문구 생성(가져오기 확인 UI용).
 */
function summarize(store: RootStore, mode: ImportMode): string {
  const sessionCount = store.sessions.length;
  const programs = new Set<ProgramId>();
  for (const s of store.sessions) programs.add(s.programId);
  const progLabel = [...programs].join("+") || "-";
  const modeLabel = mode === "replace" ? "교체" : "병합";
  return `${modeLabel}: 세션 ${sessionCount}개 (프로그램: ${progLabel})`;
}

/**
 * export 텍스트를 파싱·검증한다.
 *
 * 절차:
 * 1) JSON 파싱(실패 시 error).
 * 2) format 확인(EXPORT_FORMAT 이 아니면 거부). 봉투가 아닌 raw RootStore 도 허용(관용).
 * 3) data 를 loadAndMigrate 로 구버전 승급 + validateStore.
 * 4) mode 에 따라: merge 면 current 와 병합(current 필수), replace 면 그대로.
 *
 * 반환은 throw 하지 않고 { ok, store?, error?, summary? } 로 감싼다.
 * (replace 전 백업은 호출측/store.ts 에서 수행 — 여기서는 순수 파싱/병합만.)
 */
export function parseImport(
  text: string,
  mode: ImportMode = "replace",
  current?: RootStore,
): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 파싱 실패: 올바른 JSON 이 아닙니다." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "형식 오류: 최상위가 객체가 아닙니다." };
  }

  const obj = parsed as Record<string, unknown>;

  // 봉투인지 raw 스토어인지 판별.
  let rawData: unknown;
  const looksLikeEnvelope = "format" in obj || "data" in obj;
  if (looksLikeEnvelope) {
    if (obj.format !== EXPORT_FORMAT) {
      return {
        ok: false,
        error: `형식 오류: format 이 "${EXPORT_FORMAT}" 이 아닙니다 (받은 값: ${String(
          obj.format,
        )}).`,
      };
    }
    rawData = obj.data;
  } else {
    // 봉투가 아니면 raw RootStore 로 관용 처리.
    rawData = obj;
  }

  let incoming: RootStore;
  try {
    incoming = loadAndMigrate(rawData);
  } catch (e) {
    const msg = e instanceof StorageError ? e.message : String(e);
    return { ok: false, error: `가져오기 데이터 검증 실패: ${msg}` };
  }

  if (mode === "merge") {
    if (!current) {
      return {
        ok: false,
        error: "병합 모드에는 현재 스토어(current)가 필요합니다.",
      };
    }
    let mergedStore: RootStore;
    try {
      mergedStore = mergeStores(current, incoming);
    } catch (e) {
      const msg = e instanceof StorageError ? e.message : String(e);
      return { ok: false, error: `병합 실패: ${msg}` };
    }
    return { ok: true, store: mergedStore, summary: summarize(mergedStore, "merge") };
  }

  // replace
  return { ok: true, store: incoming, summary: summarize(incoming, "replace") };
}
