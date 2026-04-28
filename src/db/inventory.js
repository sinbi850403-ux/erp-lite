/**
 * db/inventory.js — 창고 이동 (Transfers) + 재고 실사 (Stocktakes)
 */

import { supabase } from '../supabase-client.js';
import { getUserId, handleError } from './core.js';

// ============================================================
// 창고 이동 (Transfers)
// ============================================================
export const transfers = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    handleError(error, '이동 이력 조회');
    return data || [];
  },

  async create(transfer) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('transfers')
      .insert({ ...transfer, user_id: userId })
      .select()
      .single();
    handleError(error, '이동 등록');
    return data;
  },

  async bulkUpsert(transfersArray) {
    const userId = await getUserId();
    const rows = transfersArray.map(t => ({ ...t, user_id: userId }));
    const { error } = await supabase
      .from('transfers')
      .upsert(rows, { onConflict: 'id' });
    handleError(error, '창고 이동 일괄 저장');
  },

  /**
   * 해당 사용자의 이동 이력 전체 삭제 (설정 페이지 초기화용)
   */
  async deleteAll() {
    const userId = await getUserId();
    const { error } = await supabase
      .from('transfers')
      .delete()
      .eq('user_id', userId);
    handleError(error, '창고 이동 전체 삭제');
  },
};

// ============================================================
// 재고 실사 (Stocktakes)
// ============================================================
export const stocktakes = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('stocktakes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleError(error, '실사 이력 조회');
    return data || [];
  },

  async create(stocktake) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('stocktakes')
      .insert({ ...stocktake, user_id: userId })
      .select()
      .single();
    handleError(error, '실사 등록');
    return data;
  },
};
