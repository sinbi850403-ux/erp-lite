/**
 * page-ledger.js - ?섎텋遺 (?ш퀬 ?섎텋???
 * ??븷: 湲곌컙蹂??덈ぉ???낃퀬/異쒓퀬/?붾웾???λ? ?뺤떇?쇰줈 ?먮룞 ?앹꽦
 * ???꾩슂? ???쒓뎅 湲곗뾽 ?몃Т/?뚭퀎 蹂닿퀬???꾩닔 ?λ?. ?몃Т?ъ뿉寃??쒖텧?댁빞 ??
 */

import { getState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { renderInsightHero } from './ux-toolkit.js';

// jsPDF??autoTable ?뚮윭洹몄씤 ?곌껐 (ESM ?섍꼍?먯꽌 ?꾩닔)
applyPlugin(jsPDF);
import { applyKoreanFont, getKoreanFontStyle } from './pdf-font.js';

export function renderLedgerPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];

  // 湲곕낯 湲곌컙: ?대쾲 ??
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = now.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">?뱬</span> ?섎텋遺 (?ш퀬?섎텋???</h1>
        <div class="page-desc">湲곌컙蹂??덈ぉ???낃퀬쨌異쒓퀬쨌?붾웾???λ? ?뺤떇?쇰줈 ?먮룞 ?앹꽦?⑸땲??</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-ledger-excel">?뱿 ?묒? ?ㅼ슫濡쒕뱶</button>
        <button class="btn btn-primary" id="btn-ledger-pdf">?뱞 PDF ?ㅼ슫濡쒕뱶</button>
      </div>
    </div>

    <!-- 湲곌컙 ?좏깮 -->
    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">?쒖옉??/label>
          <input class="form-input" type="date" id="ledger-from" value="${firstDay}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">醫낅즺??/label>
          <input class="form-input" type="date" id="ledger-to" value="${lastDay}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">?덈ぉ ?꾪꽣</label>
          <select class="form-select" id="ledger-item-filter">
            <option value="">?꾩껜 ?덈ぉ</option>
            ${items.map(item => `<option value="${item.itemName}">${item.itemName} (${item.itemCode || '-'})</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" id="btn-ledger-render" style="margin-top:18px;">議고쉶</button>
      </div>
    </div>

    <!-- ?섎텋遺 ?뚯씠釉?-->
    <div class="card card-flush" id="ledger-table-area">
      <div style="padding:24px; text-align:center; color:var(--text-muted);">議고쉶 踰꾪듉???뚮윭二쇱꽭??/div>
    </div>
  `;

  // 珥덇린 ?뚮뜑留?
  renderLedgerTable();

  // 議고쉶 踰꾪듉
  container.querySelector('#btn-ledger-render').addEventListener('click', renderLedgerTable);

  function renderLedgerTable() {
    const from = container.querySelector('#ledger-from').value;
    const to = container.querySelector('#ledger-to').value;
    const itemFilter = container.querySelector('#ledger-item-filter').value;

    const ledgerData = buildLedger(items, transactions, from, to, itemFilter);
    const tableArea = container.querySelector('#ledger-table-area');

    if (ledgerData.length === 0) {
      tableArea.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">?대떦 湲곌컙???곗씠?곌? ?놁뒿?덈떎.</div>';
      return;
    }

    tableArea.innerHTML = `
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); background:var(--bg-card);">
        <strong>?뱬 ?섎텋???/strong>
        <span style="color:var(--text-muted); font-size:13px; margin-left:8px;">${from} ~ ${to} (${ledgerData.length}媛??덈ぉ)</span>
      </div>
      <div class="table-wrapper" style="border:none; border-radius:0;">
        <table class="data-table" id="ledger-data-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>?덈ぉ紐?/th>
              <th>肄붾뱶</th>
              <th>?⑥쐞</th>
              <th class="text-right">湲곗큹?ш퀬</th>
              <th class="text-right" style="color:var(--success);">?낃퀬</th>
              <th class="text-right" style="color:var(--danger);">異쒓퀬</th>
              <th class="text-right" style="font-weight:700;">湲곕쭚?ш퀬</th>
              <th class="text-right">?④?</th>
              <th class="text-right">?ш퀬湲덉븸</th>
            </tr>
          </thead>
          <tbody>
            ${ledgerData.map((row, i) => `
              <tr>
                <td class="col-num">${i + 1}</td>
                <td><strong>${row.itemName}</strong></td>
                <td style="color:var(--text-muted); font-size:12px;">${row.itemCode || '-'}</td>
                <td>${row.unit || '-'}</td>
                <td class="text-right">${row.openingQty.toLocaleString('ko-KR')}</td>
                <td class="text-right type-in">${row.inQty > 0 ? '+' + row.inQty.toLocaleString('ko-KR') : '-'}</td>
                <td class="text-right type-out">${row.outQty > 0 ? '-' + row.outQty.toLocaleString('ko-KR') : '-'}</td>
                <td class="text-right" style="font-weight:700;">${row.closingQty.toLocaleString('ko-KR')}</td>
                <td class="text-right">${row.unitPrice > 0 ? '₩' + Math.round(row.unitPrice).toLocaleString('ko-KR') : '-'}</td>
                <td class="text-right">${row.closingValue > 0 ? '₩' + Math.round(row.closingValue).toLocaleString('ko-KR') : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:var(--bg-card);">
              <td colspan="4" class="text-right">?⑷퀎</td>
              <td class="text-right">${ledgerData.reduce((s, r) => s + r.openingQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right type-in">+${ledgerData.reduce((s, r) => s + r.inQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right type-out">-${ledgerData.reduce((s, r) => s + r.outQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right">${ledgerData.reduce((s, r) => s + r.closingQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right"></td>
              <td class="text-right">??{Math.round(ledgerData.reduce((s, r) => s + r.closingValue, 0)).toLocaleString('ko-KR')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // ?묒? ?ㅼ슫濡쒕뱶
  container.querySelector('#btn-ledger-excel').addEventListener('click', () => {
    const from = container.querySelector('#ledger-from').value;
    const to = container.querySelector('#ledger-to').value;
    const itemFilter = container.querySelector('#ledger-item-filter').value;
    const data = buildLedger(items, transactions, from, to, itemFilter);
    if (data.length === 0) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }

    const exportData = data.map(r => ({
      '품목명': r.itemName,
      '품목코드': r.itemCode || '',
      '단위': r.unit || '',
      '기초재고': r.openingQty,
      '입고': r.inQty,
      '출고': r.outQty,
      '기말재고': r.closingQty,
      '단가': r.unitPrice,
      '재고금액': r.closingValue,
    }));
    downloadExcel(exportData, `수불부_${from}_${to}`);
    showToast('수불부를 엑셀로 다운로드했습니다.', 'success');
  });

  // PDF ?ㅼ슫濡쒕뱶
  container.querySelector('#btn-ledger-pdf').addEventListener('click', async () => {
    const from = container.querySelector('#ledger-from').value;
    const to = container.querySelector('#ledger-to').value;
    const itemFilter = container.querySelector('#ledger-item-filter').value;
    const data = buildLedger(items, transactions, from, to, itemFilter);
    if (data.length === 0) { showToast('?대낫???곗씠?곌? ?놁뒿?덈떎.', 'warning'); return; }

    try {
      showToast('PDF ?앹꽦 以?.. (?고듃 濡쒕뵫)', 'info', 2000);
      const doc = new jsPDF('landscape');
      const fontStyle = getKoreanFontStyle();
      await applyKoreanFont(doc);

      doc.setFontSize(16);
      doc.text('?ш퀬 ?섎텋???, 148, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`湲곌컙: ${from} ~ ${to}`, 14, 25);

      const tableData = data.map((r, i) => [
        i + 1, r.itemName, r.itemCode || '-', r.unit || '-',
        r.openingQty, r.inQty > 0 ? '+' + r.inQty : '-',
        r.outQty > 0 ? '-' + r.outQty : '-', r.closingQty,
        r.unitPrice > 0 ? '₩' + Math.round(r.unitPrice).toLocaleString() : '-',
        r.closingValue > 0 ? '₩' + r.closingValue.toLocaleString() : '-',
      ]);

      doc.autoTable({
        startY: 32,
        head: [['No', '?덈ぉ紐?, '肄붾뱶', '?⑥쐞', '湲곗큹?ш퀬', '?낃퀬', '異쒓퀬', '湲곕쭚?ш퀬', '?④?', '?ш퀬湲덉븸']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], ...fontStyle },
        bodyStyles: { ...fontStyle },
        styles: { fontSize: 8, ...fontStyle },
      });

      doc.save(`?섎텋???${from}_${to}.pdf`);
      showToast('?섎텋遺 PDF瑜??ㅼ슫濡쒕뱶?덉뒿?덈떎.', 'success');
    } catch (err) {
      showToast('PDF ?앹꽦 ?ㅽ뙣: ' + err.message, 'error');
    }
  });
}

/**
 * ?섎텋遺 ?곗씠???앹꽦
 * 濡쒖쭅: 湲곗큹?ш퀬 = ?꾩옱?ш퀬 - 湲곌컙?낃퀬 + 湲곌컙異쒓퀬
 * (嫄곕옒 ?대젰????궛?댁꽌 湲곗큹?ш퀬瑜?異붿젙)
 */
function buildLedger(items, transactions, from, to, itemFilter) {
  // ?대떦 湲곌컙 嫄곕옒留??꾪꽣
  const periodTx = transactions.filter(tx => tx.date >= from && tx.date <= to);

  // ?덈ぉ蹂??낆텧怨?吏묎퀎
  const txMap = {};
  periodTx.forEach(tx => {
    const key = tx.itemName;
    if (!txMap[key]) txMap[key] = { inQty: 0, outQty: 0 };
    const qty = parseFloat(tx.quantity) || 0;
    if (tx.type === 'in') txMap[key].inQty += qty;
    else txMap[key].outQty += qty;
  });

  // ?섎텋遺 ???앹꽦
  let targetItems = items;
  if (itemFilter) {
    targetItems = items.filter(i => i.itemName === itemFilter);
  }

  return targetItems.map(item => {
    const currentQty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const tx = txMap[item.itemName] || { inQty: 0, outQty: 0 };

    // 湲곗큹?ш퀬 ??궛: ?꾩옱?ш퀬 - 湲곌컙?낃퀬 + 湲곌컙異쒓퀬
    const openingQty = currentQty - tx.inQty + tx.outQty;
    const closingQty = currentQty;
    const closingValue = closingQty * unitPrice;

    return {
      itemName: item.itemName,
      itemCode: item.itemCode || '',
      unit: item.unit || '',
      unitPrice,
      openingQty: Math.max(0, openingQty),
      inQty: tx.inQty,
      outQty: tx.outQty,
      closingQty,
      closingValue,
    };
  }).filter(r => r.openingQty > 0 || r.inQty > 0 || r.outQty > 0 || r.closingQty > 0);
}

