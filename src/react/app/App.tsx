import { AppProviders } from './AppProviders';
import { AppShell } from './AppShell';

export function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
