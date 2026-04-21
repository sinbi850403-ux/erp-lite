import { useDeferredValue, useMemo, useState } from 'react';
import { getFilteredTransactions, getInoutOptions, getInoutSummary } from '../../../domain/inout/selectors';
import { useStore } from '../../../services/store/StoreContext';

export function useInoutPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState({
    keyword: '',
    type: '',
    vendor: '',
    quick: 'all',
  });
  const deferredKeyword = useDeferredValue(filter.keyword);

  const effectiveFilter = useMemo(
    () => ({ ...filter, keyword: deferredKeyword }),
    [deferredKeyword, filter],
  );

  const summary = useMemo(() => getInoutSummary(state), [state]);
  const options = useMemo(() => getInoutOptions(state), [state]);
  const rows = useMemo(() => getFilteredTransactions(state, effectiveFilter), [effectiveFilter, state]);

  return { filter, options, rows, summary, setFilter };
}
