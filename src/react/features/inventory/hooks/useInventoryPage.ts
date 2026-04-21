import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { getFilteredInventoryRows, getInventoryOptions, getInventorySummary } from '../../../domain/inventory/selectors';
import {
  createInventoryItem,
  editInventoryItem,
  removeInventoryItem,
  type InventoryInput,
} from '../../../services/inventory/inventoryService';
import { useStore } from '../../../services/store/StoreContext';

const emptyDraft: InventoryInput = {
  itemName: '',
  itemCode: '',
  category: '',
  vendor: '',
  warehouse: '',
  quantity: 0,
  unit: 'EA',
  unitPrice: 0,
};

export function useInventoryPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState({
    keyword: '',
    category: '',
    warehouse: '',
    focus: 'all',
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<InventoryInput>(emptyDraft);
  const deferredKeyword = useDeferredValue(filter.keyword);

  const effectiveFilter = useMemo(
    () => ({ ...filter, keyword: deferredKeyword }),
    [deferredKeyword, filter],
  );

  const summary = useMemo(() => getInventorySummary(state), [state]);
  const options = useMemo(() => getInventoryOptions(state), [state]);
  const rows = useMemo(() => getFilteredInventoryRows(state, effectiveFilter), [effectiveFilter, state]);

  useEffect(() => {
    if (editingIndex === null) return;
    const target = state.mappedData?.[editingIndex];
    if (!target) return;

    setDraft({
      itemName: target.itemName || '',
      itemCode: target.itemCode || '',
      category: target.category || '',
      vendor: target.vendor || '',
      warehouse: target.warehouse || '',
      quantity: Number(target.quantity || 0),
      unit: target.unit || 'EA',
      unitPrice: Number(target.unitPrice || 0),
    });
  }, [editingIndex, state.mappedData]);

  function startCreate() {
    setEditingIndex(null);
    setDraft(emptyDraft);
  }

  function startEdit(row: { _index?: number; itemName?: string; itemCode?: string; category?: string; vendor?: string; warehouse?: string; quantity?: string | number; unit?: string; unitPrice?: string | number; }) {
    if (typeof row._index !== 'number') return;
    setEditingIndex(row._index);
    setDraft({
      itemName: row.itemName || '',
      itemCode: row.itemCode || '',
      category: row.category || '',
      vendor: row.vendor || '',
      warehouse: row.warehouse || '',
      quantity: Number(row.quantity || 0),
      unit: row.unit || 'EA',
      unitPrice: Number(row.unitPrice || 0),
    });
  }

  function saveItem(value: InventoryInput) {
    if (editingIndex === null) {
      createInventoryItem(value);
      setDraft(emptyDraft);
      return;
    }

    editInventoryItem(editingIndex, value);
    setEditingIndex(null);
    setDraft(emptyDraft);
  }

  function deleteItem(row: { _index?: number }) {
    if (typeof row._index !== 'number') return;
    removeInventoryItem(row._index);
    if (editingIndex === row._index) {
      setEditingIndex(null);
      setDraft(emptyDraft);
    }
  }

  return {
    draft,
    editingIndex,
    filter,
    options,
    rows,
    summary,
    setFilter,
    saveItem,
    deleteItem,
    startCreate,
    startEdit,
  };
}
