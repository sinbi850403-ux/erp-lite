import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function AuthGuard() {
  const { isReady, user } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return (
      <section className="react-page">
        <article className="react-card react-card--loading">
          <span className="react-chip">Loading</span>
          <h2>Checking session</h2>
          <p>We are restoring your auth session.</p>
        </article>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
