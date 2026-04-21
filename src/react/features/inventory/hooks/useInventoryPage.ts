import { useDeferredValue, useMemo, useState } from 'react';
import { getFilteredInventoryRows, getInventoryOptions, getInventorySummary } from '../../../domain/inventory/selectors';
import { useStore } from '../../../services/store/StoreContext';

export function useInventoryPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState({
    keyword: '',
    category: '',
    warehouse: '',
    focus: 'all',
  });
  const deferredKeyword = useDeferredValue(filter.keyword);

  const effectiveFilter = useMemo(
    () => ({ ...filter, keyword: deferredKeyword }),
    [deferredKeyword, filter],
  );

  const summary = useMemo(() => getInventorySummary(state), [state]);
  const options = useMemo(() => getInventoryOptions(state), [state]);
  const rows = useMemo(() => getFilteredInventoryRows(state, effectiveFilter), [effectiveFilter, state]);

  return { filter, options, rows, summary, setFilter };
}
