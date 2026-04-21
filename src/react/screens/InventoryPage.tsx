const inventoryModules = ['InventoryTable', 'InventoryFilters', 'InventorySummary', 'InventoryEditModal'];

export function InventoryPage() {
  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">우선순위 2</span>
        <h2>재고 화면 분해 후보</h2>
        <p>
          재고 화면은 테이블과 요약, 필터, 수정 모달이 분리되기 쉬워서 React 컴포넌트 체감 효과가 큰
          영역입니다.
        </p>
      </article>

      <div className="react-grid react-grid--four">
        {inventoryModules.map((moduleName) => (
          <article key={moduleName} className="react-card react-card--compact">
            <h3>{moduleName}</h3>
          </article>
        ))}
      </div>
    </section>
  );
}
