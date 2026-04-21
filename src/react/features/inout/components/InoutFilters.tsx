type InoutFiltersProps = {
  filter: {
    keyword: string;
    type: string;
    vendor: string;
    quick: string;
  };
  options: {
    vendors: string[];
  };
  onChange: (next: {
    keyword: string;
    type: string;
    vendor: string;
    quick: string;
  }) => void;
};

export function InoutFilters({ filter, options, onChange }: InoutFiltersProps) {
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
          value={filter.type}
          onChange={(event) => onChange({ ...filter, type: event.target.value })}
        >
          <option value="">All types</option>
          <option value="in">Inbound</option>
          <option value="out">Outbound</option>
        </select>
        <select
          className="react-select"
          value={filter.vendor}
          onChange={(event) => onChange({ ...filter, vendor: event.target.value })}
        >
          <option value="">All vendors</option>
          {options.vendors.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="react-chip-row">
        {[
          { value: 'all', label: 'All flows' },
          { value: 'today', label: 'Today' },
          { value: 'in', label: 'Inbound' },
          { value: 'out', label: 'Outbound' },
          { value: 'missingVendor', label: 'Missing vendor' },
        ].map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={filter.quick === chip.value ? 'react-chip-button is-active' : 'react-chip-button'}
            onClick={() => onChange({ ...filter, quick: chip.value })}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </article>
  );
}
