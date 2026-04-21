const inoutModules = ['InoutTable', 'InoutFilters', 'TransactionForm', 'StatusTimeline'];

export function InoutPage() {
  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">우선순위 3</span>
        <h2>입출고 전환 준비</h2>
        <p>
          입출고는 거래 흐름과 상태가 얽혀 있어서 테이블, 필터, 등록 폼, 상태 표시를 분리하는 방향이
          가장 안전합니다.
        </p>
      </article>

      <div className="react-grid react-grid--four">
        {inoutModules.map((moduleName) => (
          <article key={moduleName} className="react-card react-card--compact">
            <h3>{moduleName}</h3>
          </article>
        ))}
      </div>
    </section>
  );
}
