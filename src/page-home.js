/**
 * page-home.js - 대시보드 홈 (경영 현황판)
 * 역할: 앱 진입 시 한눈에 경영 현황을 파악할 수 있는 메인 대시보드
 * 왜 필요? → 매일 아침 열면 "오늘 뭘 해야 하는지" 바로 알 수 있어야 진짜 ERP
 */

import { getState } from './store.js';
import { getNotifications } from './notifications.js';
import { renderWeeklyTrendChart, renderCategoryChart, renderMonthlyChart, destroyAllCharts } from './charts.js';

export function renderHomePage(container, navigateTo) {
  // 페이지 전환 시 이전 차트 제거 (메모리 관리)
  destroyAllCharts();

  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};
  const notifications = getNotifications();

  // === KPI 계산 ===
  const totalItems = items.length;
  const totalQty = items.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const totalValue = items.reduce((s, r) => s + (parseFloat(r.totalPrice) || (parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0)), 0);

  // 안전재고 부족 품목
  const lowStockItems = items.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity) || 0) <= min;
  });

  // 오늘 거래
  const today = new Date().toISOString().split('T')[0];
  const todayTx = transactions.filter(tx => tx.date === today);
  const todayIn = todayTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  const todayOut = todayTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);

  // 최근 7일 추이
  const weekData = getLast7Days(transactions);

  // 최근 6개월 추이
  const monthData = getLast6Months(transactions);

  // 카테고리별 비율
  const catMap = {};
  items.forEach(item => {
    const cat = item.category || '미분류';
    catMap[cat] = (catMap[cat] || 0) + (parseFloat(item.quantity) || 0);
  });
  const categories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // 최근 입출고 5건
  const recentTx = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

  // 상위 품목 5개
  const topItems = [...items].sort((a, b) => (parseFloat(b.totalPrice) || 0) - (parseFloat(a.totalPrice) || 0)).slice(0, 5);

  // 거래처별 통계
  const vendorMap = {};
  items.forEach(item => {
    const v = item.vendor || '';
    if (!v) return;
    vendorMap[v] = (vendorMap[v] || 0) + 1;
  });
  const vendorCount = Object.keys(vendorMap).length;

  // 재고 회전율 계산
  // 왜? → 재고가 얼마나 빠르게 소진되는지 보여주는 핵심 지표
  const last30Out = transactions.filter(tx => {
    if (tx.type !== 'out') return false;
    const txDate = new Date(tx.date);
    const ago30 = new Date(); ago30.setDate(ago30.getDate() - 30);
    return txDate >= ago30;
  }).reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  const avgInventory = totalQty || 1;
  const turnoverRate = (last30Out / avgInventory * 12).toFixed(1); // 연간 환산

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🏠</span> 대시보드</h1>
        <div class="page-desc">${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 현황</div>
      </div>
      <div class="page-actions">
        ${notifications.length > 0 ? `<span class="badge badge-danger" style="font-size:12px; padding:4px 10px;">🔔 알림 ${notifications.length}건</span>` : ''}
      </div>
    </div>

    <!-- 핵심 KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="stat-card" style="cursor:pointer;" data-nav="inventory">
        <div class="stat-label">등록 품목</div>
        <div class="stat-value text-accent">${totalItems.toLocaleString('ko-KR')}</div>
        <div class="stat-change">총 ${totalQty.toLocaleString('ko-KR')}개</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" data-nav="dashboard">
        <div class="stat-label">총 재고 가치</div>
        <div class="stat-value">${totalValue > 0 ? '₩' + Math.round(totalValue).toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" data-nav="inout">
        <div class="stat-label">오늘 입고</div>
        <div class="stat-value text-success">+${todayIn.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" data-nav="inout">
        <div class="stat-label">오늘 출고</div>
        <div class="stat-value text-danger">-${todayOut.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" data-nav="inventory">
        <div class="stat-label">재고 부족</div>
        <div class="stat-value ${lowStockItems.length > 0 ? 'text-danger' : 'text-success'}">${lowStockItems.length > 0 ? lowStockItems.length + '건' : '없음'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">재고 회전율</div>
        <div class="stat-value" style="font-size:22px;">${turnoverRate}회/년</div>
        <div class="stat-change" style="font-size:10px;">최근 30일 기준</div>
      </div>
    </div>

    <!-- 차트 영역 -->
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
      <!-- 주간 입출고 라인 차트 -->
      <div class="card">
        <div class="card-title">📈 최근 7일 입출고 추이</div>
        <div style="height:240px; position:relative;">
          <canvas id="chart-weekly"></canvas>
        </div>
      </div>

      <!-- 월별 입출고 바 차트 -->
      <div class="card">
        <div class="card-title">📊 월별 입출고 현황</div>
        <div style="height:240px; position:relative;">
          <canvas id="chart-monthly"></canvas>
        </div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:16px;">
      <!-- 좌측: 최근 거래 + 재고 부족 경고 -->
      <div>
        <!-- 최근 거래 -->
        <div class="card">
          <div class="card-title">🕐 최근 거래 <span class="card-subtitle">최근 5건</span></div>
          ${recentTx.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:2px;">
              ${recentTx.map(tx => `
                <div style="display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid var(--border-light);">
                  <span style="font-size:18px;">${tx.type === 'in' ? '📥' : '📤'}</span>
                  <div style="flex:1;">
                    <div style="font-weight:500; font-size:13px;">${tx.itemName}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${tx.date}${tx.vendor ? ' · ' + tx.vendor : ''}</div>
                  </div>
                  <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}" style="font-size:14px; font-weight:600;">
                    ${tx.type === 'in' ? '+' : '-'}${parseFloat(tx.quantity).toLocaleString('ko-KR')}
                  </span>
                </div>
              `).join('')}
            </div>
          ` : '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">아직 거래 기록이 없습니다</div>'}
        </div>

        <!-- 재고 부족 경고 -->
        ${lowStockItems.length > 0 ? `
        <div class="card" style="border-left:3px solid var(--danger);">
          <div class="card-title">⚠️ 재고 부족 품목 <span class="badge badge-danger">${lowStockItems.length}건</span></div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            ${lowStockItems.slice(0, 5).map(item => {
              const current = parseFloat(item.quantity) || 0;
              const min = safetyStock[item.itemName] || 0;
              const pct = min > 0 ? Math.round((current / min) * 100) : 0;
              return `
                <div style="display:flex; align-items:center; gap:10px; padding:6px 4px; border-bottom:1px solid var(--border-light);">
                  <span style="font-size:14px;">🔴</span>
                  <div style="flex:1;">
                    <div style="font-size:13px; font-weight:500;">${item.itemName}</div>
                    <div style="font-size:11px; color:var(--text-muted);">현재 ${current}개 / 최소 ${min}개</div>
                  </div>
                  <div style="width:60px; height:6px; background:var(--border-light); border-radius:3px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:var(--danger); border-radius:3px;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          ${lowStockItems.length > 5 ? `<div style="text-align:center; margin-top:8px; font-size:12px; color:var(--text-muted);">외 ${lowStockItems.length - 5}건 더...</div>` : ''}
        </div>
        ` : ''}

        <!-- TOP 5 금액 품목 -->
        ${topItems.length > 0 ? `
        <div class="card">
          <div class="card-title">💎 금액 상위 품목</div>
          ${topItems.map((item, i) => {
            const val = parseFloat(item.totalPrice) || (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
            const maxVal = parseFloat(topItems[0].totalPrice) || (parseFloat(topItems[0].quantity) || 0) * (parseFloat(topItems[0].unitPrice) || 0) || 1;
            const pct = Math.round((val / maxVal) * 100);
            return `
              <div style="margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                  <span style="font-weight:500;"><span style="color:var(--text-muted); margin-right:4px;">${i + 1}</span> ${item.itemName}</span>
                  <span style="color:var(--accent); font-weight:600;">${val > 0 ? '₩' + Math.round(val).toLocaleString('ko-KR') : '-'}</span>
                </div>
                <div style="height:6px; background:var(--border-light); border-radius:3px; overflow:hidden;">
                  <div style="height:100%; width:${pct}%; background:var(--accent); border-radius:3px; transition:width 0.5s;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ` : ''}
      </div>

      <!-- 우측: 카테고리 도넛 + 빠른 실행 + 거래처 -->
      <div>
        <!-- 분류별 도넛 차트 -->
        <div class="card">
          <div class="card-title">📦 분류별 재고 비율</div>
          ${categories.length > 0 ? `
            <div style="height:220px; position:relative;">
              <canvas id="chart-category"></canvas>
            </div>
          ` : '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">분류 데이터가 없습니다</div>'}
        </div>

        <!-- 빠른 실행 -->
        <div class="card">
          <div class="card-title">⚡ 빠른 실행</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <button class="btn btn-primary btn-lg" style="width:100%;" data-nav="inout">🔄 입출고 등록</button>
            <button class="btn btn-outline" style="width:100%;" data-nav="documents">📄 문서 생성</button>
            <button class="btn btn-outline" style="width:100%;" data-nav="ledger">📒 수불부</button>
            <button class="btn btn-outline" style="width:100%;" data-nav="vendors">🤝 거래처 관리</button>
          </div>
        </div>

        <!-- 거래처 요약 -->
        <div class="card">
          <div class="card-title">🤝 거래처 현황</div>
          <div style="display:flex; justify-content:center; gap:24px; padding:8px;">
            <div style="text-align:center;">
              <div style="font-size:24px; font-weight:700; color:var(--accent);">${vendorCount}</div>
              <div style="font-size:11px; color:var(--text-muted);">전체</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:24px; font-weight:700; color:var(--success);">${(state.vendorMaster || []).filter(v => v.type === 'supplier').length}</div>
              <div style="font-size:11px; color:var(--text-muted);">매입처</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:24px; font-weight:700; color:var(--info, #58a6ff);">${(state.vendorMaster || []).filter(v => v.type === 'customer').length}</div>
              <div style="font-size:11px; color:var(--text-muted);">매출처</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // KPI 카드 & 버튼 클릭 → 페이지 이동
  container.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.nav));
  });

  // === 차트 렌더링 (DOM이 그려진 후) ===
  // setTimeout: innerHTML로 DOM을 넣은 직후 canvas가 확보될 때까지 대기
  setTimeout(() => {
    renderWeeklyTrendChart('chart-weekly', weekData);
    renderMonthlyChart('chart-monthly', monthData);
    if (categories.length > 0) {
      renderCategoryChart('chart-category', categories);
    }
  }, 50);
}

/**
 * 최근 7일 입출고 데이터 계산
 */
function getLast7Days(transactions) {
  const result = [];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = `${d.getMonth() + 1}/${d.getDate()} (${dayNames[d.getDay()]})`;
    const dayTx = transactions.filter(tx => tx.date === dateStr);
    result.push({
      date: dateStr,
      label,
      inQty: dayTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0),
      outQty: dayTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0),
    });
  }
  return result;
}

/**
 * 최근 6개월 입출고 데이터 계산
 * 왜 6개월? → 월별 추이를 보려면 최소 6개월은 있어야 패턴을 파악할 수 있음
 */
function getLast6Months(transactions) {
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = `${month + 1}월`;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    const monthTx = transactions.filter(tx => (tx.date || '').startsWith(prefix));
    result.push({
      label,
      inQty: monthTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0),
      outQty: monthTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0),
    });
  }
  return result;
}
