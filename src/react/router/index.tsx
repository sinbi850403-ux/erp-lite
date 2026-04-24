import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthGuard } from '../features/auth/AuthGuard';
import { AuthPage } from '../pages/AuthPage';
import { HomePage } from '../pages/HomePage';
import { InoutPage } from '../pages/InoutPage';
import { InventoryPage } from '../pages/InventoryPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<AuthGuard />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/inout" element={<InoutPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
