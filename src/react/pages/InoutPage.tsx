import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InoutComposer } from '../features/inout/components/InoutComposer';
import { InoutFilters } from '../features/inout/components/InoutFilters';
import { InoutSummary } from '../features/inout/components/InoutSummary';
import { InoutTable } from '../features/inout/components/InoutTable';
import { useInoutPage } from '../features/inout/hooks/useInoutPage';

export function InoutPage() {
  const { filter, options, rows, summary, composerOptions, setFilter, saveTransaction, deleteTransaction } = useInoutPage();
  const [pendingDeleteRow, setPendingDeleteRow] = useState<{ id?: string; itemName?: string } | null>(null);

  function requestDelete(row: { id?: string; itemName?: string }) {
    setPendingDeleteRow(row);
  }

  function confirmDelete() {
    if (pendingDeleteRow) {
      deleteTransaction(pendingDeleteRow);
    }
    setPendingDeleteRow(null);
  }

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">입출고 흐름 React 전환 완료</span>
        <h2>입출고 등록/삭제가 React 화면에서 바로 동작합니다.</h2>
        <p>
          등록 폼에서 입력한 거래는 공용 스토어에 즉시 반영되고, 기존 재고 계산 로직과 연동되어
          수량이 바로 갱신됩니다. 이제 입출고의 실제 운영 흐름을 React 화면이 직접 담당합니다.
        </p>
      </article>

      <InoutSummary summary={summary} />
      <InoutComposer
        items={composerOptions.items}
        vendors={composerOptions.vendors}
        onSubmit={saveTransaction}
      />
      <InoutFilters filter={filter} options={options} onChange={setFilter} />
      <InoutTable rows={rows} onDelete={requestDelete} />

      <ConfirmDialog
        open={!!pendingDeleteRow}
        danger
        title="입출고 기록 삭제"
        description={`"${pendingDeleteRow?.itemName || '선택한 기록'}" 기록을 삭제할까요? 재고와 수량에도 즉시 반영됩니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteRow(null)}
      />
    </section>
  );
}

export default InoutPage;
