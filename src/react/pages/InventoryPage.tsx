import { InventoryEditor } from '../features/inventory/components/InventoryEditor';
import { InventoryFilters } from '../features/inventory/components/InventoryFilters';
import { InventorySummary } from '../features/inventory/components/InventorySummary';
import { InventoryTable } from '../features/inventory/components/InventoryTable';
import { useInventoryPage } from '../features/inventory/hooks/useInventoryPage';

export function InventoryPage() {
  const {
    draft,
    editingIndex,
    filter,
    options,
    rows,
    summary,
    setFilter,
    saveItem,
    deleteItem,
    startCreate,
    startEdit,
  } = useInventoryPage();

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">Inventory flow migrated</span>
        <h2>Inventory now supports actual React-side create, edit, and delete flows.</h2>
        <p>
          This page is no longer just a read-only placeholder. The editor writes to the shared
          store, the table reflects updates immediately, and the page structure stays feature-first.
        </p>
      </article>

      <InventorySummary summary={summary} />
      <InventoryEditor
        initialValue={draft}
        isEditing={editingIndex !== null}
        onCancelEdit={startCreate}
        onSubmit={saveItem}
      />
      <InventoryFilters filter={filter} options={options} onChange={setFilter} />
      <InventoryTable rows={rows} onEdit={startEdit} onDelete={deleteItem} />
    </section>
  );
}
