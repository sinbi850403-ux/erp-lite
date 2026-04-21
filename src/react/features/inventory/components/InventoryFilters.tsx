type InventoryFiltersProps = {
  filter: {
    keyword: string;
    category: string;
    warehouse: string;
    focus: string;
  };
  options: {
    categories: string[];
    warehouses: string[];
  };
  onChange: (next: {
    keyword: string;
    category: string;
    warehouse: string;
    focus: string;
  }) => void;
};

export function InventoryFilters({ filter, options, onChange }: InventoryFiltersProps) {
  return (
    <article className="react-card react-card--filters">
      <div className="react-toolbar">
        <input
          className="react-input"
          value={filter.keyword}
          onChange={(event) => onChange({ ...filter, keyword: event.target.value })}
          placeholder="Search item, code, vendor"
        />
        <select
          className="react-select"
          value={filter.category}
          onChange={(event) => onChange({ ...filter, category: event.target.value })}
        >
          <option value="">All categories</option>
          {options.categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className="react-select"
          value={filter.warehouse}
          onChange={(event) => onChange({ ...filter, warehouse: event.target.value })}
        >
          <option value="">All warehouses</option>
          {options.warehouses.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="react-chip-row">
        {[
          { value: 'all', label: 'All items' },
          { value: 'low', label: 'Low stock' },
          { value: 'missingVendor', label: 'Missing vendor' },
        ].map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={filter.focus === chip.value ? 'react-chip-button is-active' : 'react-chip-button'}
            onClick={() => onChange({ ...filter, focus: chip.value })}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </article>
  );
}
