import type { PropsWithChildren } from 'react';
import { AuthProvider } from '../features/auth/AuthContext';
import { StoreProvider } from '../services/store/StoreContext';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <StoreProvider>{children}</StoreProvider>
    </AuthProvider>
  );
}
