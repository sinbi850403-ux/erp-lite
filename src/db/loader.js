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
import { transfers, stocktakes } from './inventory.js';
import { auditLogs, accountEntries, purchaseOrders, posSales } from './accounts.js';
import { settings, customFields } from './settings.js';
import { dbItemToStoreItem, dbTxToStoreTx, dbVendorToStore } from './converters.js';

// ============================================================
// 전체 데이터 로드 (초기화용) — store.js 호환
// ============================================================
export async function loadAllData() {
  const labels = ['items', 'transactions', 'vendors', 'transfers', 'stocktakes',
    'auditLogs', 'accountEntries', 'purchaseOrders', 'posSales', 'customFields', 'settings'];

  // Supabase PostgREST 기본 상한(1000행) 해제
  // — limit(N) 미지정 시 1000건에서 잘려 데이터 누락이 발생하는 것을 방지
  // — 품목·트랜잭션이 수만 건이어도 전부 로드 (성능 이슈가 생기면 페이지네이션으로 전환)
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
  ]);
  const pick = (idx, fallback) => {
    const r = results[idx];
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[loadAllData] ${labels[idx]} 로드 실패:`, r.reason?.message || r.reason);
    return fallback;
  };

  const itemsData = pick(0, []);
  const txData = pick(1, []);
  const vendorsData = pick(2, []);
  const transfersData = pick(3, []);
  const stocktakeData = pick(4, []);
  const auditData = pick(5, []);
  const accountData = pick(6, []);
  const orderData = pick(7, []);
  const posData = pick(8, []);
  const fieldData = pick(9, []);
  const settingsData = pick(10, {});

  // 기존 store.js의 state 형태로 변환
  // 왜 이렇게? → 60개 페이지 파일이 getState()를 쓰고 있어서
  // 한번에 전부 바꾸기보다 점진적으로 전환하기 위해
  return {
    mappedData: itemsData.map(dbItemToStoreItem),
    transactions: txData.map(dbTxToStoreTx),
    vendorMaster: vendorsData.map(dbVendorToStore),
    transfers: transfersData,
    stocktakeHistory: stocktakeData,
    auditLogs: auditData,
    accountEntries: accountData,
    purchaseOrders: orderData,
    posData: posData,
    customFields: fieldData,
    // 설정값
    safetyStock: settingsData.safetyStock || {},
    beginnerMode: settingsData.beginnerMode ?? true,
    dashboardMode: settingsData.dashboardMode || 'executive',
    visibleColumns: settingsData.visibleColumns || null,
    inventoryViewPrefs: settingsData.inventoryViewPrefs || {},
    inoutViewPrefs: settingsData.inoutViewPrefs || {},
    tableSortPrefs: settingsData.tableSortPrefs || {},
    costMethod: settingsData.costMethod || 'weighted-avg',
    currency: settingsData.currency || { code: 'KRW', symbol: '₩', rate: 1 },
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
