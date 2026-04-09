/**
 * page-profit.js - ?먯씡 遺꾩꽍 ??쒕낫??(?뚭퀎???몃Т??愿??
 * 
 * ???뚯긽怨듭씤??媛??以묒슂?섍쾶 蹂대뒗 3媛吏:
 *   1. ?대쾲 ???쇰쭏 ?⑥븯?? (留ㅼ텧珥앹씠??
 *   2. ?대뼡 ?덈ぉ??媛??留롮씠 踰뚯뼱二쇰굹? (?덈ぉ蹂??댁씡瑜?
 *   3. 留덉쭊???쇰쭏?멸?? (留ㅼ텧珥앹씠?듬쪧)
 * 
 * ?뚭퀎 ?⑹뼱 ?뺣━:
 *   - 留ㅼ텧??= ?섎웾 횞 ?먮ℓ媛(?뚭?)
 *   - 留ㅼ텧?먭?(留ㅼ엯?먭?) = ?섎웾 횞 留ㅼ엯媛(?먭?)
 *   - 留ㅼ텧珥앹씠??= 留ㅼ텧??- 留ㅼ텧?먭?
 *   - 留ㅼ텧珥앹씠?듬쪧(%) = (留ㅼ텧珥앹씠??/ 留ㅼ텧?? 횞 100
 *   - 留덉쭊??%) = (?댁씡 / ?먭?) 횞 100 = "?먭? ?鍮??쇰쭏???⑤뒗吏"
 *   - ?댁씡瑜?%) = (?댁씡 / ?먮ℓ媛) 횞 100 = "?먮ℓ媛 ?鍮??쇰쭏???⑤뒗吏"
 */

import { getState } from './store.js';
import { getSalePrice } from './price-utils.js';

export function renderProfitPage(container, navigateTo) {
  const state = getState();
  const transactions = state.transactions || [];
  const items = state.mappedData || [];

  // === ?ш퀬 湲곕컲 ?먯씡 (?덈ぉ ?곗씠?곗뿉??怨꾩궛) ===
  // ?? ??嫄곕옒 ?대젰???놁뼱???ш퀬 紐⑸줉留??덉쑝硫??좎옱 ?댁씡??蹂댁뿬以?
  const inventoryAnalysis = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const costPrice = parseFloat(item.unitPrice) || 0;     // 留ㅼ엯媛
    const salePrice = getSalePrice(item);                    // ?먮ℓ媛 (?놁쑝硫?20% 留덉쭊 異붿젙)
    const hasRealSalePrice = parseFloat(item.salePrice) > 0; // ?ㅼ젣 ?먮ℓ媛 ?낅젰 ?щ?

    const totalCost = Math.round(qty * costPrice);            // 留ㅼ엯 珥앹븸 (?먮떒??諛섏삱由?
    const totalRevenue = Math.round(qty * salePrice);          // 留ㅼ텧 珥앹븸 (?먮떒??諛섏삱由?
    const profit = totalRevenue - totalCost;                   // ?댁씡
    const profitRate = totalRevenue > 0 ? (profit / totalRevenue * 100) : 0; // ?댁씡瑜?%)
    const marginRate = totalCost > 0 ? (profit / totalCost * 100) : 0;      // 留덉쭊??%)

    return {
      name: item.itemName || '(誘몃텇瑜?',
      code: item.itemCode || '',
      category: item.category || '',
      qty,
      costPrice,
      salePrice,
      hasRealSalePrice,
      totalCost,
      totalRevenue,
      profit,
      profitRate,
      marginRate,
    };
  }).filter(d => d.qty > 0 || d.totalCost > 0); // ?섎웾 ?먮뒗 湲덉븸???덈뒗 寃껊쭔

  // === ?꾩껜 ?⑹궛 ===
  const totalCost = inventoryAnalysis.reduce((s, d) => s + d.totalCost, 0);
  const totalRevenue = inventoryAnalysis.reduce((s, d) => s + d.totalRevenue, 0);
  const totalProfit = totalRevenue - totalCost;
  const avgProfitRate = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : '0';
  const avgMarginRate = totalCost > 0 ? (totalProfit / totalCost * 100).toFixed(1) : '0';

  // ?먮ℓ媛 ?낅젰??鍮꾩쑉
  const salePriceCount = inventoryAnalysis.filter(d => d.hasRealSalePrice).length;
  const salePricePercent = inventoryAnalysis.length > 0
    ? Math.round(salePriceCount / inventoryAnalysis.length * 100) : 0;

  // === ?댁씡 TOP 5 / 留덉쭊 ??? TOP 5 ===
  const sorted = [...inventoryAnalysis].sort((a, b) => b.profit - a.profit);
  const top5 = sorted.slice(0, 5);
  const lowMargin = [...inventoryAnalysis]
    .filter(d => d.totalCost > 0 && d.hasRealSalePrice)
    .sort((a, b) => a.profitRate - b.profitRate)
    .slice(0, 5);

  // === 遺꾨쪟蹂??댁씡 ===
  const categoryMap = {};
  inventoryAnalysis.forEach(d => {
    const cat = d.category || '(誘몃텇瑜?';
    if (!categoryMap[cat]) categoryMap[cat] = { cost: 0, revenue: 0, profit: 0, count: 0 };
    categoryMap[cat].cost += d.totalCost;
    categoryMap[cat].revenue += d.totalRevenue;
    categoryMap[cat].profit += d.profit;
    categoryMap[cat].count += 1;
  });
  const categoryData = Object.entries(categoryMap)
    .map(([name, d]) => ({
      name, ...d,
      rate: d.revenue > 0 ? (d.profit / d.revenue * 100).toFixed(1) : '0',
    }))
    .sort((a, b) => b.profit - a.profit);

  // === 嫄곕옒 湲곕컲 ?먯씡 (?붾퀎) ===
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthTx = transactions.filter(tx => (tx.date || '').startsWith(currentMonth));
  const monthIn = monthTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + (parseFloat(tx.totalPrice || tx.quantity * tx.unitPrice) || 0), 0);
  const monthOut = monthTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + (parseFloat(tx.totalPrice || tx.quantity * (getSalePrice(tx))) || 0), 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">?뮰</span> ?먯씡 遺꾩꽍</h1>
        <div class="page-desc">留ㅼ엯媛쨌?먮ℓ媛 湲곕컲 ?댁씡瑜좎쓣 ?뺥솗?섍쾶 遺꾩꽍?⑸땲??</div>
      </div>
    </div>

    <!-- ?먮ℓ媛 ?낅젰 ?덈궡 (?낅젰瑜좎씠 ??쑝硫?寃쎄퀬) -->
    ${salePricePercent < 50 ? `
    <div class="alert alert-info" style="margin-bottom:16px;">
      ?좑툘 <strong>?먮ℓ媛(?뚭?) ?낅젰瑜? ${salePricePercent}%</strong> (${salePriceCount}/${inventoryAnalysis.length}媛??덈ぉ)
      <br/><span style="font-size:12px; color:var(--text-muted);">
        ?ш퀬 ?꾪솴?먯꽌 ?먮ℓ?④?瑜??낅젰?섎㈃ ???뺥솗???댁씡瑜좎쓣 蹂????덉뒿?덈떎. 誘몄엯???덈ぉ? 留ㅼ엯媛 +20% 異붿젙移섎줈 怨꾩궛?⑸땲??
      </span>
    </div>
    ` : ''}

    <!-- ?곣봺??1. ?먯씡 ?붿빟 (媛??以묒슂???レ옄) ?곣봺??-->
    <div class="card" style="background:linear-gradient(135deg, rgba(63,185,80,0.05), rgba(37,99,235,0.05)); margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">?뱤 ?먯씡 ?붿빟 (留ㅼ텧珥앹씠??</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:16px; text-align:center; margin-top:12px;">
        <div>
          <div style="font-size:11px; color:var(--text-muted);">?덉긽 留ㅼ텧??/div>
          <div style="font-size:11px; color:var(--text-muted);">?섎웾 횞 ?먮ℓ媛</div>
          <div style="font-size:22px; font-weight:800; color:var(--accent); margin-top:4px;">??{totalRevenue.toLocaleString('ko-KR')}</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">留ㅼ엯 ?먭?</div>
          <div style="font-size:11px; color:var(--text-muted);">?섎웾 횞 留ㅼ엯媛</div>
          <div style="font-size:22px; font-weight:800; margin-top:4px;">??{totalCost.toLocaleString('ko-KR')}</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">留ㅼ텧珥앹씠??/div>
          <div style="font-size:11px; color:var(--text-muted);">留ㅼ텧 - ?먭?</div>
          <div style="font-size:22px; font-weight:800; color:${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; margin-top:4px;">
            ${totalProfit >= 0 ? '+' : ''}??{totalProfit.toLocaleString('ko-KR')}
          </div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">?댁씡瑜?/div>
          <div style="font-size:11px; color:var(--text-muted);">?댁씡 첨 留ㅼ텧 횞 100</div>
          <div style="font-size:22px; font-weight:800; color:${parseFloat(avgProfitRate) >= 0 ? 'var(--success)' : 'var(--danger)'}; margin-top:4px;">
            ${avgProfitRate}%
          </div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">留덉쭊??/div>
          <div style="font-size:11px; color:var(--text-muted);">?댁씡 첨 ?먭? 횞 100</div>
          <div style="font-size:22px; font-weight:800; color:var(--accent); margin-top:4px;">
            ${avgMarginRate}%
          </div>
        </div>
      </div>
      <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border); font-size:11px; color:var(--text-muted);">
        ?뮕 <strong>?댁씡瑜?/strong> = ?먮ℓ媛 ?鍮??⑤뒗 湲덉븸 鍮꾩쑉 | <strong>留덉쭊??/strong> = ?먭? ?鍮??⑤뒗 湲덉븸 鍮꾩쑉
        (?? 1留뚯썝???ъ꽌 1.5留뚯썝???붾㈃ ???댁씡瑜?33.3%, 留덉쭊??50%)
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
      <!-- ?곣봺??2. ?댁씡 TOP 5 (?⑥옄 ?덈ぉ) ?곣봺??-->
      <div class="card">
        <div class="card-title">?룇 ?댁씡 TOP 5 (?⑥옄 ?덈ぉ)</div>
        ${top5.length === 0 ? '<div style="text-align:center; padding:20px; color:var(--text-muted);">?곗씠???놁쓬</div>' : ''}
        ${top5.map((d, i) => `
          <div style="padding:8px 0; border-bottom:1px solid var(--border-light);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:var(--text-muted); font-size:12px; margin-right:4px;">${i + 1}</span>
                <strong>${d.name}</strong>
                ${d.code ? `<span style="color:var(--text-muted); font-size:11px; margin-left:4px;">(${d.code})</span>` : ''}
              </div>
              <span style="font-weight:700; color:var(--success); font-size:14px;">
                +??{d.profit.toLocaleString('ko-KR')}
              </span>
            </div>
            <div style="display:flex; gap:12px; font-size:11px; color:var(--text-muted); margin-top:4px;">
              <span>留ㅼ엯媛 ??{d.costPrice.toLocaleString('ko-KR')}</span>
              <span>??/span>
              <span>?먮ℓ媛 ??{d.salePrice.toLocaleString('ko-KR')}
                ${!d.hasRealSalePrice ? '<span style="color:var(--warning);">(異붿젙)</span>' : ''}
              </span>
              <span>횞${d.qty}媛?/span>
              <span style="font-weight:600; color:var(--accent);">?댁씡瑜?${d.profitRate.toFixed(1)}%</span>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- ?곣봺??3. 留덉쭊 ??? TOP 5 (二쇱쓽 ?덈ぉ) ?곣봺??-->
      <div class="card">
        <div class="card-title">?좑툘 留덉쭊 ??? ?덈ぉ TOP 5 (二쇱쓽)</div>
        ${lowMargin.length === 0 ? '<div style="text-align:center; padding:20px; color:var(--text-muted);">?먮ℓ媛媛 ?낅젰???덈ぉ???놁뒿?덈떎</div>' : ''}
        ${lowMargin.map((d, i) => `
          <div style="padding:8px 0; border-bottom:1px solid var(--border-light);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:var(--text-muted); font-size:12px; margin-right:4px;">${i + 1}</span>
                <strong>${d.name}</strong>
              </div>
              <span style="font-weight:700; color:${d.profitRate < 10 ? 'var(--danger)' : 'var(--warning)'}; font-size:14px;">
                ?댁씡瑜?${d.profitRate.toFixed(1)}%
              </span>
            </div>
            <div style="display:flex; gap:12px; font-size:11px; color:var(--text-muted); margin-top:4px;">
              <span>留ㅼ엯媛 ??{d.costPrice.toLocaleString('ko-KR')}</span>
              <span>??/span>
              <span>?먮ℓ媛 ??{d.salePrice.toLocaleString('ko-KR')}</span>
              <span>?댁씡 ??{(d.salePrice - d.costPrice).toLocaleString('ko-KR')}/媛?/span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- ?곣봺??4. 遺꾨쪟蹂??댁씡 遺꾩꽍 ?곣봺??-->
    <div class="card" style="margin-top:16px;">
      <div class="card-title">?뱥 遺꾨쪟蹂??댁씡 遺꾩꽍</div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>遺꾨쪟</th>
              <th class="text-right">?덈ぉ??/th>
              <th class="text-right">留ㅼ엯 珥앹븸</th>
              <th class="text-right">留ㅼ텧 珥앹븸 (?덉긽)</th>
              <th class="text-right">?댁씡</th>
              <th class="text-right">?댁씡瑜?/th>
            </tr>
          </thead>
          <tbody>
            ${categoryData.map(c => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td class="text-right">${c.count}媛?/td>
                <td class="text-right">??{c.cost.toLocaleString('ko-KR')}</td>
                <td class="text-right">??{c.revenue.toLocaleString('ko-KR')}</td>
                <td class="text-right" style="font-weight:700; color:${c.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                  ${c.profit >= 0 ? '+' : ''}??{c.profit.toLocaleString('ko-KR')}
                </td>
                <td class="text-right" style="font-weight:700; color:${parseFloat(c.rate) >= 20 ? 'var(--success)' : parseFloat(c.rate) >= 10 ? 'var(--warning)' : 'var(--danger)'};">
                  ${c.rate}%
                </td>
              </tr>
            `).join('')}
            ${categoryData.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">遺꾨쪟 ?곗씠?곌? ?놁뒿?덈떎</td></tr>' : ''}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:var(--bg-card);">
              <td>?⑷퀎</td>
              <td class="text-right">${inventoryAnalysis.length}媛?/td>
              <td class="text-right">??{totalCost.toLocaleString('ko-KR')}</td>
              <td class="text-right">??{totalRevenue.toLocaleString('ko-KR')}</td>
              <td class="text-right" style="color:${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                ${totalProfit >= 0 ? '+' : ''}??{totalProfit.toLocaleString('ko-KR')}
              </td>
              <td class="text-right">${avgProfitRate}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- ?곣봺??5. ?꾩껜 ?덈ぉ ?댁씡瑜??곸꽭 ?곣봺??-->
    <div class="card" style="margin-top:16px;">
      <div class="card-title">?벀 ?덈ぉ蹂??댁씡瑜??곸꽭 (${inventoryAnalysis.length}媛?</div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>?덈ぉ紐?/th>
              <th>遺꾨쪟</th>
              <th class="text-right">?섎웾</th>
              <th class="text-right">留ㅼ엯媛</th>
              <th class="text-right">?먮ℓ媛</th>
              <th class="text-right">媛쒕떦 ?댁씡</th>
              <th class="text-right">?댁씡瑜?%)</th>
              <th class="text-right">留덉쭊??%)</th>
              <th class="text-right">珥??댁씡</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((d, i) => {
              const perUnitProfit = d.salePrice - d.costPrice;
              return `
              <tr>
                <td class="col-num">${i + 1}</td>
                <td>
                  <strong>${d.name}</strong>
                  ${!d.hasRealSalePrice ? '<span style="font-size:10px; color:var(--warning); margin-left:3px;">異붿젙</span>' : ''}
                </td>
                <td style="font-size:12px; color:var(--text-muted);">${d.category || '-'}</td>
                <td class="text-right">${d.qty.toLocaleString('ko-KR')}</td>
                <td class="text-right">??{d.costPrice.toLocaleString('ko-KR')}</td>
                <td class="text-right">??{d.salePrice.toLocaleString('ko-KR')}</td>
                <td class="text-right" style="color:${perUnitProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                  ${perUnitProfit >= 0 ? '+' : ''}??{perUnitProfit.toLocaleString('ko-KR')}
                </td>
                <td class="text-right" style="font-weight:600; color:${d.profitRate >= 20 ? 'var(--success)' : d.profitRate >= 10 ? 'var(--warning)' : 'var(--danger)'};">
                  ${d.profitRate.toFixed(1)}%
                </td>
                <td class="text-right" style="color:var(--text-muted);">${d.marginRate.toFixed(1)}%</td>
                <td class="text-right" style="font-weight:700; color:${d.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                  ${d.profit >= 0 ? '+' : ''}??{d.profit.toLocaleString('ko-KR')}
                </td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- ?뚭퀎 ?⑹뼱 ?ㅻ챸 (援먯쑁??紐⑹쟻) -->
    <div style="margin-top:20px; padding:16px; border:1px solid var(--border); border-radius:8px; font-size:12px; color:var(--text-muted);">
      <strong>?뱰 ?⑹뼱 ?ㅻ챸</strong><br/>
      ??<strong>?댁씡瑜?%)</strong> = (?먮ℓ媛 - 留ㅼ엯媛) 첨 ?먮ℓ媛 횞 100 ??"?????쇰쭏???⑤뒗吏" (?몃Т?쑣룹???湲곗?)<br/>
      ??<strong>留덉쭊??%)</strong> = (?먮ℓ媛 - 留ㅼ엯媛) 첨 留ㅼ엯媛 횞 100 ??"?먭? ?鍮??쇰쭏???щ젮 ?뚮뒗吏" (?곸씤 湲곗?)<br/>
      ??<strong style="color:var(--warning);">異붿젙</strong> ?쒖떆 = ?먮ℓ媛瑜??낅젰?섏? ?딆븘 留ㅼ엯媛 +20%濡?異붿젙???덈ぉ<br/>
      ???ш퀬 ?꾪솴?먯꽌 <strong>?먮ℓ?④?</strong>瑜??낅젰?섎㈃ ?뺥솗??遺꾩꽍??媛?ν빀?덈떎.
    </div>
  `;
}

