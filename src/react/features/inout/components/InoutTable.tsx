type InoutRow = {
  type?: string;
  itemName?: string;
  itemCode?: string;
  quantity?: string | number;
  date?: string;
  vendor?: string;
  warehouse?: string;
};

export function InoutTable({ rows }: { rows: InoutRow[] }) {
  return (
    <article className="react-card react-card--table">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">Transactions</span>
          <h3>Inbound and outbound log</h3>
        </div>
        <strong>{rows.length} rows</strong>
      </div>

      <div className="react-data-table">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Item</th>
              <th>Code</th>
              <th>Qty</th>
              <th>Date</th>
              <th>Vendor</th>
              <th>Warehouse</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.slice(0, 16).map((row, index) => (
                <tr key={`${row.itemCode || row.itemName || 'tx'}-${index}`}>
                  <td>
                    <span className={row.type === 'in' ? 'react-badge is-good' : 'react-badge is-warn'}>
                      {row.type === 'in' ? 'Inbound' : 'Outbound'}
                    </span>
                  </td>
                  <td>{row.itemName || '-'}</td>
                  <td>{row.itemCode || '-'}</td>
                  <td>{row.quantity || '-'}</td>
                  <td>{row.date || '-'}</td>
                  <td>{row.vendor || '-'}</td>
                  <td>{row.warehouse || '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="react-empty-cell">
                  No transactions match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
