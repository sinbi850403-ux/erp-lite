type InventorySummaryProps = {
  summary: {
    itemCount: number;
    warehouses: number;
    categories: number;
    totalQuantity: number;
    totalValue: number;
    lowStock: number;
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function InventorySummary({ summary }: InventorySummaryProps) {
  const cards = [
    { label: 'Items', value: formatNumber(summary.itemCount), tone: 'neutral' },
    { label: 'Warehouses', value: formatNumber(summary.warehouses), tone: 'neutral' },
    { label: 'Categories', value: formatNumber(summary.categories), tone: 'neutral' },
    { label: 'Stock Qty', value: formatNumber(summary.totalQuantity), tone: 'neutral' },
    { label: 'Inventory Value', value: `KRW ${formatNumber(summary.totalValue)}`, tone: 'neutral' },
    { label: 'Low Stock', value: formatNumber(summary.lowStock), tone: summary.lowStock ? 'warn' : 'good' },
  ];

  return (
    <div className="react-grid react-grid--stats">
      {cards.map((card) => (
        <article key={card.label} className={`react-stat-card is-${card.tone}`}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </div>
  );
}
