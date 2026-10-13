/**
 * 스키마 마이그레이션 — 구버전 저장 데이터를 현재 SCHEMA_VERSION 까지 순차 변환.
 *
 * MIGRATIONS[fromVersion] = (old) => next  형태로 각 버전 승급 단계를 정의한다.
 * loadAndMigrate 는 raw 의 schemaVersion 부터 SCHEMA_VERSION 까지 단계를 차례로
 * 적용한 뒤 validateStore 로 최종 검증한다.
 */

import type { RootStore } from "../domain/types.js";
import { SCHEMA_VERSION } from "../domain/types.js";
import {
  PRESET_EXERCISES,
  PRESET_PROGRAMS,
  PRESET_TEMPLATES,
} from "../domain/presets.js";
import { StorageError, validateStore } from "./validate.js";

/** v1 시절 3일 분할 상체 템플릿 id → 단일 "upper" 로 흡수(v2). */
const V1_UPPER_DAY_IDS = new Set(["upper_day1", "upper_day2", "upper_day3"]);

/**
 * v1 → v2 마이그레이션.
 *
 * 도메인 정정: 상체는 Day1/2/3 3일 분할이 아니라 한 세션에서 상체 종목 전부를
 * 수행한다. 따라서:
 *  - programs/templates 를 최신 프리셋으로 교체(구 upper_day1/2/3 제거, 단일 "upper" 도입).
 *  - 기존 세션 중 templateId 가 upper_day1/2/3 이던 것은 "upper" 로 리맵.
 *    (세션의 exercises/sets 등 과거 기록은 그대로 보존 — 리맵은 templateId 만.)
 *  - lower_day 및 그 밖의 세션 필드, weightState/settings 는 손대지 않는다.
 */
function migrateV1toV2(old: any): any {
  const rawSessions = Array.isArray(old?.sessions) ? old.sessions : [];
  const sessions = rawSessions.map((s: any) => {
    if (s && typeof s === "object" && V1_UPPER_DAY_IDS.has(s.templateId)) {
      return { ...s, templateId: "upper" };
    }
    return s;
  });

  return {
    ...old,
    schemaVersion: 2,
    // 구 3일 분할 템플릿을 완전히 대체(단일 "upper" + lower_day).
    programs: { ...PRESET_PROGRAMS },
    templates: { ...PRESET_TEMPLATES },
    sessions,
  };
}

/**
 * v2 → v3 마이그레이션.
 *
 * 정의(종목/템플릿/프로그램) 프리셋을 최신으로 재동기화한다:
 *  - 종목 순서 재배치(벤치→트라이셉스 / 풀업→푸쉬업 / 등당기기→밀리터리 페어 인접).
 *  - "바벨로우" → "등 당기기" 종목명 변경.
 * 사용자 데이터(sessions/weightState/settings)는 손대지 않는다 — 정의만 갱신.
 * 세션은 여전히 동일한 종목 id 를 참조하므로 과거 기록 해석이 보존된다.
 */
function migrateV2toV3(old: any): any {
  return {
    ...old,
    schemaVersion: 3,
    exercises: { ...PRESET_EXERCISES },
    programs: { ...PRESET_PROGRAMS },
    templates: { ...PRESET_TEMPLATES },
  };
}

/**
 * 버전별 마이그레이션 함수 맵.
 * 키 = 변환의 출발 버전(fromVersion), 값 = fromVersion → fromVersion+1 변환기.
 */
export const MIGRATIONS: Record<number, (old: any) => any> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
};

/**
 * raw(unknown, 보통 파싱된 JSON)를 현재 스키마로 마이그레이션 후 검증한다.
 *
 * 규칙:
 * - raw 가 객체가 아니면 StorageError.
 * - schemaVersion 이 없으면 1 로 간주(초기 릴리스).
 * - fromVersion < SCHEMA_VERSION 인 동안 MIGRATIONS[v] 를 순차 적용.
 *   해당 단계 함수가 없으면 StorageError(마이그레이션 경로 누락).
 * - fromVersion > SCHEMA_VERSION(미래 버전)이면 StorageError(다운그레이드 불가).
 * - 최종적으로 validateStore 통과분만 반환.
 */
export function loadAndMigrate(raw: unknown): RootStore {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new StorageError("마이그레이션 실패: 루트가 객체가 아님");
  }

  let current = raw as Record<string, unknown>;
  let version =
    typeof current.schemaVersion === "number" &&
    Number.isFinite(current.schemaVersion)
      ? current.schemaVersion
      : 1;

  if (version > SCHEMA_VERSION) {
    throw new StorageError(
      `마이그레이션 실패: 데이터 버전(${version})이 앱 버전(${SCHEMA_VERSION})보다 높음 — 다운그레이드 불가`,
    );
  }

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new StorageError(
        `마이그레이션 실패: v${version} → v${version + 1} 경로 누락`,
      );
    }
    current = step(current) as Record<string, unknown>;
    const nextVersion =
      typeof current.schemaVersion === "number" &&
      Number.isFinite(current.schemaVersion)
        ? current.schemaVersion
        : version + 1;
    // 방어: 마이그레이션이 버전을 올리지 않으면 무한루프 → 강제 증가로 탈출 방지 대신 오류.
    if (nextVersion <= version) {
      throw new StorageError(
        `마이그레이션 실패: v${version} 단계가 버전을 올리지 않음`,
      );
    }
    version = nextVersion;
  }

  // 마이그레이션 후 schemaVersion 을 최종 버전으로 확정(누락/오래된 값 정규화).
  // validateStore 는 schemaVersion: number 를 필수로 요구하므로 여기서 보장한다.
  current = { ...current, schemaVersion: SCHEMA_VERSION };

  return validateStore(current);
}
