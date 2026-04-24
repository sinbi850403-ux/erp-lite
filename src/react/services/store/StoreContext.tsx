import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  getStoreSnapshot,
  restoreAppStore,
  subscribeStore,
  updateStore,
  type AppStoreState,
} from './storeClient';

type StoreContextValue = {
  state: AppStoreState;
  isReady: boolean;
  updateStore: (partial: Partial<AppStoreState>) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppStoreState>(() => getStoreSnapshot());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    restoreAppStore()
      .then((snapshot) => {
        if (!active) return;
        setState({ ...snapshot });
        setIsReady(true);
      })
      .catch(() => {
        if (!active) return;
        setState({ ...getStoreSnapshot() });
        setIsReady(true);
      });

    const unsubscribe = subscribeStore(() => {
      if (!active) return;
      setState({ ...getStoreSnapshot() });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      state,
      isReady,
      updateStore,
    }),
    [isReady, state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);

  if (!context) {
    throw new Error('useStore must be used within StoreProvider.');
  }

  return context;
}
