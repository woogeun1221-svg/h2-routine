/**
 * 교환(exchange) 테스트 — export→parseImport 왕복 동일성, 잘못된 format 거부,
 * 구버전 data 마이그레이션, merge/replace 모드.
 */

import { describe, it, expect } from "vitest";
import { initialStore } from "../../src/iron/domain/presets.js";
import { SCHEMA_VERSION } from "../../src/iron/domain/types.js";
import type { RootStore } from "../../src/iron/domain/types.js";
import {
  exportJson,
  parseImport,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
} from "../../src/iron/storage/exchange.js";

function freshStore(): RootStore {
  return JSON.parse(JSON.stringify(initialStore())) as RootStore;
}

function sampleSession(
  id: string,
  localDate: string,
): RootStore["sessions"][number] {
  return {
    id,
    programId: "upper",
    templateId: "upper",
    localDate,
    startedAt: `${localDate}T10:00:00.000Z`,
    completedAt: `${localDate}T11:00:00.000Z`,
    exercises: [
      {
        exerciseId: "bench_press",
        kindAtLog: "weighted",
        plannedWeightKg: 60,
        sets: [
          { setIndex: 0, weightKg: 60, reps: 12, completedAt: `${localDate}T10:05:00.000Z` },
        ],
      },
    ],
  };
}

describe("exportJson", () => {
  it("self-describing 봉투를 들여쓰기 2칸으로 직렬화한다", () => {
    const s = freshStore();
    const text = exportJson(s);
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe(EXPORT_FORMAT);
    expect(parsed.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.data.settings.activeProgram).toBe("upper");
    // 들여쓰기 확인
    expect(text).toContain("\n  ");
  });
});

describe("parseImport 왕복", () => {
  it("export→parseImport(replace) 왕복이 데이터 동일성을 보존한다", () => {
    const s = freshStore();
    s.sessions.push(sampleSession("s1", "2026-06-01"));
    s.sessions.push(sampleSession("s2", "2026-06-03"));

    const text = exportJson(s);
    const result = parseImport(text, "replace");

    expect(result.ok).toBe(true);
    expect(result.store).toBeDefined();
    // 핵심 데이터 동일성(updatedAt 등은 검증기가 보존)
    expect(result.store!.sessions.length).toBe(2);
    expect(result.store!.sessions.map((x) => x.id).sort()).toEqual(["s1", "s2"]);
    expect(result.store!.exercises.bench_press?.defaultStartWeightKg).toBe(60);
    expect(result.store!.settings).toEqual(s.settings);
    expect(result.summary).toContain("교체");
  });

  it("봉투 없는 raw RootStore 도 관용적으로 수용한다", () => {
    const s = freshStore();
    const result = parseImport(JSON.stringify(s), "replace");
    expect(result.ok).toBe(true);
    expect(result.store!.settings.activeProgram).toBe("upper");
  });
});

describe("parseImport 거부", () => {
  it("잘못된 JSON 을 거부한다", () => {
    const result = parseImport("{not json");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("JSON");
  });

  it("잘못된 format 봉투를 거부한다", () => {
    const bad = JSON.stringify({
      format: "some-other-app",
      formatVersion: 1,
      data: freshStore(),
    });
    const result = parseImport(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("format");
  });

  it("data 가 손상된 봉투를 거부한다", () => {
    const bad = JSON.stringify({
      format: EXPORT_FORMAT,
      formatVersion: 1,
      data: { schemaVersion: 1 }, // 필수 필드 없음
    });
    const result = parseImport(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("검증 실패");
  });

  it("미래 버전 data 는 마이그레이션 단계에서 거부", () => {
    const s: any = freshStore();
    s.schemaVersion = 99;
    const bad = JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 1, data: s });
    const result = parseImport(bad);
    expect(result.ok).toBe(false);
  });
});

describe("parseImport 구버전 마이그레이션", () => {
  it("schemaVersion 누락 data 를 v1 로 간주 후 최신으로 승급해 수용", () => {
    const s: any = freshStore();
    delete s.schemaVersion;
    const text = JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 1, data: s });
    const result = parseImport(text, "replace");
    expect(result.ok).toBe(true);
    expect(result.store!.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("결측 optional map 을 가진 구버전 data 를 프리셋 병합으로 복구", () => {
    const s: any = freshStore();
    delete s.programs;
    delete s.weightState;
    const text = JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 1, data: s });
    const result = parseImport(text, "replace");
    expect(result.ok).toBe(true);
    expect(result.store!.programs.upper.rotation).toEqual(["upper"]);
    expect(result.store!.weightState.bench_press?.currentTargetKg).toBe(60);
  });
});

describe("parseImport merge 모드", () => {
  it("current 없이 merge 를 요청하면 실패", () => {
    const s = freshStore();
    const result = parseImport(exportJson(s), "merge");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("current");
  });

  it("세션을 id union 으로 병합한다(incoming 우선)", () => {
    const current = freshStore();
    current.sessions.push(sampleSession("s1", "2026-06-01"));
    current.sessions.push(sampleSession("s2", "2026-06-03"));

    const incoming = freshStore();
    // s2 를 덮어쓰고(다른 날짜) s3 추가
    const s2New = sampleSession("s2", "2026-06-05");
    incoming.sessions.push(s2New);
    incoming.sessions.push(sampleSession("s3", "2026-06-07"));

    const result = parseImport(exportJson(incoming), "merge", current);
    expect(result.ok).toBe(true);
    const ids = result.store!.sessions.map((x) => x.id).sort();
    expect(ids).toEqual(["s1", "s2", "s3"]);
    // s2 는 incoming 값(2026-06-05)로 덮여야 한다
    const merged2 = result.store!.sessions.find((x) => x.id === "s2");
    expect(merged2!.localDate).toBe("2026-06-05");
    // 날짜순 정렬 확인
    const dates = result.store!.sessions.map((x) => x.localDate);
    expect(dates).toEqual([...dates].sort());
    expect(result.summary).toContain("병합");
  });

  it("병합 결과의 createdAt 은 더 이른 값을 유지한다", () => {
    const current = freshStore();
    current.createdAt = "2026-01-01T00:00:00.000Z";
    const incoming = freshStore();
    incoming.createdAt = "2026-05-01T00:00:00.000Z";
    const result = parseImport(exportJson(incoming), "merge", current);
    expect(result.ok).toBe(true);
    expect(result.store!.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("병합은 현재 설정(activeProgram/weeklyGoal/bodyweightKg)을 유지한다(import 로 덮지 않음)", () => {
    const current = freshStore();
    current.settings.activeProgram = "lower";
    current.settings.weeklyGoal = 5;
    current.settings.bodyweightKg = 82;

    const incoming = freshStore();
    incoming.settings.activeProgram = "upper";
    incoming.settings.weeklyGoal = 2;
    incoming.settings.bodyweightKg = 60;

    const result = parseImport(exportJson(incoming), "merge", current);
    expect(result.ok).toBe(true);
    // 라이브 설정이 그대로 보존되어야 한다(병합은 데이터 합류이지 설정 교체가 아님).
    expect(result.store!.settings.activeProgram).toBe("lower");
    expect(result.store!.settings.weeklyGoal).toBe(5);
    expect(result.store!.settings.bodyweightKg).toBe(82);
  });
});
