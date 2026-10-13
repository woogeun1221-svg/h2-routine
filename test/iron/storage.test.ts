/**
 * 저장 계층 테스트 — migration 순차/누락, validate 성공·실패, corrupt 폴백.
 */

import { describe, it, expect } from "vitest";
import { initialStore } from "../../src/iron/domain/presets.js";
import { SCHEMA_VERSION } from "../../src/iron/domain/types.js";
import type { RootStore } from "../../src/iron/domain/types.js";
import {
  MemoryStorageAdapter,
  STORAGE_KEY,
} from "../../src/iron/storage/adapter.js";
import { StorageError, validateStore } from "../../src/iron/storage/validate.js";
import { loadAndMigrate, MIGRATIONS } from "../../src/iron/storage/migration.js";
import {
  createStore,
  CORRUPT_KEY_PREFIX,
  CORRUPT_BACKUP_KEEP,
} from "../../src/iron/storage/store.js";

/** 유효한 기준 스토어 사본. */
function freshStore(): RootStore {
  return JSON.parse(JSON.stringify(initialStore())) as RootStore;
}

/** 유효한 세션 하나를 만든다(교차참조 통과용). */
function sampleSession(id: string): RootStore["sessions"][number] {
  return {
    id,
    programId: "upper",
    templateId: "upper",
    localDate: "2026-06-01",
    startedAt: "2026-06-01T10:00:00.000Z",
    completedAt: "2026-06-01T11:00:00.000Z",
    exercises: [
      {
        exerciseId: "bench_press",
        kindAtLog: "weighted",
        plannedWeightKg: 60,
        sets: [
          { setIndex: 0, weightKg: 60, reps: 12, completedAt: "2026-06-01T10:05:00.000Z" },
        ],
      },
    ],
  };
}

describe("validateStore", () => {
  it("유효한 초기 스토어를 통과시킨다", () => {
    const s = freshStore();
    const out = validateStore(s);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.sessions).toEqual([]);
    expect(out.settings.activeProgram).toBe("upper");
  });

  it("세션 포함 스토어를 통과시킨다(교차참조 OK)", () => {
    const s = freshStore();
    s.sessions.push(sampleSession("s1"));
    const out = validateStore(s);
    expect(out.sessions.length).toBe(1);
  });

  it("루트가 객체가 아니면 StorageError", () => {
    expect(() => validateStore(null)).toThrow(StorageError);
    expect(() => validateStore(42)).toThrow(StorageError);
    expect(() => validateStore([])).toThrow(StorageError);
  });

  it("필수 필드(createdAt) 누락 시 StorageError", () => {
    const s: any = freshStore();
    delete s.createdAt;
    expect(() => validateStore(s)).toThrow(StorageError);
  });

  it("sessions 가 배열이 아니면 StorageError", () => {
    const s: any = freshStore();
    s.sessions = { nope: true };
    expect(() => validateStore(s)).toThrow(StorageError);
  });

  it("settings.unit 이 kg 가 아니면 StorageError", () => {
    const s: any = freshStore();
    s.settings.unit = "lb";
    expect(() => validateStore(s)).toThrow(StorageError);
  });

  it("세션이 존재하지 않는 templateId 를 참조하면 StorageError", () => {
    const s = freshStore();
    const sess = sampleSession("s1");
    sess.templateId = "ghost_template";
    s.sessions.push(sess);
    expect(() => validateStore(s)).toThrow(StorageError);
  });

  it("세션이 존재하지 않는 exerciseId 를 참조하면 StorageError", () => {
    const s = freshStore();
    const sess = sampleSession("s1");
    sess.exercises[0]!.exerciseId = "ghost_exercise";
    s.sessions.push(sess);
    expect(() => validateStore(s)).toThrow(StorageError);
  });

  it("결측 optional map(programs/templates/exercises/weightState)은 프리셋 병합으로 복구", () => {
    const s: any = freshStore();
    delete s.programs;
    delete s.templates;
    delete s.exercises;
    delete s.weightState;
    const out = validateStore(s);
    expect(out.programs.upper.rotation).toEqual(["upper"]);
    expect(out.templates.upper).toBeDefined();
    expect(out.exercises.bench_press?.defaultStartWeightKg).toBe(60);
    // weightState 는 정의 기준으로 시드됨
    expect(out.weightState.bench_press?.currentTargetKg).toBe(60);
    expect(out.weightState.pullup?.currentTargetKg).toBeNull();
  });

  it("잘못된 weightState.source 는 StorageError", () => {
    const s: any = freshStore();
    s.weightState.bench_press.source = "teleport";
    expect(() => validateStore(s)).toThrow(StorageError);
  });
});

describe("loadAndMigrate", () => {
  it("현재 버전 데이터를 그대로 검증·반환", () => {
    const s = freshStore();
    const out = loadAndMigrate(s);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("schemaVersion 누락 시 v1 로 간주 → 최신으로 승급해 통과", () => {
    const s: any = freshStore();
    delete s.schemaVersion;
    const out = loadAndMigrate(s);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("미래 버전(다운그레이드)은 StorageError", () => {
    const s: any = freshStore();
    s.schemaVersion = SCHEMA_VERSION + 5;
    expect(() => loadAndMigrate(s)).toThrow(StorageError);
  });

  it("루트가 객체가 아니면 StorageError", () => {
    expect(() => loadAndMigrate(null)).toThrow(StorageError);
    expect(() => loadAndMigrate("x")).toThrow(StorageError);
  });

  it("마이그레이션 경로 누락 시 StorageError", () => {
    // 임시로 SCHEMA_VERSION 을 넘어서는 가상의 상황을 재현하기 위해
    // v0 데이터를 v1 으로 올리는 경로가 없다고 가정: schemaVersion=0, 최신=1, MIGRATIONS[0] 없음.
    const s: any = freshStore();
    s.schemaVersion = 0;
    // MIGRATIONS[0] 이 정의돼 있지 않은 한 경로 누락으로 throw 되어야 한다.
    if (!MIGRATIONS[0]) {
      expect(() => loadAndMigrate(s)).toThrow(StorageError);
    }
  });

  it("순차 마이그레이션: 등록된 단계 체인을 순서대로 적용한다", () => {
    // 실제 스키마를 오염시키지 않도록 MIGRATIONS[0] 을 임시로 스텁.
    // v0→v1 스텁 후 실제 v1→v2 가 이어져 최종 SCHEMA_VERSION 까지 승급되어야 한다.
    const original0 = MIGRATIONS[0];
    try {
      // v0 → v1 단계를 임시 등록: marker 필드를 추가하고 schemaVersion 을 올린다.
      (MIGRATIONS as Record<number, (o: any) => any>)[0] = (old: any) => ({
        ...old,
        schemaVersion: 1,
        __migratedFrom0: true,
      });
      const s: any = freshStore();
      s.schemaVersion = 0;
      const out = loadAndMigrate(s) as RootStore & { __migratedFrom0?: boolean };
      // 체인 v0→v1→v2 가 끝까지 적용되어 최신 버전에 도달.
      expect(out.schemaVersion).toBe(SCHEMA_VERSION);
      // 검증기가 알 수 없는 잉여 필드는 제거하므로 최종 결과엔 마커가 남지 않는다.
      expect((out as any).__migratedFrom0).toBeUndefined();
      // v1→v2 단계가 단일 상체 템플릿을 심었는지 확인.
      expect(out.templates.upper).toBeDefined();
      expect(out.programs.upper.rotation).toEqual(["upper"]);
    } finally {
      if (original0 === undefined) delete (MIGRATIONS as any)[0];
      else (MIGRATIONS as any)[0] = original0;
    }
  });

  it("v1→v2: upper_day2 세션 templateId 를 upper 로 리맵하고 3일 분할 템플릿을 제거한다", () => {
    // v1 시절 스토어: 3일 분할 상체 템플릿 + upper_day2 로 기록된 세션.
    const v1: any = freshStore();
    v1.schemaVersion = 1;
    v1.templates = {
      upper_day1: {
        id: "upper_day1",
        label: "Day 1",
        shortLabel: "Day 1",
        exerciseIds: ["bench_press", "triceps"],
      },
      upper_day2: {
        id: "upper_day2",
        label: "Day 2",
        shortLabel: "Day 2",
        exerciseIds: ["pullup", "pushup"],
      },
      upper_day3: {
        id: "upper_day3",
        label: "Day 3",
        shortLabel: "Day 3",
        exerciseIds: ["row", "military_press"],
      },
      lower_day: {
        id: "lower_day",
        label: "하체 · 스쿼트",
        shortLabel: "스쿼트",
        exerciseIds: ["squat"],
      },
    };
    v1.programs = {
      upper: {
        id: "upper",
        label: "상체",
        rotation: ["upper_day1", "upper_day2", "upper_day3"],
      },
      lower: { id: "lower", label: "하체", rotation: ["lower_day"] },
    };
    v1.sessions = [
      {
        id: "old-upper",
        programId: "upper",
        templateId: "upper_day2",
        localDate: "2026-05-01",
        startedAt: "2026-05-01T10:00:00.000Z",
        completedAt: "2026-05-01T11:00:00.000Z",
        exercises: [
          {
            exerciseId: "pullup",
            kindAtLog: "bodyweight",
            plannedWeightKg: null,
            sets: [
              {
                setIndex: 0,
                weightKg: null,
                reps: 12,
                completedAt: "2026-05-01T10:05:00.000Z",
              },
            ],
          },
        ],
      },
      {
        id: "old-lower",
        programId: "lower",
        templateId: "lower_day",
        localDate: "2026-05-02",
        startedAt: "2026-05-02T10:00:00.000Z",
        completedAt: "2026-05-02T11:00:00.000Z",
        exercises: [
          {
            exerciseId: "squat",
            kindAtLog: "weighted",
            plannedWeightKg: 60,
            sets: [
              {
                setIndex: 0,
                weightKg: 60,
                reps: 12,
                completedAt: "2026-05-02T10:05:00.000Z",
              },
            ],
          },
        ],
      },
    ];

    const out = loadAndMigrate(v1);

    // 스키마 버전 승급(v1 → 최신).
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    // 단일 "upper" 템플릿 존재, 구 3일 분할 템플릿은 제거.
    expect(out.templates.upper).toBeDefined();
    expect(out.templates.upper_day1).toBeUndefined();
    expect(out.templates.upper_day2).toBeUndefined();
    expect(out.templates.upper_day3).toBeUndefined();
    expect(out.programs.upper.rotation).toEqual(["upper"]);
    // upper_day2 세션은 upper 로 리맵, 과거 exercises/sets 는 보존.
    const upperSession = out.sessions.find((s) => s.id === "old-upper");
    expect(upperSession?.templateId).toBe("upper");
    expect(upperSession?.exercises[0]?.exerciseId).toBe("pullup");
    expect(upperSession?.exercises[0]?.sets[0]?.reps).toBe(12);
    // lower_day 세션은 그대로.
    const lowerSession = out.sessions.find((s) => s.id === "old-lower");
    expect(lowerSession?.templateId).toBe("lower_day");
  });

  it("v2→v3: 종목 정의를 프리셋으로 재동기화(페어 순서·등 당기기)하되 사용자 데이터는 보존한다", () => {
    // v2 시절 스토어: 구 종목 순서 + "바벨로우" 이름 + 사용자 세션/weightState.
    const v2: any = freshStore();
    v2.schemaVersion = 2;
    // 구(뒤섞인) 상체 종목 순서 & 옛 이름 재현.
    v2.templates = {
      upper: {
        id: "upper",
        label: "상체",
        shortLabel: "상체",
        exerciseIds: [
          "bench_press",
          "pullup",
          "row",
          "military_press",
          "triceps",
          "pushup",
        ],
      },
      lower_day: {
        id: "lower_day",
        label: "하체 · 스쿼트",
        shortLabel: "스쿼트",
        exerciseIds: ["squat"],
      },
    };
    v2.exercises.row.name = "바벨로우";
    // 사용자 데이터: 세션 + 조정된 weightState.
    v2.sessions = [sampleSession("keep-me")];
    v2.weightState.bench_press = {
      currentTargetKg: 72.5,
      source: "auto_bump",
      updatedAt: "2026-06-10T00:00:00.000Z",
    };

    const out = loadAndMigrate(v2);

    // 스키마 버전 승급.
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    // 상체 종목 순서가 새 페어 배치로 재동기화됐다.
    expect(out.templates.upper?.exerciseIds).toEqual([
      "bench_press",
      "triceps",
      "pullup",
      "pushup",
      "row",
      "military_press",
    ]);
    // "바벨로우" → "등 당기기" 로 이름 변경.
    expect(out.exercises.row?.name).toBe("등 당기기");
    // 사용자 세션은 그대로 보존.
    expect(out.sessions.length).toBe(1);
    expect(out.sessions[0]?.id).toBe("keep-me");
    // weightState 도 손대지 않음(사용자 조정 무게 유지).
    expect(out.weightState.bench_press?.currentTargetKg).toBe(72.5);
    expect(out.weightState.bench_press?.source).toBe("auto_bump");
  });
});

describe("createStore", () => {
  it("최초 read 가 null 이면 initialStore 시드 후 기록", () => {
    const adapter = new MemoryStorageAdapter();
    const store = createStore(adapter);
    expect(store.getState().sessions).toEqual([]);
    // 어댑터에 기록됐는지 확인
    expect(adapter.read()).not.toBeNull();
    store.dispose();
  });

  it("setState 는 updatedAt 갱신·검증·기록·통지한다", () => {
    const adapter = new MemoryStorageAdapter();
    const store = createStore(adapter);
    const before = store.getState().updatedAt;

    let notified = 0;
    const unsub = store.subscribe(() => {
      notified++;
    });

    store.setState((prev) => ({
      ...prev,
      sessions: [...prev.sessions, sampleSession("s1")],
    }));

    expect(notified).toBe(1);
    expect(store.getState().sessions.length).toBe(1);
    // updatedAt 은 setState 마다 재스탬프된다(단조 비감소; 동일 ms 클럭 충돌 허용).
    expect(store.getState().updatedAt >= before).toBe(true);
    expect(Number.isNaN(Date.parse(store.getState().updatedAt))).toBe(false);
    // 디스크에도 반영
    const persisted = JSON.parse(adapter.read()!) as RootStore;
    expect(persisted.sessions.length).toBe(1);
    unsub();
    store.dispose();
  });

  it("setState 가 검증 불가 상태를 만들면 throw 하고 이전 상태 유지", () => {
    const adapter = new MemoryStorageAdapter();
    const store = createStore(adapter);
    expect(() =>
      store.setState((prev) => ({ ...prev, sessions: "bad" as any })),
    ).toThrow(StorageError);
    // 이전(빈) 상태 보존
    expect(store.getState().sessions).toEqual([]);
    store.dispose();
  });

  it("corrupt 원본은 백업 후 initialStore 폴백", () => {
    const adapter = new MemoryStorageAdapter();
    adapter.write("{ this is not valid json ::: ");
    const store = createStore(adapter);
    // 폴백된 유효 상태
    expect(store.getState().settings.activeProgram).toBe("upper");
    // 손상 원본이 백업 키로 보존됐는지 확인
    // MemoryStorageAdapter 내부 맵 접근이 없으므로, 백업 키를 재구성하기보다
    // 접두사 스캔 대신 알려진 동작을 검증: 백업 write 가 일어났고 원본 문자열이 어딘가 존재.
    // 여기서는 readKey 로 알 수 없으니, 폴백 후 메인 blob 이 유효 JSON 으로 재기록됐는지 확인.
    const main = adapter.read();
    expect(main).not.toBeNull();
    const reparsed = JSON.parse(main!) as RootStore;
    expect(reparsed.sessions).toEqual([]);
    store.dispose();
  });

  it("corrupt 백업 키가 실제로 기록된다", () => {
    // 백업 키를 확인하기 위해 write 를 가로채는 커스텀 어댑터.
    const seen: string[] = [];
    const adapter = new MemoryStorageAdapter();
    adapter.write("<<<corrupt>>>");
    const origWriteKey = adapter.writeKey.bind(adapter);
    adapter.writeKey = (key: string, value: string): boolean => {
      seen.push(key);
      return origWriteKey(key, value);
    };
    const store = createStore(adapter);
    const backupKeys = seen.filter((k) => k.startsWith(CORRUPT_KEY_PREFIX));
    expect(backupKeys.length).toBeGreaterThanOrEqual(1);
    store.dispose();
  });

  it("백업이 확인되지 않으면 손상 원본을 덮어쓰지 않는다(데이터 소실 금지)", () => {
    // 백업 writeKey 가 실패(false)하는 어댑터: 손상 원본이 메인 키에 그대로 보존돼야 한다.
    const adapter = new MemoryStorageAdapter();
    const CORRUPT = "<<<corrupt-original-do-not-lose>>>";
    adapter.write(CORRUPT);
    const origWriteKey = adapter.writeKey.bind(adapter);
    adapter.writeKey = (key: string, value: string): boolean => {
      if (key.startsWith(CORRUPT_KEY_PREFIX)) return false; // 백업 실패 시뮬레이션
      return origWriteKey(key, value);
    };
    const store = createStore(adapter);
    // 인메모리 상태는 유효한 폴백
    expect(store.getState().settings.activeProgram).toBe("upper");
    // 메인 blob 은 손상 원본 그대로 보존(재기록 금지)
    expect(adapter.read()).toBe(CORRUPT);
    store.dispose();
  });

  it("백업이 확인되면 정규화 폴백을 메인 blob 에 재기록한다", () => {
    const adapter = new MemoryStorageAdapter();
    adapter.write("{ still not json ::: ");
    const store = createStore(adapter);
    // 백업 성공(Memory 어댑터) → 메인 blob 은 유효 JSON 으로 재기록
    const main = adapter.read();
    expect(main).not.toBeNull();
    const reparsed = JSON.parse(main!) as RootStore;
    expect(reparsed.sessions).toEqual([]);
    store.dispose();
  });

  it("연속 손상 복구가 같은 백업 키를 덮어쓰지 않고 각각 보존한다", () => {
    // 같은 어댑터로 반복 복구: 카운터 접미사 덕에 같은 ms 여도 키가 유일해야 한다.
    const adapter = new MemoryStorageAdapter();
    for (let i = 0; i < 2; i++) {
      adapter.write(`<<<corrupt-${i}>>>`);
      const store = createStore(adapter);
      store.dispose();
    }
    const backups = adapter
      .keys()
      .filter((k) => k.startsWith(CORRUPT_KEY_PREFIX));
    // 두 손상 원본이 서로 다른 키로 각각 보존되어야 한다(덮어쓰기 금지).
    const unique = new Set(backups);
    expect(unique.size).toBe(backups.length);
    expect(backups.length).toBeGreaterThanOrEqual(2);
  });

  it("손상 백업은 최신 N개만 남기고 오래된 것을 프루닝한다", () => {
    const adapter = new MemoryStorageAdapter();
    // 넉넉히 KEEP 보다 많은 손상 복구를 유발.
    const rounds = CORRUPT_BACKUP_KEEP + 3;
    for (let i = 0; i < rounds; i++) {
      adapter.write(`<<<corrupt-round-${i}>>>`);
      const store = createStore(adapter);
      store.dispose();
    }
    const backups = adapter
      .keys()
      .filter((k) => k.startsWith(CORRUPT_KEY_PREFIX));
    expect(backups.length).toBe(CORRUPT_BACKUP_KEEP);
  });

  it("STORAGE_KEY 상수는 ironterminal:v1 이다", () => {
    expect(STORAGE_KEY).toBe("ironterminal:v1");
  });
});
