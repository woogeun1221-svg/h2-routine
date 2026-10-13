/**
 * 저장 어댑터 — 브라우저 저장소 접근을 추상화한다.
 *
 * RootStore 는 단일 문자열 blob(JSON)으로 저장한다.
 * 어댑터 인터페이스를 두어 추후 IndexedDB 등으로 교체 가능하게 한다.
 * 브라우저 API(localStorage)는 이 파일에서만 직접 만진다.
 */

/** localStorage 단일 blob 키. */
export const STORAGE_KEY = "ironterminal:v1";

/**
 * 저장소 어댑터 계약.
 * - read: 저장된 원본 문자열(없으면 null).
 * - write: 문자열 blob 저장.
 * - clear: 저장 삭제.
 * 부가 키(백업 등) 접근을 위해 readKey/writeKey 도 노출한다.
 */
export interface StorageAdapter {
  /** 메인 blob 읽기(없으면 null). */
  read(): string | null;
  /** 메인 blob 쓰기. */
  write(value: string): void;
  /** 메인 blob 삭제. */
  clear(): void;
  /** 임의 키 읽기(백업 조회 등). */
  readKey(key: string): string | null;
  /**
   * 임의 키 쓰기(백업 저장 등).
   * @returns 성공 여부. 저장소 비가용·쿼터 초과 등으로 실패하면 false.
   *   (백업 경로에서 실패를 반드시 감지해야 하므로 조용히 삼키지 않고 신호한다.)
   */
  writeKey(key: string, value: string): boolean;
  /**
   * 저장된 모든 키 목록(백업 프루닝 등). 미지원 어댑터는 생략 가능(옵셔널).
   */
  keys?(): string[];
  /** 임의 키 삭제(백업 프루닝 등). 미지원 어댑터는 생략 가능(옵셔널). */
  removeKey?(key: string): void;
}

/**
 * localStorage 기반 어댑터.
 * 모든 접근을 try/catch 로 감싼다(사생활 모드·쿼터 초과·SSR 환경 방어).
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly key: string;

  constructor(key: string = STORAGE_KEY) {
    this.key = key;
  }

  /** localStorage 참조를 안전하게 얻는다(없으면 null). */
  private ls(): Storage | null {
    try {
      if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
        return (globalThis as { localStorage?: Storage }).localStorage ?? null;
      }
    } catch {
      // 접근 자체가 예외를 던지는 환경(일부 사생활 모드)
    }
    return null;
  }

  read(): string | null {
    return this.readKey(this.key);
  }

  write(value: string): void {
    this.writeKey(this.key, value);
  }

  clear(): void {
    const store = this.ls();
    if (!store) return;
    try {
      store.removeItem(this.key);
    } catch {
      // 무시(비가용 저장소)
    }
  }

  readKey(key: string): string | null {
    const store = this.ls();
    if (!store) return null;
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  }

  writeKey(key: string, value: string): boolean {
    const store = this.ls();
    if (!store) return false;
    try {
      store.setItem(key, value);
      return true;
    } catch {
      // 쿼터 초과 등: 데이터는 메모리 상태로 유지되나 영속엔 실패. 실패를 신호한다.
      return false;
    }
  }

  keys(): string[] {
    const store = this.ls();
    if (!store) return [];
    try {
      const out: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k != null) out.push(k);
      }
      return out;
    } catch {
      return [];
    }
  }

  removeKey(key: string): void {
    const store = this.ls();
    if (!store) return;
    try {
      store.removeItem(key);
    } catch {
      // 무시(비가용 저장소)
    }
  }
}

/**
 * 테스트/비브라우저용 인메모리 어댑터.
 * StorageAdapter 계약을 그대로 만족한다.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>();
  private readonly key: string;

  constructor(key: string = STORAGE_KEY) {
    this.key = key;
  }

  read(): string | null {
    return this.readKey(this.key);
  }

  write(value: string): void {
    this.writeKey(this.key, value);
  }

  clear(): void {
    this.map.delete(this.key);
  }

  readKey(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  writeKey(key: string, value: string): boolean {
    this.map.set(key, value);
    return true;
  }

  keys(): string[] {
    return [...this.map.keys()];
  }

  removeKey(key: string): void {
    this.map.delete(key);
  }
}
