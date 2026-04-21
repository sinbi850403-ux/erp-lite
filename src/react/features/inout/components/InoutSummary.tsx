type InoutSummaryProps = {
  summary: {
    totalTransactions: number;
    todayInbound: number;
    todayOutbound: number;
    missingVendor: number;
  };
};

export function InoutSummary({ summary }: InoutSummaryProps) {
  const cards = [
    { label: 'Transactions', value: summary.totalTransactions, tone: 'neutral' },
    { label: 'Today inbound', value: summary.todayInbound, tone: summary.todayInbound ? 'good' : 'neutral' },
    { label: 'Today outbound', value: summary.todayOutbound, tone: summary.todayOutbound ? 'warn' : 'neutral' },
    { label: 'Missing vendor', value: summary.missingVendor, tone: summary.missingVendor ? 'warn' : 'good' },
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
