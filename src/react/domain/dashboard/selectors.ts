import type { AppStoreState } from '../../services/store/storeClient';

function toNumber(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDashboardMetrics(state: AppStoreState) {
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const lowStockCount = items.filter((item) => {
    const minimum = Number(state.safetyStock?.[item.itemName] || 0);
    return minimum > 0 && toNumber(item.quantity) <= minimum;
  }).length;
  const inventoryValue = items.reduce((sum, item) => sum + toNumber(item.totalPrice || item.supplyValue), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayTransactions = transactions.filter((tx) => String(tx.date || '').slice(0, 10) === today).length;
  const vendorCount = new Set(
    [...(state.vendorMaster || []).map((vendor) => vendor.name), ...items.map((item) => item.vendor)].filter(Boolean),
  ).size;

  return {
    itemCount: items.length,
    transactionCount: transactions.length,
    lowStockCount,
    inventoryValue,
    todayTransactions,
    vendorCount,
  };
}

export function getRecentTransactions(state: AppStoreState) {
  return [...(state.transactions || [])]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 6);
}

export function getWorkspaceReadiness(state: AppStoreState) {
  return [
    {
      label: 'Auth split',
      value: 'Ready',
      detail: 'React auth context and auth facade are active.',
      tone: 'good',
    },
    {
      label: 'Inventory domain',
      value: state.mappedData?.length ? 'Active' : 'Empty',
      detail: state.mappedData?.length
        ? `${state.mappedData.length} inventory rows are available in the React shell.`
        : 'Inventory data will appear after import or sync.',
      tone: state.mappedData?.length ? 'good' : 'warn',
    },
    {
      label: 'Inout domain',
      value: state.transactions?.length ? 'Active' : 'Pending',
      detail: state.transactions?.length
        ? `${state.transactions.length} transactions are ready for React views.`
        : 'No transaction history has been created yet.',
      tone: state.transactions?.length ? 'good' : 'warn',
    },
    {
      label: 'Legacy coexistence',
      value: 'Kept',
      detail: 'The vanilla entry remains available while React replaces pages gradually.',
      tone: 'neutral',
    },
  ];
}
