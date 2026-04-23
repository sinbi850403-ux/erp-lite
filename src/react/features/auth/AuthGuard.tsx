import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function AuthGuard() {
  const { isReady, user } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return (
      <section className="react-page">
        <article className="react-card react-card--loading">
          <span className="react-chip">로딩 중</span>
          <h2>세션 확인 중</h2>
          <p>인증 세션을 복원하고 있습니다. 잠시만 기다려 주세요.</p>
        </article>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
