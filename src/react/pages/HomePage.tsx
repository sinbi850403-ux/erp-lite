import { getDashboardMetrics, getRecentTransactions, getWorkspaceReadiness } from '../domain/dashboard/selectors';
import { useAuth } from '../features/auth/AuthContext';
import { legacyRoutes } from '../legacy/routes';
import { useStore } from '../services/store/StoreContext';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function HomePage() {
  const { profile, user } = useAuth();
  const { isReady, state } = useStore();
  const metrics = getDashboardMetrics(state);
  const readiness = getWorkspaceReadiness(state);
  const transactions = getRecentTransactions(state);

  return (
    <section className="react-page">
      <article className="react-hero-card">
        <div className="react-hero-card__content">
          <div>
            <span className="react-chip">Phase Complete</span>
            <h2>React workspace is now the operational shell for the next migration steps.</h2>
            <p>
              The app shell, protected routes, auth facade, inventory domain, and inout domain now
              live in React-friendly layers. The vanilla entry stays available while migration
              continues page by page.
            </p>
          </div>
          <div className="react-hero-card__panel">
            <span className="react-card__eyebrow">Current operator</span>
            <strong>{profile?.name || user?.displayName || user?.email || 'Guest'}</strong>
            <p>{profile ? `${profile.role || 'viewer'} / ${profile.plan || 'free'}` : 'No active session'}</p>
            <small>{isReady ? 'Store restored' : 'Restoring store'}</small>
          </div>
        </div>
      </article>

      <div className="react-grid react-grid--stats">
        <article className="react-stat-card is-neutral">
          <span>Inventory items</span>
          <strong>{metrics.itemCount}</strong>
        </article>
        <article className="react-stat-card is-neutral">
          <span>Transactions</span>
          <strong>{metrics.transactionCount}</strong>
        </article>
        <article className={metrics.lowStockCount ? 'react-stat-card is-warn' : 'react-stat-card is-good'}>
          <span>Low stock alerts</span>
          <strong>{metrics.lowStockCount}</strong>
        </article>
        <article className="react-stat-card is-neutral">
          <span>Inventory value</span>
          <strong>KRW {formatCurrency(metrics.inventoryValue)}</strong>
        </article>
        <article className="react-stat-card is-good">
          <span>Today flow</span>
          <strong>{metrics.todayTransactions}</strong>
        </article>
        <article className="react-stat-card is-neutral">
          <span>Vendor links</span>
          <strong>{metrics.vendorCount}</strong>
        </article>
      </div>

      <div className="react-grid react-grid--two">
        <article className="react-card">
          <div className="react-section-head">
            <div>
              <span className="react-card__eyebrow">Readiness</span>
              <h3>Migration outcome that already feels stable</h3>
            </div>
          </div>
          <div className="react-readiness-list">
            {readiness.map((item) => (
              <div key={item.label} className={`react-readiness-item is-${item.tone}`}>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="react-card">
          <div className="react-section-head">
            <div>
              <span className="react-card__eyebrow">Legacy bridge</span>
              <h3>Keep the old app available while React expands</h3>
            </div>
          </div>
          <div className="react-link-list">
            {legacyRoutes.map((route) => (
              <a key={route.href} className="react-link-card" href={route.href}>
                <strong>{route.label}</strong>
                <span>{route.href}</span>
              </a>
            ))}
          </div>
        </article>
      </div>

      <article className="react-card">
        <div className="react-section-head">
          <div>
            <span className="react-card__eyebrow">Recent activity</span>
            <h3>Latest inbound and outbound changes</h3>
          </div>
        </div>
        <div className="react-activity-list">
          {transactions.length ? (
            transactions.map((tx, index) => (
              <div key={`${tx.itemName || 'tx'}-${index}`} className="react-activity-item">
                <span className={tx.type === 'in' ? 'react-badge is-good' : 'react-badge is-warn'}>
                  {tx.type === 'in' ? 'Inbound' : 'Outbound'}
                </span>
                <strong>{tx.itemName || 'Unnamed item'}</strong>
                <small>{tx.date || '-'}</small>
                <p>{tx.vendor || 'No vendor'} / Qty {tx.quantity || '-'}</p>
              </div>
            ))
          ) : (
            <p className="react-empty-note">No transaction history yet. The React workspace is ready for the first operational flow.</p>
          )}
        </div>
      </article>
    </section>
  );
}

export default HomePage;
