import type { InoutInput } from '../inout/inoutService';
import type { InventoryInput } from '../inventory/inventoryService';

export function isYyyyMmDd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

export function validateInventoryInput(value: InventoryInput): string | null {
  if (!String(value.itemName || '').trim()) return '품목명은 필수입니다.';

  const quantity = Number(value.quantity);
  if (!Number.isFinite(quantity)) return '수량은 숫자여야 합니다.';
  if (quantity < 0) return '수량은 0 이상이어야 합니다.';

  const unitPrice = Number(value.unitPrice);
  if (!Number.isFinite(unitPrice)) return '원가는 숫자여야 합니다.';
  if (unitPrice < 0) return '원가는 0 이상이어야 합니다.';

  return null;
}

export function validateInoutInput(value: InoutInput): string | null {
  if (!String(value.itemName || '').trim()) return '품목명은 필수입니다.';
  if (!String(value.date || '').trim()) return '거래일은 필수입니다.';
  if (!isYyyyMmDd(value.date)) return '거래일 형식이 올바르지 않습니다. (YYYY-MM-DD)';

  const quantity = Number(value.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return '수량은 1 이상 숫자여야 합니다.';

  const unitPrice = Number(value.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return '단가는 0 이상 숫자여야 합니다.';

  return null;
}
