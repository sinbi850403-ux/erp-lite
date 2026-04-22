type InventoryRow = {
  id?: string;
  _index?: number;
  itemName?: string;
  itemCode?: string;
  category?: string;
  vendor?: string;
  warehouse?: string;
  quantity?: string | number;
  totalPrice?: string | number;
  supplyValue?: string | number;
};

type InventoryTableProps = {
  rows: InventoryRow[];
  onEdit: (row: InventoryRow) => void;
  onDelete: (row: InventoryRow) => void;
};

function formatAmount(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ko-KR').format(parsed) : '-';
}

export function InventoryTable({ rows, onDelete, onEdit }: InventoryTableProps) {
  return (
    <article className="react-card react-card--table">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">재고 목록</span>
          <h3>현재 재고 현황</h3>
        </div>
        <strong>{rows.length}건</strong>
      </div>

      <div className="react-data-table">
        <table>
          <thead>
            <tr>
              <th>품목명</th>
              <th>코드</th>
              <th>카테고리</th>
              <th>거래처</th>
              <th>창고</th>
              <th>수량</th>
              <th>금액</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.slice(0, 16).map((row, index) => (
                <tr key={row.id || `${row.itemCode || row.itemName || 'item'}-${index}`}>
                  <td>{row.itemName || '-'}</td>
                  <td>{row.itemCode || '-'}</td>
                  <td>{row.category || '-'}</td>
                  <td>{row.vendor || '-'}</td>
                  <td>{row.warehouse || '-'}</td>
                  <td>{row.quantity || '-'}</td>
                  <td>{formatAmount(row.totalPrice || row.supplyValue)}</td>
                  <td>
                    <div className="react-inline-actions">
                      <button type="button" className="react-link-button" onClick={() => onEdit(row)}>
                        수정
                      </button>
                      <button type="button" className="react-link-button is-danger" onClick={() => onDelete(row)}>
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="react-empty-cell">
                  조건에 맞는 품목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
