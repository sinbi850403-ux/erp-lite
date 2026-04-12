/**
 * migrate-to-supabase.js - Firestore/IndexedDB → Supabase 데이터 이관 도구
 *
 * 왜 필요?
 * → 기존 사용자의 로컬 데이터(IndexedDB)를 Supabase로 안전하게 이관
 * → 이관 후에도 원본은 보존 (롤백 가능)
 *
 * 사용법: 설정 페이지에서 "데이터 클라우드 이관" 버튼 클릭 시 실행
 */

import * as db from './db.js';
import { getState } from './store.js';
import { showToast } from './toast.js';
import { isSupabaseConfigured } from './supabase-client.js';

/**
 * 이관 상태 추적
 */
let migrationProgress = { total: 0, done: 0, status: 'idle' };

export function getMigrationProgress() {
  return { ...migrationProgress };
}

/**
 * 로컬 데이터 → Supabase 전체 이관
 * @returns {{ success: boolean, summary: object }}
 */
export async function migrateLocalToSupabase() {
  if (!isSupabaseConfigured) {
    showToast('Supabase가 설정되지 않았습니다.', 'warning');
    return { success: false };
  }

  const state = getState();
  const summary = {
    items: 0,
    transactions: 0,
    vendors: 0,
    transfers: 0,
    settings: 0,
    errors: [],
  };

  try {
    migrationProgress = { total: 5, done: 0, status: '품목 이관 중...' };

    // 1. 품목 이관 (mappedData → items 테이블)
    const mappedData = state.mappedData || [];
    if (mappedData.length > 0) {
      const dbItems = mappedData.map(item => db.storeItemToDb(item));
      const result = await db.items.bulkUpsert(dbItems);
      summary.items = result.length;
    }
    migrationProgress.done = 1;

    // 2. 입출고 이관
    migrationProgress.status = '입출고 이관 중...';
    const txList = state.transactions || [];
    if (txList.length > 0) {
      const dbTxs = txList.map(tx => ({
        type: tx.type,
        item_name: tx.itemName || tx.item_name,
        quantity: tx.quantity,
        unit_price: tx.unitPrice || tx.unit_price || 0,
        date: tx.date,
        vendor: tx.vendor,
        warehouse: tx.warehouse,
        note: tx.note,
      }));

      // 500개씩 배치 처리
      const BATCH = 500;
      for (let i = 0; i < dbTxs.length; i += BATCH) {
        const batch = dbTxs.slice(i, i + BATCH);
        const result = await db.transactions.bulkCreate(batch);
        summary.transactions += result.length;
      }
    }
    migrationProgress.done = 2;

    // 3. 거래처 이관
    migrationProgress.status = '거래처 이관 중...';
    const vendorList = state.vendorMaster || [];
    for (const v of vendorList) {
      try {
        await db.vendors.create({
          name: v.name,
          type: v.type,
          biz_number: v.bizNumber,
          ceo_name: v.ceoName,
          contact_name: v.contactName,
          phone: v.phone,
          email: v.email,
          address: v.address,
          memo: v.memo,
        });
        summary.vendors++;
      } catch (err) {
        // 중복 거래처는 무시
        if (!err.message.includes('duplicate')) {
          summary.errors.push(`거래처 "${v.name}": ${err.message}`);
        }
      }
    }
    migrationProgress.done = 3;

    // 4. 이동 이력 이관
    migrationProgress.status = '이동 이력 이관 중...';
    const transferList = state.transfers || [];
    for (const t of transferList) {
      try {
        await db.transfers.create({
          date: t.date,
          from_warehouse: t.fromWarehouse || t.from_warehouse,
          to_warehouse: t.toWarehouse || t.to_warehouse,
          item_name: t.itemName || t.item_name,
          quantity: t.quantity,
          note: t.note,
        });
        summary.transfers++;
      } catch (err) {
        summary.errors.push(`이동: ${err.message}`);
      }
    }
    migrationProgress.done = 4;

    // 5. 설정값 이관
    migrationProgress.status = '설정 이관 중...';
    const settingsToMigrate = {
      safetyStock: state.safetyStock,
      beginnerMode: state.beginnerMode,
      dashboardMode: state.dashboardMode,
      visibleColumns: state.visibleColumns,
      inventoryViewPrefs: state.inventoryViewPrefs,
      inoutViewPrefs: state.inoutViewPrefs,
      tableSortPrefs: state.tableSortPrefs,
      industryTemplate: state.industryTemplate,
      costMethod: state.costMethod,
      currency: state.currency,
    };

    for (const [key, value] of Object.entries(settingsToMigrate)) {
      if (value !== undefined && value !== null) {
        await db.settings.set(key, value);
        summary.settings++;
      }
    }
    migrationProgress.done = 5;

    migrationProgress.status = '완료!';
    showToast(
      `이관 완료! 품목 ${summary.items}건, 입출고 ${summary.transactions}건, 거래처 ${summary.vendors}건`,
      'success'
    );

    return { success: true, summary };
  } catch (err) {
    migrationProgress.status = '오류 발생';
    showToast('이관 중 오류: ' + err.message, 'error');
    summary.errors.push(err.message);
    return { success: false, summary };
  }
}
