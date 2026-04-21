import { InoutComposer } from '../features/inout/components/InoutComposer';
import { InoutFilters } from '../features/inout/components/InoutFilters';
import { InoutSummary } from '../features/inout/components/InoutSummary';
import { InoutTable } from '../features/inout/components/InoutTable';
import { useInoutPage } from '../features/inout/hooks/useInoutPage';

export function InoutPage() {
  const { filter, options, rows, summary, setFilter, saveTransaction, deleteTransaction } = useInoutPage();

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">Inout flow migrated</span>
        <h2>Inout now handles actual React-side registration and deletion flows.</h2>
        <p>
          The composer writes transactions to the shared store, inventory quantities update through
          the existing store logic, and the React page now owns real operational behavior.
        </p>
      </article>

      <InoutSummary summary={summary} />
      <InoutComposer onSubmit={saveTransaction} />
      <InoutFilters filter={filter} options={options} onChange={setFilter} />
      <InoutTable rows={rows} onDelete={deleteTransaction} />
    </section>
  );
}
