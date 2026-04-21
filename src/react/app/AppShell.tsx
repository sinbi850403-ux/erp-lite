import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getNavigationMeta, navigationItems } from '../features/navigation/navigation';
import { AppRouter } from '../router';
import { useStore } from '../services/store/StoreContext';

export function AppShell() {
  const { isReady, profile, user } = useAuth();
  const { isReady: isStoreReady, state } = useStore();
  const location = useLocation();
  const currentMeta = getNavigationMeta(location.pathname);

  return (
    <div className="react-shell">
      <aside className="react-sidebar">
        <div className="react-brand">
          <span className="react-brand__eyebrow">React Workspace</span>
          <strong>INVEX</strong>
          <p>The React shell now carries auth, overview, inventory, and inout pages in a stable app structure.</p>
        </div>

        <nav className="react-nav" aria-label="React workspace navigation">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'react-nav__item is-active' : 'react-nav__item')}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </NavLink>
          ))}
        </nav>

        <div className="react-sidebar__footer">
          <p>Workspace state</p>
          <div className="react-sidebar__stats">
            <div>
              <span>Plan</span>
              <strong>{profile?.plan || 'free'}</strong>
            </div>
            <div>
              <span>Items</span>
              <strong>{state.mappedData?.length || 0}</strong>
            </div>
            <div>
              <span>Flows</span>
              <strong>{state.transactions?.length || 0}</strong>
            </div>
          </div>
        </div>
      </aside>

      <div className="react-workspace">
        <header className="react-topbar">
          <div>
            <span className="react-topbar__eyebrow">{currentMeta.eyebrow}</span>
            <h1>{currentMeta.title}</h1>
          </div>

          <div className="react-topbar__actions">
            <div className="react-session-pill">
              {isReady
                ? user
                  ? `${profile?.name || user.email || 'Signed in'} / ${(profile?.plan || 'free').toUpperCase()}`
                  : 'Signed out'
                : 'Checking auth'}
            </div>
            <div className="react-session-pill">
              {isStoreReady ? `Store ready / ${state.fileName || 'local snapshot'}` : 'Restoring store'}
            </div>
            <a className="react-topbar__link" href="/index.html">
              Open legacy app
            </a>
          </div>
        </header>

        <main className="react-page-container">
          <AppRouter />
        </main>
      </div>
    </div>
  );
}
