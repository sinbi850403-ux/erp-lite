import { useState } from 'react';

type InventoryRow = {
  id?: string;
  _index?: number;
  itemName?: string;
  itemCode?: string;
  category?: string;
  vendor?: string;
  warehouse?: string;
  quantity?: string | number;
  unitPrice?: string | number;
  totalPrice?: string | number;
  supplyValue?: string | number;
};

type InventorySortKey = 'itemName' | 'itemCode' | 'category' | 'vendor' | 'warehouse' | 'quantity' | 'amount';

type InventoryTableProps = {
  rows: InventoryRow[];
  sort: {
    key: InventorySortKey;
    direction: 'asc' | 'desc';
  };
  onSortChange: (key: InventorySortKey) => void;
  onEdit: (row: InventoryRow) => void;
  onDelete: (row: InventoryRow) => void;
};

function toNum(v: unknown) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** totalPrice → supplyValue → quantity×unitPrice 순으로 폴백 */
function getRowAmount(row: InventoryRow) {
  const total = toNum(row.totalPrice);
  if (total > 0) return total;
  const supply = toNum(row.supplyValue);
  if (supply > 0) return supply;
  // totalPrice/supplyValue가 없으면 수량×단가로 계산
  return Math.round(toNum(row.quantity) * toNum(row.unitPrice));
}

function formatAmount(amount: number) {
  return amount > 0 ? new Intl.NumberFormat('ko-KR').format(amount) : '-';
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSortChange,
}: {
  label: string;
  sortKey: InventorySortKey;
  sort: InventoryTableProps['sort'];
  onSortChange: InventoryTableProps['onSortChange'];
}) {
  const isActive = sort.key === sortKey;
  const indicator = isActive ? (sort.direction === 'asc' ? '▲' : '▼') : '↕';

  return (
    <button
      type="button"
      className={isActive ? 'react-sort-button is-active' : 'react-sort-button'}
      onClick={() => onSortChange(sortKey)}
      aria-label={`${label} 정렬`}
    >
      <span>{label}</span>
      <span className="react-sort-indicator">{indicator}</span>
    </button>
  );
}

const PAGE_SIZE = 20;

export function InventoryTable({ rows, sort, onSortChange, onDelete, onEdit }: InventoryTableProps) {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const visibleRows = rows.slice(0, displayCount);
  const hasMore = rows.length > displayCount;

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
              <th>
                <SortableHeader label="품목명" sortKey="itemName" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="코드" sortKey="itemCode" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="카테고리" sortKey="category" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="거래처" sortKey="vendor" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="창고" sortKey="warehouse" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="수량" sortKey="quantity" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="금액" sortKey="amount" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((row, index) => (
                <tr key={row.id ?? `${String(row.itemCode || row.itemName || '')}-${index}`}>
                  <td>{row.itemName || '-'}</td>
                  <td>{row.itemCode || '-'}</td>
                  <td>{row.category || '-'}</td>
                  <td>{row.vendor || '-'}</td>
                  <td>{row.warehouse || '-'}</td>
                  <td>{row.quantity || '-'}</td>
                  <td>{formatAmount(getRowAmount(row))}</td>
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

      {hasMore ? (
        <div className="react-load-more">
          <button
            type="button"
            className="react-secondary-button"
            onClick={() => setDisplayCount((prev) => prev + PAGE_SIZE)}
          >
            더보기 ({rows.length - displayCount}건 남음)
          </button>
        </div>
      ) : null}
    </article>
  );
}
