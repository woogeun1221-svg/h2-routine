/**
 * useStore — 싱글턴 Store 를 React 에 바인딩하는 브리지.
 *
 * storage/store.ts 의 createStore 로 앱 전역 단일 스토어를 만들고(모듈 싱글턴),
 * useSyncExternalStore 로 컴포넌트가 상태 변경을 구독하게 한다.
 *
 * - store: 액션 계층(useAppState)에서 setState/getState 를 직접 쓰기 위한 인스턴스.
 * - useStore(): 전체 RootStore 를 구독한다.
 * - useStoreSelector(sel): 파생값만 구독한다(참조 안정성은 selector 반환값에 의존).
 *
 * getState 는 항상 동일 참조를 반환하므로(setState 시에만 교체) getServerSnapshot
 * 으로도 재사용 가능 — SSR/프리렌더에서 안전.
 */

import { useSyncExternalStore } from "react";
import type { RootStore } from "../domain/types.js";
import { LocalStorageAdapter } from "../storage/adapter.js";
import { createStore, type Store } from "../storage/store.js";

/**
 * 앱 전역 단일 스토어(모듈 싱글턴).
 * LocalStorageAdapter 로 브라우저 localStorage 에 영속한다.
 */
export const store: Store = createStore(new LocalStorageAdapter());

/**
 * 전체 RootStore 를 구독한다.
 * 상태가 바뀔 때마다(setState/멀티탭 storage 이벤트) 리렌더된다.
 */
export function useStore(): RootStore {
  return useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
}

/**
 * RootStore 에서 파생값만 선택해 구독한다.
 *
 * 주의: selector 는 원시값 또는 참조가 안정적인 값을 반환해야 한다
 * (매 호출 새 객체/배열을 만들면 무한 리렌더 위험). 리스트 파생은 호출측에서
 * useMemo 로 감싸거나, 여기서 반환한 안정 참조를 조합해 사용할 것.
 */
export function useStoreSelector<T>(selector: (state: RootStore) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
