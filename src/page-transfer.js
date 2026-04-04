/**
 * page-transfer.js - 창고 간 재고 이동 페이지
 * 역할: A창고 → B창고로 품목 이관, 이동 이력 관리
 * 왜 필요? → 멀티 창고 운영 시 재고 이동 없이는 정확한 재고 파악 불가
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';

export function renderTransferPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transfers = state.transfers || [];

  // 창고 목록 추출
  const warehouses = [...new Set(items.map(i => i.warehouse).filter(Boolean))].sort();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🏭</span> 창고 간 이동</h1>
        <div class="page-desc">품목을 다른 창고로 이관하고 이력을 관리합니다.</div>
      </div>
    </div>

    <!-- 이동 등록 -->
    <div class="card">
      <div class="card-title">📦 재고 이동 등록</div>
      <div style="display:grid; grid-template-columns: 1fr auto 1fr; gap:16px; align-items:end; margin-bottom:16px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">출발 창고 <span class="required">*</span></label>
          <select class="form-select" id="tf-from">
            <option value="">-- 선택 --</option>
            ${warehouses.map(w => `<option value="${w}">${w}</option>`).join('')}
          </select>
        </div>
        <div style="font-size:24px; padding-bottom:8px; color:var(--accent);">→</div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">도착 창고 <span class="required">*</span></label>
          <select class="form-select" id="tf-to">
            <option value="">-- 선택 --</option>
            ${warehouses.map(w => `<option value="${w}">${w}</option>`).join('')}
            <option value="__new__">+ 새 창고 추가</option>
          </select>
          <input class="form-input" id="tf-new-warehouse" placeholder="새 창고명 입력" style="display:none; margin-top:6px;" />
        </div>
      </div>

      <div class="form-row" style="margin-bottom:16px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">대상 품목 <span class="required">*</span></label>
          <select class="form-select" id="tf-item">
            <option value="">-- 출발 창고를 먼저 선택 --</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">이동 수량 <span class="required">*</span></label>
          <input class="form-input" type="number" id="tf-qty" min="1" placeholder="0" />
          <div class="form-hint" id="tf-available"></div>
        </div>
      </div>

      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label">비고</label>
        <input class="form-input" id="tf-note" placeholder="이동 사유 (선택)" />
      </div>

      <button class="btn btn-primary btn-lg" id="btn-transfer">🏭 재고 이동 실행</button>
    </div>

    <!-- 이동 이력 -->
    <div class="card">
      <div class="card-title">📋 이동 이력 <span class="card-subtitle">(${transfers.length}건)</span></div>
      ${transfers.length > 0 ? `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>품목명</th>
                <th>출발</th>
                <th style="width:30px;"></th>
                <th>도착</th>
                <th class="text-right">수량</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              ${[...transfers].reverse().slice(0, 30).map(t => `
                <tr>
                  <td style="font-size:12px; color:var(--text-muted);">${t.date} ${t.time || ''}</td>
                  <td><strong>${t.itemName}</strong></td>
                  <td><span class="badge badge-default">${t.fromWarehouse}</span></td>
                  <td style="text-align:center;">→</td>
                  <td><span class="badge badge-info">${t.toWarehouse}</span></td>
                  <td class="text-right">${t.quantity}</td>
                  <td style="font-size:12px; color:var(--text-muted);">${t.note || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div style="text-align:center; padding:24px; color:var(--text-muted);">아직 이동 이력이 없습니다</div>'}
    </div>
  `;

  // === 이벤트 ===

  // 새 창고 입력 토글
  const toSelect = container.querySelector('#tf-to');
  const newInput = container.querySelector('#tf-new-warehouse');
  toSelect.addEventListener('change', () => {
    newInput.style.display = toSelect.value === '__new__' ? 'block' : 'none';
  });

  // 출발 창고 선택 시 → 해당 창고의 품목만 표시
  const fromSelect = container.querySelector('#tf-from');
  const itemSelect = container.querySelector('#tf-item');
  fromSelect.addEventListener('change', () => {
    const wh = fromSelect.value;
    const whItems = items.filter(i => i.warehouse === wh);
    itemSelect.innerHTML = `<option value="">-- 품목 선택 (${whItems.length}건) --</option>`
      + whItems.map((item, i) => `<option value="${i}" data-qty="${parseFloat(item.quantity) || 0}">${item.itemName} (재고: ${parseFloat(item.quantity) || 0})</option>`).join('');
  });

  // 품목 선택 시 → 가용 수량 표시
  itemSelect.addEventListener('change', () => {
    const opt = itemSelect.selectedOptions[0];
    const qty = opt?.dataset?.qty || 0;
    container.querySelector('#tf-available').textContent = qty > 0 ? `가용 수량: ${qty}` : '';
  });

  // 이동 실행
  container.querySelector('#btn-transfer').addEventListener('click', () => {
    const fromWh = fromSelect.value;
    let toWh = toSelect.value;
    if (toWh === '__new__') toWh = newInput.value.trim();

    if (!fromWh) { showToast('출발 창고를 선택해 주세요.', 'warning'); return; }
    if (!toWh) { showToast('도착 창고를 선택해 주세요.', 'warning'); return; }
    if (fromWh === toWh) { showToast('같은 창고로는 이동할 수 없습니다.', 'warning'); return; }

    const itemIdx = parseInt(itemSelect.value);
    if (isNaN(itemIdx)) { showToast('품목을 선택해 주세요.', 'warning'); return; }

    const whItems = items.filter(i => i.warehouse === fromWh);
    const sourceItem = whItems[itemIdx];
    if (!sourceItem) { showToast('품목을 찾을 수 없습니다.', 'error'); return; }

    const qty = parseFloat(container.querySelector('#tf-qty').value);
    const currentQty = parseFloat(sourceItem.quantity) || 0;
    if (!qty || qty <= 0) { showToast('이동 수량을 입력해 주세요.', 'warning'); return; }
    if (qty > currentQty) { showToast(`재고 부족 (가용: ${currentQty})`, 'error'); return; }

    const note = container.querySelector('#tf-note').value.trim();
    const now = new Date();

    // 데이터 업데이트
    const updatedItems = [...items];
    const sourceIdx = updatedItems.findIndex(i => i.itemName === sourceItem.itemName && i.warehouse === fromWh);

    // 출발 창고 수량 감소
    if (sourceIdx >= 0) {
      updatedItems[sourceIdx] = { ...updatedItems[sourceIdx], quantity: currentQty - qty };
    }

    // 도착 창고에 같은 품목이 있으면 수량 증가, 없으면 새로 추가
    const destIdx = updatedItems.findIndex(i => i.itemName === sourceItem.itemName && i.warehouse === toWh);
    if (destIdx >= 0) {
      const destQty = parseFloat(updatedItems[destIdx].quantity) || 0;
      updatedItems[destIdx] = { ...updatedItems[destIdx], quantity: destQty + qty };
    } else {
      updatedItems.push({
        ...sourceItem,
        warehouse: toWh,
        quantity: qty,
        totalPrice: qty * (parseFloat(sourceItem.unitPrice) || 0),
      });
    }

    // 이동 이력 추가
    const newTransfer = {
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      itemName: sourceItem.itemName,
      itemCode: sourceItem.itemCode || '',
      fromWarehouse: fromWh,
      toWarehouse: toWh,
      quantity: qty,
      note,
    };

    const updatedTransfers = [...transfers, newTransfer];
    setState({ mappedData: updatedItems, transfers: updatedTransfers });

    showToast(`${sourceItem.itemName} ${qty}개를 ${fromWh} → ${toWh}로 이동 완료`, 'success');
    renderTransferPage(container, navigateTo);
  });
}
