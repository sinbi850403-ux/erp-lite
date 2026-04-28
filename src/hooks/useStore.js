/**
 * useStore.js - store.js 브리지 훅
 *
 * React 컴포넌트에서 기존 store.js의 getState/setState를 쓸 수 있게 해주는 훅.
 * store.js가 invex:store-updated 이벤트를 dispatch할 때 자동으로 리렌더링됨.
 */
import { useState, useCallback, useEffect } from 'react';
import { getState, setState as storeSetState } from '../store.js';

/**
 * useStore(selector?) - 스토어 상태 읽기 + 자동 구독
 *
 * @param {Function} [selector] - 상태 중 필요한 부분만 추출 (없으면 전체 반환)
 * @returns {[any, Function]} [value, setState]
 *
 * @example
 * // 전체 상태
 * const [state, setState] = useStore();
 *
 * // 특정 값만
 * const [beginnerMode, setState] = useStore(s => s.beginnerMode);
 */
export function useStore(selector) {
  const select = selector || (s => s);

  const [value, setValue] = useState(() => select(getState()));

  useEffect(() => {
    const handler = () => {
      const next = select(getState());
      setValue(prev => Object.is(prev, next) ? prev : next);
    };
    window.addEventListener('invex:store-updated', handler);
    return () => window.removeEventListener('invex:store-updated', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((partial) => {
    storeSetState(partial);
    // invex:store-updated 이벤트가 store.js 내부에서 dispatch됨 → 자동 리렌더
  }, []);

  return [value, update];
}

/**
 * useStoreState() - 전체 스토어 상태를 React state로 구독
 */
export function useStoreState() {
  return useStore();
}
