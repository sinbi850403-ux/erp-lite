/**
 * page-costing.js - ?먭? 怨꾩궛 (FIFO / ?대룞?됯퇏踰?
 * ??븷: 留ㅼ엯 ?먭?瑜??먮룞 怨꾩궛?섏뿬 ?뺥솗???섏씡??遺꾩꽍 吏??
 * ???꾩닔? ???먭?瑜?紐⑤Ⅴ硫?留덉쭊??紐⑤Ⅴ怨? 留덉쭊??紐⑤Ⅴ硫?寃쎌쁺??紐삵븿
 */

import { getState, setState } from './store.js';
import { downloadExcel } from './excel.js';
import { showToast } from './toast.js';

export function renderCostingPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];

  // ?먭? 怨꾩궛 諛⑹떇 (湲곕낯: ?대룞?됯퇏踰?
  const costMethod = state.costMethod || 'weighted-avg';

  // ?먭? 怨꾩궛 ?ㅽ뻾
  const costData = calculateCosts(items, transactions, costMethod);

  // ?꾩껜 ?붿빟
  const totalCost = costData.reduce((s, r) => s + r.totalCost, 0);
  const totalMarket = costData.reduce((s, r) => s + r.marketValue, 0);
  const totalProfit = totalMarket - totalCost;
  const avgMargin = totalMarket > 0 ? ((totalProfit / totalMarket) * 100).toFixed(1) : '-';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">?뮥</span> ?먭? 遺꾩꽍</h1>
        <div class="page-desc">留ㅼ엯 ?먭?瑜??먮룞 怨꾩궛?섍퀬 ?섏씡?깆쓣 遺꾩꽍?⑸땲??</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-cost-export">?뱿 ?먭????대낫?닿린</button>
      </div>
    </div>

    <!-- ?먭? 怨꾩궛 諛⑹떇 ?좏깮 -->
    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <label class="form-label" style="margin:0; font-weight:600;">?먭? 怨꾩궛 諛⑹떇:</label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="cost-method" value="weighted-avg" ${costMethod === 'weighted-avg' ? 'checked' : ''} />
          ?대룞?됯퇏踰?<span style="color:var(--text-muted); font-size:11px;">(沅뚯옣)</span>
        </label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="cost-method" value="fifo" ${costMethod === 'fifo' ? 'checked' : ''} />
          ?좎엯?좎텧踰?(FIFO)
        </label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="cost-method" value="latest" ${costMethod === 'latest' ? 'checked' : ''} />
          理쒖쥌留ㅼ엯?먭?踰?
        </label>
      </div>
    </div>

    <!-- KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="stat-card">
        <div class="stat-label">珥?留ㅼ엯?먭?</div>
        <div class="stat-value">${totalCost > 0 ? '₩' + totalCost.toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">?쒓? ?섏궛??/div>
        <div class="stat-value">${totalMarket > 0 ? '₩' + totalMarket.toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">?덉긽 留덉쭊</div>
        <div class="stat-value ${totalProfit >= 0 ? 'text-success' : 'text-danger'}">${totalProfit !== 0 ? '₩' + totalProfit.toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">?됯퇏 留덉쭊??/div>
        <div class="stat-value text-accent">${avgMargin}%</div>
      </div>
    </div>

    <!-- ?먭? ?뚯씠釉?-->
    <div class="card card-flush">
      <div style="padding:12px 16px; border-bottom:1px solid var(--border); background:var(--bg-card);">
        <strong>?뮥 ?덈ぉ蹂??먭? 遺꾩꽍</strong>
        <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">(${costData.length}媛??덈ぉ)</span>
      </div>
      <div class="table-wrapper" style="border:none; border-radius:0;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>?덈ぉ紐?/th>
              <th>肄붾뱶</th>
              <th class="text-right">?ш퀬?섎웾</th>
              <th class="text-right">?⑥쐞?먭?</th>
              <th class="text-right">珥??먭?</th>
              <th class="text-right">?먮ℓ?④?</th>
              <th class="text-right">?쒓??섏궛</th>
              <th class="text-right">?덉긽?댁씡</th>
              <th class="text-right">留덉쭊??/th>
            </tr>
          </thead>
          <tbody>
            ${costData.map((r, i) => {
              const margin = r.marketValue > 0 ? ((r.profit / r.marketValue) * 100).toFixed(1) : '-';
              return `
                <tr class="${parseFloat(margin) < 0 ? 'row-danger' : parseFloat(margin) < 10 ? 'row-warning' : ''}">
                  <td class="col-num">${i + 1}</td>
                  <td><strong>${r.itemName}</strong></td>
                  <td style="color:var(--text-muted); font-size:12px;">${r.itemCode || '-'}</td>
                  <td class="text-right">${r.qty.toLocaleString('ko-KR')}</td>
                  <td class="text-right">??{r.unitCost.toLocaleString('ko-KR')}</td>
                  <td class="text-right">??{r.totalCost.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${r.sellPrice > 0 ? '₩' + r.sellPrice.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right">${r.marketValue > 0 ? '₩' + r.marketValue.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right ${r.profit >= 0 ? 'type-in' : 'type-out'}">${r.profit !== 0 ? '₩' + r.profit.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right" style="font-weight:600;">${margin}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // ?먭? 諛⑹떇 蹂寃?
  container.querySelectorAll('input[name="cost-method"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      setState({ costMethod: e.target.value });
      renderCostingPage(container, navigateTo);
    });
  });

  // ?대낫?닿린
  container.querySelector('#btn-cost-export').addEventListener('click', () => {
    if (costData.length === 0) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
    const data = costData.map(r => ({
      '품목명': r.itemName,
      '코드': r.itemCode || '',
      '재고수량': r.qty,
      '단위원가': r.unitCost,
      '총 원가': r.totalCost,
      '판매단가': r.sellPrice,
      '시가환산': r.marketValue,
      '예상이익': r.profit,
      '마진율(%)': r.marketValue > 0 ? ((r.profit / r.marketValue) * 100).toFixed(1) : 0,
    }));
    downloadExcel(data, `원가분석_${new Date().toISOString().split('T')[0]}`);
    showToast('원가 분석표를 엑셀로 내보냈습니다.', 'success');
  });
}

/**
 * ?먭? 怨꾩궛 濡쒖쭅
 * ?대룞?됯퇏踰? 湲곗〈 ?④? 洹몃?濡??ъ슜 (留ㅼ엯 ?쒖젏 ?됯퇏)
 * FIFO: 媛???ㅻ옒??留ㅼ엯 ?④?遺???곸슜
 * 理쒖쥌留ㅼ엯?먭?踰? 媛??理쒓렐 留ㅼ엯 ?④? ?곸슜
 */
function calculateCosts(items, transactions, method) {
  return items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const sellPrice = parseFloat(item.sellPrice) || unitPrice;

    // ?대떦 ?덈ぉ???낃퀬 嫄곕옒
    const inTx = transactions
      .filter(tx => tx.type === 'in' && tx.itemName === item.itemName)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let unitCost;

    switch (method) {
      case 'fifo':
        // FIFO: 媛???ㅻ옒??留ㅼ엯 ?④? (泥??낃퀬)
        unitCost = inTx.length > 0 ? (parseFloat(inTx[0].unitPrice) || unitPrice) : unitPrice;
        break;
      case 'latest':
        // 理쒖쥌留ㅼ엯?먭?: 媛??理쒓렐 ?낃퀬 ?④?
        unitCost = inTx.length > 0 ? (parseFloat(inTx[inTx.length - 1].unitPrice) || unitPrice) : unitPrice;
        break;
      case 'weighted-avg':
      default:
        // ?대룞?됯퇏: ?꾩껜 ?낃퀬 媛以묓룊洹?(?놁쑝硫??꾩옱 ?④?)
        if (inTx.length > 0) {
          let totalQty = 0, totalVal = 0;
          inTx.forEach(tx => {
            const txQty = parseFloat(tx.quantity) || 0;
            const txPrice = parseFloat(tx.unitPrice) || unitPrice;
            totalQty += txQty;
            totalVal += txQty * txPrice;
          });
          unitCost = totalQty > 0 ? Math.round(totalVal / totalQty) : unitPrice;
        } else {
          unitCost = unitPrice;
        }
        break;
    }

    // ??Math.round? ???먮떒??諛섏삱由쇱쑝濡??뚯닔???쒓굅 (?쒓뎅 ?뚭퀎 湲곗?)
    unitCost = Math.round(unitCost);
    const totalCost = Math.round(qty * unitCost);
    const marketValue = Math.round(qty * sellPrice);
    const profit = marketValue - totalCost;

    return {
      itemName: item.itemName,
      itemCode: item.itemCode || '',
      qty,
      unitCost,
      totalCost,
      sellPrice: Math.round(sellPrice),
      marketValue,
      profit,
    };
  });
}

