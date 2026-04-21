import { InventoryFilters } from '../features/inventory/components/InventoryFilters';
import { InventorySummary } from '../features/inventory/components/InventorySummary';
import { InventoryTable } from '../features/inventory/components/InventoryTable';
import { useInventoryPage } from '../features/inventory/hooks/useInventoryPage';

export function InventoryPage() {
  const { filter, options, rows, summary, setFilter } = useInventoryPage();

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">Page + features + domain</span>
        <h2>Inventory is now shaped as a React page instead of a single legacy file.</h2>
        <p>
          Filters, summary cards, and the main table are separated into React components while the
          derived business view stays in domain selectors.
        </p>
      </article>

      <InventorySummary summary={summary} />
      <InventoryFilters filter={filter} options={options} onChange={setFilter} />
      <InventoryTable rows={rows} />
    </section>
  );
}
