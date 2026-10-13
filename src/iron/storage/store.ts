/**
 * 리액티브 스토어 — RootStore 를 어댑터에 영속하고 구독자에게 통지한다.
 *
 * createStore(adapter):
 *   - getState(): 현재 상태(불변으로 취급).
 *   - setState(updater): updater(prev)=>next → updatedAt 갱신 → 검증 → JSON 직렬화 → write → notify.
 *   - subscribe(fn): 상태 변경 시 호출, unsubscribe 반환.
 *
 * 로딩:
 *   - 최초 read 가 null → initialStore() 시드 후 write.
 *   - 파싱/마이그레이션/검증 실패 → 원본을 "ironterminal:corrupt:<ts>" 로 백업하고 initialStore() 폴백.
 *     (데이터 절대 소실 금지: 손상 원본은 항상 보존.)
 *
 * 멀티탭: window "storage" 이벤트 구독 → 다른 탭의 쓰기를 감지해 재로딩·통지.
 * React 바인딩(useSyncExternalStore)은 UI 계층(useStore.ts)에서 subscribe/getState 로 연결.
 */

import type { RootStore } from "../domain/types.js";
import { SCHEMA_VERSION } from "../domain/types.js";
import { initialStore } from "../domain/presets.js";
import { STORAGE_KEY, type StorageAdapter } from "./adapter.js";
import { loadAndMigrate } from "./migration.js";
import { validateStore } from "./validate.js";

/** 손상 데이터 백업 키 접두사. */
export const CORRUPT_KEY_PREFIX = "ironterminal:corrupt:";

/** 보존할 손상 백업 최대 개수(초과분은 오래된 것부터 프루닝). */
export const CORRUPT_BACKUP_KEEP = 3;

/** 같은 ms 내 백업 키 충돌 방지용 단조 증가 카운터(모듈 전역). */
let corruptBackupCounter = 0;

/** 스토어 공개 인터페이스. */
export interface Store {
  /** 현재 상태(불변). */
  getState(): RootStore;
  /** updater 로 상태를 변환·영속·통지한다. */
  setState(updater: (prev: RootStore) => RootStore): void;
  /** 변경 구독. unsubscribe 함수 반환. */
  subscribe(listener: () => void): () => void;
  /** 멀티탭 리스너 해제(테스트/정리용). */
  dispose(): void;
}

/**
 * loadOrRecover 결과.
 * - state: 항상 유효(검증 통과)한 인메모리 상태.
 * - safeToRewriteMain: 메인 blob 을 정규화된 형태로 덮어써도 데이터 소실이 없는가.
 *     정상 로딩이면 true. 손상 복구 시에는 "손상 원본 백업이 확인된 경우에만" true.
 *     백업을 확신할 수 없으면 false → 호출측은 메인 blob 을 절대 덮어쓰지 않아
 *     손상 원본이 디스크에 그대로 보존된다(데이터 절대 소실 금지 불변식).
 */
interface RecoverResult {
  state: RootStore;
  safeToRewriteMain: boolean;
}

/**
 * 원본 문자열 → RootStore 로 로딩. 실패 시 손상 백업 후 initialStore() 폴백.
 * 반환된 state 는 항상 유효(검증 통과)하다.
 */
function loadOrRecover(adapter: StorageAdapter, raw: string): RecoverResult {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return { state: loadAndMigrate(parsed), safeToRewriteMain: true };
  } catch {
    // 손상: 원본을 백업하고, 백업이 실제로 영속됐는지 읽어 확인한 뒤에만
    // 메인 blob 덮어쓰기를 허용한다.
    // 키는 ISO 타임스탬프 + 단조 카운터로 같은 ms 내 충돌을 방지한다.
    corruptBackupCounter += 1;
    const backupKey =
      CORRUPT_KEY_PREFIX +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      String(corruptBackupCounter);
    let backedUp = false;
    try {
      const wrote = adapter.writeKey(backupKey, raw);
      // 쓰기 성공 신호가 왔더라도 실제 read-back 으로 재확인(쿼터/사일런트 손실 방어).
      backedUp = wrote && adapter.readKey(backupKey) === raw;
    } catch {
      // 백업 경로 자체가 예외를 던지는 환경: 백업 미확인으로 처리.
      backedUp = false;
    }
    // 백업이 무한정 쌓여 쿼터를 잠식하지 않도록 최신 N 개만 남기고 프루닝(best-effort).
    if (backedUp) pruneCorruptBackups(adapter);
    // 백업이 확인되지 않으면 메인 blob 을 건드리지 않는다(손상 원본 보존).
    return { state: initialStore(), safeToRewriteMain: backedUp };
  }
}

/**
 * 손상 백업(CORRUPT_KEY_PREFIX) 을 최신 CORRUPT_BACKUP_KEEP 개만 남기고 삭제한다.
 * 키 열거/삭제를 지원하지 않는 어댑터에서는 조용히 no-op(옵셔널 기능).
 * 키에 포함된 타임스탬프+카운터가 문자열 오름차순으로 시간 순서와 일치하므로
 * 단순 정렬 후 앞쪽(오래된) 초과분을 제거한다.
 */
function pruneCorruptBackups(adapter: StorageAdapter): void {
  if (!adapter.keys || !adapter.removeKey) return;
  try {
    const backups = adapter
      .keys()
      .filter((k) => k.startsWith(CORRUPT_KEY_PREFIX))
      .sort();
    const excess = backups.length - CORRUPT_BACKUP_KEEP;
    for (let i = 0; i < excess; i++) {
      const k = backups[i];
      if (k !== undefined) adapter.removeKey(k);
    }
  } catch {
    // 프루닝 실패는 치명적이지 않다(백업 자체는 이미 보존됨).
  }
}

/** RootStore 를 봉투 없이 그대로 직렬화(메인 blob 형식). */
function serialize(store: RootStore): string {
  return JSON.stringify(store);
}

/**
 * 스토어 생성.
 * @param adapter 저장 어댑터(LocalStorageAdapter 등).
 */
export function createStore(adapter: StorageAdapter): Store {
  let state: RootStore;

  // ── 초기 로딩 ──
  const raw = adapter.read();
  if (raw === null) {
    state = initialStore();
    adapter.write(serialize(state));
  } else {
    const recovered = loadOrRecover(adapter, raw);
    state = recovered.state;
    // 마이그레이션/복구가 일어났다면 정규화된 형태로 다시 기록(멱등).
    // 단, 손상 복구인데 백업이 확인되지 않았다면 메인 blob 을 덮어쓰지 않는다
    // (손상 원본을 디스크에 보존 — 데이터 절대 소실 금지).
    if (recovered.safeToRewriteMain) {
      adapter.write(serialize(state));
    }
  }

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const l of [...listeners]) {
      try {
        l();
      } catch {
        // 개별 리스너 오류가 전체 통지를 막지 않도록 격리
      }
    }
  }

  function getState(): RootStore {
    return state;
  }

  function setState(updater: (prev: RootStore) => RootStore): void {
    const next = updater(state);
    const stamped: RootStore = {
      ...next,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };
    // 검증: 잘못된 상태가 저장·전파되지 않도록 방어(throw 시 이전 상태 유지).
    const validated = validateStore(stamped);
    state = validated;
    adapter.write(serialize(validated));
    notify();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  // ── 멀티탭 동기화 ──
  // 다른 탭이 STORAGE_KEY 를 바꾸면 storage 이벤트가 이 탭에 도착한다.
  // (같은 탭의 setState 는 이벤트를 발생시키지 않으므로 루프 없음.)
  let storageHandler: ((e: StorageEvent) => void) | null = null;
  const hasWindow =
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { addEventListener?: unknown }).addEventListener ===
      "function";

  if (hasWindow) {
    storageHandler = (e: StorageEvent) => {
      // e.key === null 은 다른 탭이 localStorage.clear() 를 호출한 경우다.
      // 이때 메인 blob 이 사라졌으므로 이 탭도 프리셋으로 리셋해 스테일 상태를 버린다.
      if (e.key === null) {
        state = initialStore();
        notify();
        return;
      }
      if (e.key !== STORAGE_KEY) return;
      const incoming = adapter.read();
      // 다른 탭이 메인 키만 제거(removeItem)한 경우도 리셋으로 처리.
      if (incoming === null) {
        state = initialStore();
        notify();
        return;
      }
      try {
        const parsed = JSON.parse(incoming) as unknown;
        state = loadAndMigrate(parsed);
        notify();
      } catch {
        // 다른 탭이 손상 데이터를 넣은 경우: 현재 탭의 유효 상태를 유지(재기록하지 않음).
      }
    };
    (globalThis as unknown as Window).addEventListener(
      "storage",
      storageHandler as EventListener,
    );
  }

  function dispose(): void {
    listeners.clear();
    if (hasWindow && storageHandler) {
      (globalThis as unknown as Window).removeEventListener(
        "storage",
        storageHandler as EventListener,
      );
      storageHandler = null;
    }
  }

  return { getState, setState, subscribe, dispose };
}

/**
 * OS eviction 방지용 영속 저장 요청(best-effort).
 * navigator.storage.persist() 를 안전하게 호출한다.
 * @returns 승인 여부(Promise<boolean>). 미지원/실패 시 false.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (nav?.storage?.persist) {
      return await nav.storage.persist();
    }
  } catch {
    // 미지원 또는 사용자 거부
  }
  return false;
}
