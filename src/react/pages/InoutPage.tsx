import { InoutFilters } from '../features/inout/components/InoutFilters';
import { InoutSummary } from '../features/inout/components/InoutSummary';
import { InoutTable } from '../features/inout/components/InoutTable';
import { useInoutPage } from '../features/inout/hooks/useInoutPage';

export function InoutPage() {
  const { filter, options, rows, summary, setFilter } = useInoutPage();

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">Transactions first</span>
        <h2>Inout flow is prepared for page, components, hooks, and domain selectors.</h2>
        <p>
          This structure is ready for the next step: split modal workflows, write services, and
          connect transaction mutations without going back to a page-sized file.
        </p>
      </article>

      <InoutSummary summary={summary} />
      <InoutFilters filter={filter} options={options} onChange={setFilter} />
      <InoutTable rows={rows} />
    </section>
  );
}
