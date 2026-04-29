/**
 * db/loader.js — 전체 데이터 로드 + 전체 삭제
 *
 * 전체 데이터 로드 (초기화용) — store.js 호환
 * 왜? → 기존 getState()가 전체 데이터를 메모리에 갖고 있는 구조라서
 * → 점진적 전환을 위해 한번에 전체 로딩 후 캐시하는 함수 제공
 */

import { supabase } from '../supabase-client.js';
import { getUserId } from './core.js';
import { items } from './items.js';
import { transactions } from './transactions.js';
import { vendors } from './vendors.js';
import { transfers, stocktakes, itemStocks, safetyStocks } from './inventory.js';
import { auditLogs, accountEntries, purchaseOrders, posSales } from './accounts.js';
import { settings, customFields } from './settings.js';
import { dbItemToStoreItem, dbTxToStoreTx, dbVendorToStore, dbTransferToStore } from './converters.js';
import { enrichItemsWithQty } from '../domain/inventoryStockCalc.js';

// ============================================================
// 전체 데이터 로드 (초기화용) — store.js 호환
// ============================================================
export async function loadAllData() {
  const labels = [
    'items', 'transactions', 'vendors', 'transfers', 'stocktakes',
    'auditLogs', 'accountEntries', 'purchaseOrders', 'posSales',
    'customFields', 'settings', 'itemStocks', 'safetyStocks',
  ];

  const ALL_ROWS = { limit: 1_000_000 };

  const results = await Promise.allSettled([
    items.list(ALL_ROWS),
    transactions.list(ALL_ROWS),
    vendors.list(),
    transfers.list(),
    stocktakes.list(),
    auditLogs.list({ limit: 200 }),
    accountEntries.list(),
    purchaseOrders.list(),
    posSales.list({ limit: 1000 }),
    customFields.list(),
    settings.getAll(),
    itemStocks.listAll(),
    safetyStocks.list(),
  ]);
  const pick = (idx, fallback) => {
    const r = results[idx];
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[loadAllData] ${labels[idx]} 로드 실패:`, r.reason?.message || r.reason);
    return fallback;
  };

  const itemsData      = pick(0,  []);
  const txData         = pick(1,  []);
  const vendorsData    = pick(2,  []);
  const transfersData  = pick(3,  []);
  const stocktakeData  = pick(4,  []);
  const auditData      = pick(5,  []);
  const accountData    = pick(6,  []);
  const orderData      = pick(7,  []);
  const posData        = pick(8,  []);
  const fieldData      = pick(9,  []);
  const settingsData   = pick(10, {});
  const itemStocksData = pick(11, []);
  const safetyStocksData = pick(12, []);

  // 기존 store.js 호환 — 점진적 전환 유지
  const mappedData = itemsData.map(dbItemToStoreItem);

  // itemStocks 기반으로 quantity 채우기 (단일 진실 공급원)
  const enrichedMappedData = enrichItemsWithQty(mappedData, itemStocksData);

  return {
    mappedData:       enrichedMappedData,
    transactions:     txData.map(dbTxToStoreTx),
    vendorMaster:     vendorsData.map(dbVendorToStore),
    transfers:        transfersData.map ? transfersData.map(dbTransferToStore) : transfersData,
    stocktakeHistory: stocktakeData,
    auditLogs:        auditData,
    accountEntries:   accountData,
    purchaseOrders:   orderData,
    posData:          posData,
    customFields:     fieldData,
    // 신규: 창고별 현재고 + 안전재고 (정규화 테이블)
    itemStocks:       itemStocksData,
    safetyStocks:     safetyStocksData,
    // 설정값
    safetyStock:      settingsData.safetyStock || {},
    beginnerMode:     settingsData.beginnerMode ?? true,
    dashboardMode:    settingsData.dashboardMode || 'executive',
    visibleColumns:   settingsData.visibleColumns || null,
    inventoryViewPrefs: settingsData.inventoryViewPrefs || {},
    inoutViewPrefs:   settingsData.inoutViewPrefs || {},
    tableSortPrefs:   settingsData.tableSortPrefs || {},
    costMethod:       settingsData.costMethod || 'weighted-avg',
    currency:         settingsData.currency || { code: 'KRW', symbol: '₩', rate: 1 },
  };
}

/**
 * 현재 사용자의 모든 데이터 삭제 (회원탈퇴/초기화용)
 * 각 테이블에서 user_id = auth.uid() 인 데이터를 순서대로 삭제
 */
export async function clearAllUserData() {
  const userId = await getUserId();
  if (!userId) throw new Error('로그인이 필요합니다.');

  const tables = [
    'salary_items', 'leaves', 'payrolls', 'attendance', 'employees',
    'pos_sales', 'purchase_orders', 'account_entries',
    'audit_logs', 'stocktakes', 'transfers', 'vendors',
    'transactions', 'items', 'user_settings', 'custom_fields',
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) console.warn(`[clearAllUserData] ${table} 삭제 경고:`, error.message);
  }
}
