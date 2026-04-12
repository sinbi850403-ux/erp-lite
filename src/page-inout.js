/**
 * page-inout.js - ?낆텧怨?愿由??섏씠吏
 * ??븷: ?낃퀬/異쒓퀬 湲곕줉 ?깅줉, ?대젰 議고쉶, ?ш퀬 ?먮룞 諛섏쁺
 * ?듭떖: ?낆텧怨좊? 湲곕줉?섎㈃ ?ш퀬 ?꾪솴???섎웾???먮룞?쇰줈 利앷컧??
 */

import { getState, setState, addTransaction, deleteTransaction } from './store.js';
import { showToast, showActionToast } from './toast.js';
import { downloadExcel, readExcelFile } from './excel.js';
import { escapeHtml, renderGuidedPanel, renderInsightHero, renderQuickFilterRow } from './ux-toolkit.js';

const PAGE_SIZE = 15;
const LAST_VENDOR_IN_KEY = 'invex_last_vendor_in_v1';
const LAST_VENDOR_OUT_KEY = 'invex_last_vendor_out_v1';

/**
 * ?낆텧怨?愿由??섏씠吏 ?뚮뜑留?
 */
export function renderInoutPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const beginnerMode = state.beginnerMode !== false;
  const sortOptions = [
    { value: 'date:desc', label: '최신 날짜 순' },
    { value: 'date:asc', label: '오래된 날짜 순' },
    { value: 'quantity:desc', label: '수량 많은 순' },
    { value: 'quantity:asc', label: '수량 적은 순' },
    { value: 'itemName:asc', label: '품목명 가나다순' },
    { value: 'vendor:asc', label: '거래처 가나다순' },
  ];
  const todayTxIn = countToday(transactions, 'in');
  const todayTxOut = countToday(transactions, 'out');
  const vendorMissingCount = transactions.filter(tx => !String(tx.vendor || '').trim()).length;
  const quickTxFilters = [
    { value: 'all', label: '전체 보기' },
    { value: 'today', label: '오늘 기록' },
    { value: 'in', label: '입고만' },
    { value: 'out', label: '출고만' },
    { value: 'missingVendor', label: '거래처 미입력' },
    { value: 'recent3', label: '최근 3일' },
  ];
  const inoutHighlights = [
    {
      label: '오늘 입고 건수',
      value: `${todayTxIn}건`,
      note: '오늘 입력된 입고 기록 수입니다.',
      stateClass: todayTxIn > 0 ? 'text-success' : '',
    },
    {
      label: '오늘 출고 건수',
      value: `${todayTxOut}건`,
      note: '오늘 입력된 출고 기록 수입니다.',
      stateClass: todayTxOut > 0 ? 'text-danger' : '',
    },
    {
      label: '거래처 미입력',
      value: vendorMissingCount > 0 ? `${vendorMissingCount}건` : '완료',
      note: '거래처가 있으면 문서와 보고서가 더 정확해집니다.',
      stateClass: vendorMissingCount > 0 ? 'text-warning' : 'text-success',
    },
    {
      label: '등록 품목 수',
      value: `${items.length}개`,
      note: '입출고로 연결할 수 있는 전체 품목 수입니다.',
    },
  ];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📥</span> 입출고 관리</h1>
        <div class="page-desc">입고와 출고를 기록하면 재고 수량이 자동으로 반영됩니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export-tx">이력 내보내기</button>
        <button class="btn btn-outline" id="btn-bulk-upload">엑셀 일괄 등록</button>
        <button class="btn btn-success" id="btn-in">입고 등록</button>
        <button class="btn btn-danger" id="btn-out">출고 등록</button>
      </div>
    </div>

    <!-- ?ㅻ뒛 ?듦퀎 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">전체 기록</div>
        <div class="stat-value text-accent">${transactions.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">오늘 입고</div>
        <div class="stat-value text-success">${countToday(transactions, 'in')}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">오늘 출고</div>
        <div class="stat-value text-danger">${countToday(transactions, 'out')}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">등록 품목 수</div>
        <div class="stat-value">${items.length}</div>
      </div>
    </div>

    ${renderInsightHero({
      eyebrow: '입출고 운영 보드',
      title: '업무를 바로 처리할 수 있도록 흐름과 확인 포인트를 먼저 정리했습니다.',
      desc: '오늘 기록, 거래처 연결 상태, 등록 품목 수를 먼저 보여주고 바로 입고·출고 등록으로 이어지게 구성했습니다.',
      tone: vendorMissingCount > 0 ? 'warning' : 'success',
      metrics: inoutHighlights,
      bullets: [
        todayTxIn + todayTxOut > 0 ? `오늘 총 ${todayTxIn + todayTxOut}건이 입력되었습니다. 방금 등록한 기록까지 마지막으로 확인해 보세요.` : '오늘은 아직 입력된 기록이 없습니다. 첫 입고 또는 출고를 등록해 흐름을 시작해 보세요.',
        vendorMissingCount > 0 ? `거래처가 비어 있는 기록 ${vendorMissingCount}건은 문서 생성 전에 보완하는 것이 좋습니다.` : '거래처 정보가 깔끔하게 연결되어 있습니다.',
        items.length === 0 ? '먼저 품목을 등록해야 입출고를 정확하게 기록할 수 있습니다.' : '품목 등록이 되어 있으므로 바로 입고와 출고를 기록할 수 있습니다.',
      ],
      actions: [
        { id: 'btn-open-inbound-inline', label: '입고 바로 등록', variant: 'btn-success' },
        { id: 'btn-open-outbound-inline', label: '출고 바로 등록', variant: 'btn-outline' },
        { nav: 'summary', label: '요약 보고 보기', variant: 'btn-ghost' },
      ],
    })}

    ${beginnerMode && (items.length === 0 || transactions.length === 0) ? `
      <div class="card quick-start-card">
        <div class="quick-start-head">
          <div>
            <div class="quick-start-title">입출고 빠른 시작</div>
            <div class="quick-start-desc">처음이라면 아래 순서대로 진행해 주세요.</div>
          </div>
          <span class="badge badge-warning">가이드</span>
        </div>
        <div class="quick-start-steps">
          <div class="quick-start-step ${items.length > 0 ? 'is-done' : ''}">
            1) 재고 품목 등록 (${items.length > 0 ? '완료' : '필요'})
          </div>
          <div class="quick-start-step ${transactions.length > 0 ? 'is-done' : ''}">
            2) 첫 입고/출고 기록 (${transactions.length > 0 ? '완료' : '필요'})
          </div>
          <div class="quick-start-step">3) 요약 보고에서 흐름 확인</div>
        </div>
        <div class="quick-start-actions">
          ${items.length === 0 ? '<button class="btn btn-primary btn-sm" id="btn-quick-item">품목 먼저 등록</button>' : ''}
          ${items.length > 0 ? '<button class="btn btn-primary btn-sm" id="btn-quick-first-tx">첫 입출고 등록</button>' : ''}
          <button class="btn btn-outline btn-sm" id="btn-quick-guide">사용 가이드</button>
          <button class="btn btn-ghost btn-sm" id="btn-quick-summary">요약 보고 이동</button>
        </div>
      </div>
    ` : ''}

    ${renderQuickFilterRow({
      label: '빠른 조건',
      attr: 'data-tx-quick',
      chips: quickTxFilters.map(chip => ({ ...chip, active: chip.value === 'all' })),
    })}

    <!-- ?꾪꽣 -->
    <div class="toolbar">
      <input type="text" class="search-input" id="tx-search" placeholder="품목명 또는 코드로 검색..." />
      <select class="filter-select" id="tx-type-filter">
        <option value="">전체</option>
        <option value="in">입고만</option>
        <option value="out">출고만</option>
      </select>
      <select class="filter-select" id="tx-vendor-filter">
        <option value="">전체 거래처</option>
        ${getVendorOptions(transactions, items).map(v => `<option value="${v}">${v}</option>`).join('')}
      </select>
      <select class="filter-select" id="tx-code-filter">
        <option value="">전체 품목코드</option>
        ${getCodeList(items).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <input type="date" class="filter-select" id="tx-date-filter" style="padding:7px 10px;" />
      <select class="filter-select" id="tx-sort-filter">
        ${sortOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" id="tx-filter-reset" title="필터 초기화">초기화</button>
    </div>
    <div class="filter-summary" id="tx-filter-summary"></div>

    <!-- ?대젰 ?뚯씠釉?-->
    <div class="card card-flush">
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead id="tx-head"></thead>
          <tbody id="tx-body"></tbody>
        </table>
      </div>
      <div class="pagination" id="tx-pagination"></div>
    </div>

    ${items.length === 0 ? `
      <div class="alert alert-warning" style="margin-top:12px;">
        등록된 품목이 없습니다. 먼저 재고 현황에서 품목을 등록하거나 파일을 업로드해 주세요.
      </div>
    ` : ''}
  `;

  let currentPageNum = 1;
  const defaultFilter = { keyword: '', type: '', date: '', vendor: '', itemCode: '', quick: 'all' };
  const defaultSort = { key: 'date', direction: 'desc' };
  const savedViewPrefs = state.inoutViewPrefs || {};
  let filter = sanitizeInoutFilter(savedViewPrefs.filter);
  let sort = sanitizeInoutSort(savedViewPrefs.sort);
  let persistTimer = null;

  function sanitizeInoutFilter(raw) {
    const candidate = raw || {};
    return {
      keyword: typeof candidate.keyword === 'string' ? candidate.keyword : '',
      type: candidate.type === 'in' || candidate.type === 'out' ? candidate.type : '',
      date: typeof candidate.date === 'string' ? candidate.date : '',
      vendor: typeof candidate.vendor === 'string' ? candidate.vendor : '',
      itemCode: typeof candidate.itemCode === 'string' ? candidate.itemCode : '',
      quick: ['all', 'today', 'in', 'out', 'missingVendor', 'recent3'].includes(candidate.quick) ? candidate.quick : 'all',
    };
  }

  function sanitizeInoutSort(raw) {
    const candidate = raw || {};
    const allowedKeys = new Set(['date', 'quantity', 'itemName', 'vendor', 'type', 'unitPrice']);
    const direction = candidate.direction === 'asc' || candidate.direction === 'desc' ? candidate.direction : '';
    if (!candidate.key || !direction || !allowedKeys.has(candidate.key)) {
      return { ...defaultSort };
    }
    return { key: candidate.key, direction };
  }

  function persistInoutPrefs({ debounced = false } = {}) {
    const payload = {
      filter: { ...filter },
      sort: { ...sort },
    };
    if (debounced) {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        setState({ inoutViewPrefs: payload });
      }, 250);
      return;
    }
    clearTimeout(persistTimer);
    setState({ inoutViewPrefs: payload });
  }

  function parseSortPreset(value) {
    const [key, direction] = String(value || '').split(':');
    if (!key || !direction) return { ...defaultSort };
    return { key, direction };
  }

  function getSortPresetValue(currentSort) {
    const value = `${currentSort.key}:${currentSort.direction}`;
    const hasPreset = sortOptions.some(option => option.value === value);
    return hasPreset ? value : 'date:desc';
  }

  function getSortIndicator(key) {
    if (sort.key !== key) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  }

  function getSortOptionLabel(currentSort) {
    const value = `${currentSort.key}:${currentSort.direction}`;
    const matched = sortOptions.find(option => option.value === value);
    if (matched) return matched.label;
    return '정렬 없음';
  }

  function getComparableTxValue(tx, key) {
    const raw = tx[key];
    if (key === 'date') {
      const source = tx.date || tx.createdAt;
      if (!source) return 0;
      const ts = new Date(source).getTime();
      return Number.isNaN(ts) ? 0 : ts;
    }
    if (key === 'quantity' || key === 'unitPrice') {
      const num = parseFloat(raw);
      return Number.isNaN(num) ? 0 : num;
    }
    if (!raw) return '';
    return String(raw).toLowerCase();
  }

  function sortTxRows(rows) {
    const multiplier = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getComparableTxValue(a, sort.key);
      const bv = getComparableTxValue(b, sort.key);

      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * multiplier;
      }
      return String(av).localeCompare(String(bv), 'ko-KR', { numeric: true, sensitivity: 'base' }) * multiplier;
    });
  }

  function renderTxHeader() {
    const thead = container.querySelector('#tx-head');
    thead.innerHTML = `
      <tr>
        <th class="col-num">#</th>
        <th class="sortable-header ${sort.key === 'type' ? 'is-active' : ''}" data-sort-key="type" title="클릭하여 정렬" aria-sort="${sort.key === 'type' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">구분</span><span class="sort-indicator">${getSortIndicator('type')}</span>
          </button>
        </th>
        <th class="sortable-header ${sort.key === 'vendor' ? 'is-active' : ''}" data-sort-key="vendor" title="클릭하여 정렬" aria-sort="${sort.key === 'vendor' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">거래처</span><span class="sort-indicator">${getSortIndicator('vendor')}</span>
          </button>
        </th>
        <th class="sortable-header ${sort.key === 'itemName' ? 'is-active' : ''}" data-sort-key="itemName" title="클릭하여 정렬" aria-sort="${sort.key === 'itemName' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">품목명</span><span class="sort-indicator">${getSortIndicator('itemName')}</span>
          </button>
        </th>
        <th>품목코드</th>
        <th class="sortable-header text-right ${sort.key === 'quantity' ? 'is-active' : ''}" data-sort-key="quantity" title="클릭하여 정렬" aria-sort="${sort.key === 'quantity' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">수량</span><span class="sort-indicator">${getSortIndicator('quantity')}</span>
          </button>
        </th>
        <th class="sortable-header text-right ${sort.key === 'unitPrice' ? 'is-active' : ''}" data-sort-key="unitPrice" title="클릭하여 정렬" aria-sort="${sort.key === 'unitPrice' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">단가</span><span class="sort-indicator">${getSortIndicator('unitPrice')}</span>
          </button>
        </th>
        <th class="sortable-header ${sort.key === 'date' ? 'is-active' : ''}" data-sort-key="date" title="클릭하여 정렬" aria-sort="${sort.key === 'date' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">날짜</span><span class="sort-indicator">${getSortIndicator('date')}</span>
          </button>
        </th>
        <th>비고</th>
        <th style="width:50px;">삭제</th>
      </tr>
    `;

    container.querySelectorAll('.sortable-header[data-sort-key]').forEach(header => {
      header.setAttribute('tabindex', '0');
      header.setAttribute('role', 'button');
      header.addEventListener('click', () => {
        const key = header.dataset.sortKey;
        if (!key) return;
        if (sort.key !== key) {
          sort = { key, direction: 'asc' };
        } else if (sort.direction === 'asc') {
          sort = { key, direction: 'desc' };
        } else {
          sort = { ...defaultSort };
        }
        container.querySelector('#tx-sort-filter').value = getSortPresetValue(sort);
        persistInoutPrefs();
        currentPageNum = 1;
        renderTxHeader();
        renderTxTable();
      });

      header.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        header.click();
      });
    });
  }

  function getFilteredTx() {
    const todayKey = new Date().toISOString().split('T')[0];
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 2);
    const recentCutoff = threeDaysAgo.toISOString().split('T')[0];
    return transactions.filter(tx => {
      const kw = filter.keyword.toLowerCase();
      if (kw && !(
        (tx.itemName || '').toLowerCase().includes(kw) ||
        (tx.itemCode || '').toLowerCase().includes(kw)
      )) return false;
      if (filter.type && tx.type !== filter.type) return false;
      if (filter.date && tx.date !== filter.date) return false;
      // 嫄곕옒泥??꾪꽣: ?몃옖??뀡??吏곸젒 湲곕줉??嫄곕옒泥섎줈 ?꾪꽣留?
      // ??吏곸젒 ?꾪꽣? ??湲곗〈?먮뒗 ?덈ぉ 湲곗? 媛꾩젒 鍮꾧탳?吏留?
      //   媛숈? ?덈ぉ???щ윭 嫄곕옒泥섏뿉???낃퀬?????덉쑝誘濡??몃옖??뀡 湲곗????뺥솗
      if (filter.vendor && tx.vendor !== filter.vendor) return false;
      // ?덈ぉ肄붾뱶 ?꾪꽣
      if (filter.itemCode && tx.itemCode !== filter.itemCode) return false;
      if (filter.quick === 'today' && tx.date !== todayKey) return false;
      if (filter.quick === 'in' && tx.type !== 'in') return false;
      if (filter.quick === 'out' && tx.type !== 'out') return false;
      if (filter.quick === 'missingVendor' && String(tx.vendor || '').trim()) return false;
      if (filter.quick === 'recent3' && String(tx.date || '') < recentCutoff) return false;
      return true;
    });
  }

  function renderFilterSummary(filteredCount) {
    const summaryEl = container.querySelector('#tx-filter-summary');
    if (!summaryEl) return;

    const chips = [];
    if (filter.keyword) chips.push(`검색: ${filter.keyword}`);
    if (filter.type) chips.push(`구분: ${filter.type === 'in' ? '입고' : '출고'}`);
    if (filter.vendor) chips.push(`거래처: ${filter.vendor}`);
    if (filter.itemCode) chips.push(`품목코드: ${filter.itemCode}`);
    if (filter.date) chips.push(`날짜: ${filter.date}`);
    chips.push(`정렬: ${getSortOptionLabel(sort)}`);

    summaryEl.innerHTML = `
      <div class="filter-summary-row">
        <div class="filter-summary-count">표시 ${filteredCount}건 / 전체 ${transactions.length}건</div>
        <div class="filter-summary-chips">
          ${chips.map(text => `<span class="filter-chip">${text}</span>`).join('')}
        </div>
      </div>
    `;
  }

  function highlightActiveFilters() {
    const selectIds = ['tx-type-filter', 'tx-vendor-filter', 'tx-code-filter', 'tx-date-filter', 'tx-sort-filter'];
    selectIds.forEach(id => {
      const el = container.querySelector(`#${id}`);
      if (!el) return;
      const active = id === 'tx-sort-filter' ? (el.value && el.value !== 'date:desc') : !!el.value;
      el.classList.toggle('filter-active', active);
    });
    const searchEl = container.querySelector('#tx-search');
    if (searchEl) searchEl.classList.toggle('filter-active', !!filter.keyword);
  }

  function renderTxTable() {
    const filtered = getFilteredTx();
    const sorted = sortTxRows(filtered);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (currentPageNum > totalPages) currentPageNum = totalPages;
    const start = (currentPageNum - 1) * PAGE_SIZE;
    const pageData = sorted.slice(start, start + PAGE_SIZE);

    const tbody = container.querySelector('#tx-body');
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:32px; color:var(--text-muted);">
        ${transactions.length === 0 ? '아직 입출고 기록이 없습니다. 위 버튼으로 먼저 등록해 주세요.' : '검색 결과가 없습니다.'}
      </td></tr>`;
    } else {
      tbody.innerHTML = pageData.map((tx, i) => `
        <tr>
          <td class="col-num">${start + i + 1}</td>
          <td>
            <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">
              ${tx.type === 'in' ? '입고' : '출고'}
            </span>
          </td>
          <td style="font-size:12px;">${tx.vendor || '<span style="color:var(--text-muted)">-</span>'}</td>
          <td><strong>${tx.itemName || '-'}</strong></td>
          <td style="color:var(--text-muted);">${tx.itemCode || '-'}</td>
          <td class="text-right">
            <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">
              ${tx.type === 'in' ? '+' : '-'}${parseFloat(tx.quantity || 0).toLocaleString('ko-KR')}
            </span>
          </td>
          <td class="text-right">${tx.unitPrice ? '₩' + Math.round(parseFloat(tx.unitPrice)).toLocaleString('ko-KR') : '-'}</td>
          <td>${tx.date || '-'}</td>
          <td style="color:var(--text-muted); font-size:13px;">${tx.note || ''}</td>
          <td class="text-center">
            <button class="btn-icon btn-icon-danger btn-del-tx" data-id="${tx.id}" title="삭제">삭제</button>
          </td>
        </tr>
      `).join('');
    }

    renderFilterSummary(sorted.length);

    // ?섏씠吏?ㅼ씠??
    const pagEl = container.querySelector('#tx-pagination');
    const pageStart = sorted.length === 0 ? 0 : start + 1;
    pagEl.innerHTML = `
      <span>${sorted.length}건 중 ${pageStart}~${Math.min(start + PAGE_SIZE, sorted.length)}</span>
      <div class="pagination-btns">
        <button class="page-btn" id="tx-prev" ${currentPageNum <= 1 ? 'disabled' : ''}>이전</button>
        <span style="padding:4px 8px; color:var(--text-muted); font-size:13px;">${currentPageNum} / ${totalPages}</span>
        <button class="page-btn" id="tx-next" ${currentPageNum >= totalPages ? 'disabled' : ''}>다음</button>
      </div>
    `;

    // ??젣 ?대깽??
    container.querySelectorAll('.btn-del-tx').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('이 기록을 삭제하시겠습니까?\n재고 수량은 자동으로 되돌아가지 않습니다.')) {
          deleteTransaction(btn.dataset.id);
          showToast('기록을 삭제했습니다.', 'info');
          renderInoutPage(container, navigateTo);
        }
      });
    });

    // ?섏씠吏?ㅼ씠???대깽??
    pagEl.querySelector('#tx-prev')?.addEventListener('click', () => { currentPageNum--; renderTxTable(); });
    pagEl.querySelector('#tx-next')?.addEventListener('click', () => { currentPageNum++; renderTxTable(); });
  }

  container.querySelector('#btn-quick-item')?.addEventListener('click', () => navigateTo('inventory'));
  container.querySelector('#btn-quick-first-tx')?.addEventListener('click', () => openTxModal(container, navigateTo, 'in', items));
  container.querySelector('#btn-quick-guide')?.addEventListener('click', () => navigateTo('guide'));
  container.querySelector('#btn-quick-summary')?.addEventListener('click', () => navigateTo('summary'));
  container.querySelector('#btn-open-inbound-inline')?.addEventListener('click', () => openTxModal(container, navigateTo, 'in', items));
  container.querySelector('#btn-open-outbound-inline')?.addEventListener('click', () => openTxModal(container, navigateTo, 'out', items));
  container.querySelectorAll('[data-nav]').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.nav));
  });

  function syncQuickFilterChips() {
    container.querySelectorAll('[data-tx-quick]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.txQuick === filter.quick);
    });
  }

  container.querySelectorAll('[data-tx-quick]').forEach(button => {
    button.addEventListener('click', () => {
      filter.quick = button.dataset.txQuick || 'all';
      if (filter.quick === 'in' || filter.quick === 'out') {
        filter.type = filter.quick;
        container.querySelector('#tx-type-filter').value = filter.type;
      } else if (filter.type && (filter.quick === 'all' || filter.quick === 'today' || filter.quick === 'missingVendor' || filter.quick === 'recent3')) {
        filter.type = '';
        container.querySelector('#tx-type-filter').value = '';
      }
      if (filter.quick === 'today') {
        filter.date = new Date().toISOString().split('T')[0];
        container.querySelector('#tx-date-filter').value = filter.date;
      } else if (filter.quick !== 'recent3' && filter.quick !== 'missingVendor' && filter.quick !== 'all') {
        filter.date = '';
        container.querySelector('#tx-date-filter').value = '';
      } else if (filter.quick === 'all') {
        filter.date = '';
        container.querySelector('#tx-date-filter').value = '';
      }
      currentPageNum = 1;
      renderTxTable();
      highlightActiveFilters();
      syncQuickFilterChips();
      persistInoutPrefs();
    });
  });

  // 필터/정렬 이벤트
  container.querySelector('#tx-search').addEventListener('input', (e) => {
    filter.keyword = e.target.value;
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs({ debounced: true });
  });
  container.querySelector('#tx-type-filter').addEventListener('change', (e) => {
    filter.type = e.target.value;
    filter.quick = e.target.value || 'all';
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    syncQuickFilterChips();
    persistInoutPrefs();
  });
  container.querySelector('#tx-vendor-filter').addEventListener('change', (e) => {
    filter.vendor = e.target.value;
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs();
  });
  container.querySelector('#tx-code-filter').addEventListener('change', (e) => {
    filter.itemCode = e.target.value;
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs();
  });
  container.querySelector('#tx-date-filter').addEventListener('change', (e) => {
    filter.date = e.target.value;
    filter.quick = e.target.value ? 'today' : 'all';
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    syncQuickFilterChips();
    persistInoutPrefs();
  });
  container.querySelector('#tx-sort-filter').addEventListener('change', (e) => {
    sort = sanitizeInoutSort(parseSortPreset(e.target.value));
    currentPageNum = 1;
    renderTxHeader();
    renderTxTable();
    highlightActiveFilters();
    syncQuickFilterChips();
    persistInoutPrefs();
  });

  // ?꾪꽣/?뺣젹 珥덇린??
  container.querySelector('#tx-filter-reset').addEventListener('click', () => {
    filter = { ...defaultFilter };
    sort = { ...defaultSort };
    container.querySelector('#tx-search').value = '';
    container.querySelector('#tx-type-filter').value = '';
    container.querySelector('#tx-vendor-filter').value = '';
    container.querySelector('#tx-code-filter').value = '';
    container.querySelector('#tx-date-filter').value = '';
    container.querySelector('#tx-sort-filter').value = getSortPresetValue(sort);
    currentPageNum = 1;
    renderTxHeader();
    renderTxTable();
    highlightActiveFilters();
    syncQuickFilterChips();
    persistInoutPrefs();
    showToast('필터와 정렬을 초기화했습니다.', 'info');
  });

  // ?낃퀬/異쒓퀬 ?깅줉 踰꾪듉
  container.querySelector('#btn-in').addEventListener('click', () => {
    openTxModal(container, navigateTo, 'in', items);
  });
  container.querySelector('#btn-out').addEventListener('click', () => {
    openTxModal(container, navigateTo, 'out', items);
  });

  // ?대젰 ?대낫?닿린
  container.querySelector('#btn-export-tx').addEventListener('click', () => {
    if (transactions.length === 0) {
      showToast('내보낼 기록이 없습니다.', 'warning');
      return;
    }
    const exportData = transactions.map(tx => ({
      '구분': tx.type === 'in' ? '입고' : '출고',
      '거래처': tx.vendor || '',
      '품목명': tx.itemName,
      '품목코드': tx.itemCode || '',
      '수량': tx.quantity,
      '단가': tx.unitPrice || '',
      '날짜': tx.date,
      '비고': tx.note || '',
      '등록시간': tx.createdAt,
    }));
    downloadExcel(exportData, '입출고이력');
    showToast('이력을 엑셀로 내보냈습니다.', 'success');
  });

  // ?묒? ?쇨큵 ?깅줉
  container.querySelector('#btn-bulk-upload').addEventListener('click', () => {
    openBulkUploadModal(container, navigateTo, items);
  });

  // 珥덇린 ?뚮뜑留?
  container.querySelector('#tx-search').value = filter.keyword;
  container.querySelector('#tx-type-filter').value = filter.type;
  container.querySelector('#tx-vendor-filter').value = filter.vendor;
  container.querySelector('#tx-code-filter').value = filter.itemCode;
  container.querySelector('#tx-date-filter').value = filter.date;
  container.querySelector('#tx-sort-filter').value = getSortPresetValue(sort);
  renderTxHeader();
  renderTxTable();
  highlightActiveFilters();
  syncQuickFilterChips();
}

/**
 * ?묒? ?쇨큵 ?낆텧怨??낅줈??紐⑤떖
 * ???꾩슂? ??嫄대퀎 ?깅줉? ?섏떗 嫄??댁긽????鍮꾪슚?⑥쟻.
 *   ?묒?濡??쒕쾲???щ━硫??쒓컙???ш쾶 ?덉빟?????덉쓬.
 */
function openBulkUploadModal(container, navigateTo, items) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-header">
        <h3 class="modal-title">엑셀 일괄 입출고 등록</h3>
        <button class="modal-close" id="bulk-close">✕</button>
      </div>
      <div class="modal-body" id="bulk-body">
        <div class="alert alert-info" style="margin-bottom:16px;">
          <strong>사용 방법</strong><br/>
          1. 아래에서 샘플 양식을 내려받습니다.<br/>
          2. 양식에 입고 또는 출고 데이터를 입력합니다.<br/>
          3. 저장한 엑셀 파일을 끌어놓거나 선택하면 미리보기 후 한 번에 등록할 수 있습니다.
        </div>

        <div style="display:flex; gap:8px; margin-bottom:16px;">
          <button class="btn btn-outline" id="bulk-download-template">엑셀 양식 다운로드</button>
        </div>

        <div style="border:2px dashed var(--border); border-radius:8px; padding:32px; text-align:center; cursor:pointer; transition:border-color 0.2s;" id="bulk-dropzone">
          <div style="font-size:28px; margin-bottom:8px;">📥</div>
          <div style="font-size:13px; color:var(--text-muted);">엑셀 파일을 여기로 끌어오거나 클릭해서 선택해 주세요.</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">지원 형식: .xlsx, .xls</div>
          <input type="file" id="bulk-file-input" accept=".xlsx,.xls" style="display:none;" />
        </div>

        <div id="bulk-preview" style="display:none; margin-top:16px;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#bulk-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#bulk-download-template').addEventListener('click', () => {
    const template = [
      {
        구분: '입고',
        거래처: '(주)삼성전자',
        품목명: '갤럭시 S25',
        품목코드: 'SM-S925',
        수량: 100,
        단가: 1200000,
        날짜: new Date().toISOString().split('T')[0],
        비고: '1차 입고',
      },
      {
        구분: '출고',
        거래처: '쿠팡',
        품목명: '갤럭시 S25',
        품목코드: 'SM-S925',
        수량: 30,
        단가: 1200000,
        날짜: new Date().toISOString().split('T')[0],
        비고: '쿠팡 출고',
      },
    ];

    downloadExcel(template, '입출고_일괄등록_양식');
    showToast('입출고 일괄등록 양식을 내려받았습니다. 내용을 입력한 뒤 다시 업로드해 주세요.', 'success');
  });

  const dropzone = overlay.querySelector('#bulk-dropzone');
  const fileInput = overlay.querySelector('#bulk-file-input');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border)';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border)';
    const file = e.dataTransfer.files[0];
    if (file) processUploadedFile(file, overlay, container, navigateTo, items, close);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processUploadedFile(file, overlay, container, navigateTo, items, close);
  });
}

/**
 * ?낅줈?쒕맂 ?묒? ?뚯씪???뚯떛?섏뿬 誘몃━蹂닿린 + ?쇨큵 ?깅줉
 * ??誘몃━蹂닿린? ???섎せ???곗씠?곌? ?깅줉?섎뒗 寃껋쓣 諛⑹?
 */
async function processUploadedFile(file, overlay, container, navigateTo, items, closeModal) {
  const previewEl = overlay.querySelector('#bulk-preview');
  previewEl.style.display = 'block';
  previewEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">엑셀 파일을 분석하고 있습니다...</div>';

  try {
    const { sheets, sheetNames } = await readExcelFile(file);
    const sheetData = sheets[sheetNames[0]];

    if (!sheetData || sheetData.length < 2) {
      previewEl.innerHTML = '<div class="alert alert-warning">데이터 행이 없습니다. 양식의 첫 줄은 헤더, 둘째 줄부터 데이터가 있어야 합니다.</div>';
      return;
    }

    const headers = sheetData[0].map((header) => String(header ?? '').trim());
    const colMap = {
      type: headers.findIndex((header) => header === '구분'),
      vendor: headers.findIndex((header) => header === '거래처'),
      itemName: headers.findIndex((header) => header === '품목명'),
      itemCode: headers.findIndex((header) => header === '품목코드'),
      quantity: headers.findIndex((header) => header === '수량'),
      unitPrice: headers.findIndex((header) => header === '단가'),
      date: headers.findIndex((header) => header === '날짜'),
      note: headers.findIndex((header) => header === '비고'),
    };

    if (colMap.type === -1 || colMap.itemName === -1 || colMap.quantity === -1) {
      previewEl.innerHTML = '<div class="alert alert-danger">필수 컬럼을 찾을 수 없습니다. 양식에 "구분", "품목명", "수량" 컬럼이 포함되어 있는지 확인해 주세요.</div>';
      return;
    }

    const rows = [];
    for (let index = 1; index < sheetData.length; index += 1) {
      const row = sheetData[index];
      if (!row || row.length === 0) continue;

      const typeCell = String(row[colMap.type] ?? '').trim();
      const itemName = String(row[colMap.itemName] ?? '').trim();
      const quantity = Number.parseFloat(row[colMap.quantity]) || 0;

      if (!itemName || quantity <= 0) continue;

      const rawItemCode = colMap.itemCode >= 0 ? String(row[colMap.itemCode] ?? '').trim() : '';
      const matchedItem = items.find((item) =>
        item.itemName === itemName || (rawItemCode && item.itemCode && item.itemCode === rawItemCode)
      );

      let dateStr = '';
      if (colMap.date >= 0) {
        const rawDate = row[colMap.date];
        if (typeof rawDate === 'number') {
          const excelDate = new Date((rawDate - 25569) * 86400 * 1000);
          dateStr = excelDate.toISOString().split('T')[0];
        } else {
          dateStr = String(rawDate ?? '').trim();
        }
      }

      rows.push({
        type: typeCell === '출고' ? 'out' : 'in',
        vendor: colMap.vendor >= 0 ? String(row[colMap.vendor] ?? '').trim() : '',
        itemName,
        itemCode: rawItemCode || matchedItem?.itemCode || '',
        quantity,
        unitPrice: colMap.unitPrice >= 0 ? (Number.parseFloat(row[colMap.unitPrice]) || 0) : 0,
        date: dateStr || new Date().toISOString().split('T')[0],
        note: colMap.note >= 0 ? String(row[colMap.note] ?? '').trim() : '',
        matched: Boolean(matchedItem),
      });
    }

    if (rows.length === 0) {
      previewEl.innerHTML = '<div class="alert alert-warning">유효한 데이터가 없습니다. 구분, 품목명, 수량 값을 다시 확인해 주세요.</div>';
      return;
    }

    const inCount = rows.filter((row) => row.type === 'in').length;
    const outCount = rows.filter((row) => row.type === 'out').length;
    const unmatchedCount = rows.filter((row) => !row.matched).length;

    previewEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <strong>분석 결과</strong>
        <span style="margin-left:8px; color:var(--success);">입고 ${inCount}건</span>
        <span style="margin-left:8px; color:var(--danger);">출고 ${outCount}건</span>
        ${unmatchedCount > 0 ? `<span style="margin-left:8px; color:var(--warning);">품목 미매칭 ${unmatchedCount}건</span>` : ''}
      </div>
      <div class="table-wrapper" style="max-height:250px; overflow-y:auto; margin-bottom:12px;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>구분</th>
              <th>거래처</th>
              <th>품목명</th>
              <th>수량</th>
              <th>단가</th>
              <th>날짜</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td><span class="${row.type === 'in' ? 'type-in' : 'type-out'}">${row.type === 'in' ? '입고' : '출고'}</span></td>
                <td>${escapeHtml(row.vendor || '-')}</td>
                <td>${escapeHtml(row.itemName)}</td>
                <td class="text-right">${row.quantity.toLocaleString('ko-KR')}</td>
                <td class="text-right">${row.unitPrice ? `₩${Math.round(row.unitPrice).toLocaleString('ko-KR')}` : '-'}</td>
                <td>${escapeHtml(row.date)}</td>
                <td>${row.matched
                  ? '<span style="color:var(--success); font-size:11px;">기존 품목 매칭</span>'
                  : '<span style="color:var(--warning); font-size:11px;">품목 미매칭</span>'
                }</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${unmatchedCount > 0 ? '<div class="alert alert-warning" style="margin-bottom:12px; font-size:12px;">품목 미매칭 행은 이력은 저장되지만 기존 재고 수량과는 연결되지 않을 수 있습니다. 가능하면 품목코드를 맞춘 뒤 다시 업로드해 주세요.</div>' : ''}
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-outline" id="bulk-cancel">취소</button>
        <button class="btn btn-primary" id="bulk-confirm">총 ${rows.length}건 등록</button>
      </div>
    `;

    previewEl.querySelector('#bulk-cancel').addEventListener('click', () => {
      previewEl.style.display = 'none';
    });

    previewEl.querySelector('#bulk-confirm').addEventListener('click', () => {
      rows.forEach((row) => {
        addTransaction({
          type: row.type,
          vendor: row.vendor,
          itemName: row.itemName,
          itemCode: row.itemCode,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          date: row.date,
          note: row.note,
        });
      });

      showToast(`일괄 등록 완료: 총 ${rows.length}건, 입고 ${inCount}건, 출고 ${outCount}건`, 'success');
      closeModal();
      renderInoutPage(container, navigateTo);
    });
  } catch (err) {
    previewEl.innerHTML = `<div class="alert alert-danger">파일 처리 중 오류가 발생했습니다: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * ?낃퀬/異쒓퀬 ?깅줉 紐⑤떖
 */
function openTxModal(container, navigateTo, type, items) {
  const today = new Date().toISOString().split('T')[0];
  const state = getState();
  const vendors = (state.vendorMaster || []).filter(v =>
    type === 'in' ? v.type === 'supplier' : v.type === 'customer'
  );
  const typeLabel = type === 'in' ? '입고' : '출고';
  const partnerLabel = type === 'in' ? '매입처' : '매출처';
  const lastVendorKey = type === 'in' ? LAST_VENDOR_IN_KEY : LAST_VENDOR_OUT_KEY;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="modal-header">
        <h3 class="modal-title">${type === 'in' ? '입고 등록' : '출고 등록'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-shell">
          <div class="form-shell-main">
            ${renderGuidedPanel({
              eyebrow: `${typeLabel} 입력 순서`,
              title: `${typeLabel} 기록은 품목, 수량, 날짜만 정확하면 바로 반영됩니다.`,
              desc: `${partnerLabel}와 단가는 있으면 더 좋지만, 지금 급하면 필수값부터 저장한 뒤 보강해도 됩니다.`,
              badge: type === 'in' ? '입고 흐름' : '출고 흐름',
              steps: [
                { kicker: 'STEP 1', title: '거래처 선택', desc: `${partnerLabel}가 있으면 문서와 보고서 연결이 쉬워집니다.` },
                { kicker: 'STEP 2', title: '품목과 수량 입력', desc: '선택한 품목의 현재 재고와 반영 후 수량을 오른쪽에서 바로 확인할 수 있습니다.' },
                { kicker: 'STEP 3', title: '날짜 확인 후 저장', desc: '오늘 기록인지, 과거 보정 입력인지 마지막으로 확인하세요.' },
              ],
            })}

            <div class="form-group">
              <label class="form-label">${partnerLabel}</label>
              <select class="form-select" id="tx-vendor">
                <option value="">-- 거래처 선택 (선택 사항) --</option>
                ${vendors.map(v => `<option value="${v.name}">${v.name}${v.contactName ? ` (${v.contactName})` : ''}</option>`).join('')}
              </select>
              ${vendors.length === 0 ? `<div class="smart-inline-note">거래처 관리에 ${type === 'in' ? '공급처' : '고객'}를 먼저 등록하면 ${typeLabel} 기록이 더 편해집니다.</div>` : ''}
            </div>

            <div class="form-group">
              <label class="form-label">품목 선택 <span class="required">*</span></label>
              ${items.length > 0 ? `
                <select class="form-select" id="tx-item">
                  <option value="">-- 품목 선택 --</option>
                  ${items.map((item, i) => `
                    <option value="${i}" data-code="${item.itemCode || ''}" data-price="${item.unitPrice || ''}" data-qty="${item.quantity || 0}">
                      ${item.itemName}${item.itemCode ? ` (${item.itemCode})` : ''}${type === 'out' ? ` [현재 ${parseFloat(item.quantity || 0)}]` : ''}
                    </option>
                  `).join('')}
                </select>
              ` : `
                <input class="form-input" id="tx-item-name" placeholder="품목명을 직접 입력해 주세요" />
              `}
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">수량 <span class="required">*</span></label>
                <input class="form-input" type="number" id="tx-qty" placeholder="0" min="1" />
              </div>
              <div class="form-group">
                <label class="form-label">단가</label>
                <input class="form-input" type="number" id="tx-price" placeholder="선택 사항" />
              </div>
            </div>

            <details class="smart-details" open>
              <summary>날짜와 메모 더 보기</summary>
              <div class="smart-details-body">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">날짜 <span class="required">*</span></label>
                    <input class="form-input" type="date" id="tx-date" value="${today}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">메모</label>
                    <input class="form-input" id="tx-note" placeholder="메모 (선택 사항)" />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div class="form-shell-side">
            <div class="form-card">
              <div class="form-card-title">입력 체크</div>
              <div class="form-card-desc">품목, 수량, 날짜가 있으면 저장할 수 있습니다. 출고는 현재 재고를 넘지 않는지만 확인해 주세요.</div>
              <div class="form-status-list" id="tx-status-list"></div>
            </div>
            <div class="smart-summary-grid">
              <div class="smart-summary-item">
                <div class="smart-summary-label">선택 품목</div>
                <div class="smart-summary-value" id="tx-summary-item">미선택</div>
                <div class="smart-summary-note" id="tx-summary-code">품목을 선택하면 코드와 현재 재고가 표시됩니다.</div>
              </div>
              <div class="smart-summary-item">
                <div class="smart-summary-label">반영 후 재고</div>
                <div class="smart-summary-value" id="tx-summary-stock">-</div>
                <div class="smart-summary-note" id="tx-summary-stock-note">수량 입력 전입니다.</div>
              </div>
              <div class="smart-summary-item">
                <div class="smart-summary-label">예상 반영 금액</div>
                <div class="smart-summary-value" id="tx-summary-amount">₩0</div>
                <div class="smart-summary-note" id="tx-summary-amount-note">수량과 단가를 넣으면 금액을 즉시 계산합니다.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <label class="toggle-pill" style="margin-right:auto;">
          <input type="checkbox" id="tx-keep-open" checked />
          <span>연속 입력 모드</span>
        </label>
        <button class="btn btn-outline" id="modal-cancel">취소</button>
        <button class="btn ${type === 'in' ? 'btn-success' : 'btn-danger'}" id="modal-save">${typeLabel} 저장</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const itemSelect = overlay.querySelector('#tx-item');
  const inputs = {
    vendor: overlay.querySelector('#tx-vendor'),
    itemName: overlay.querySelector('#tx-item-name'),
    qty: overlay.querySelector('#tx-qty'),
    price: overlay.querySelector('#tx-price'),
    date: overlay.querySelector('#tx-date'),
    note: overlay.querySelector('#tx-note'),
  };
  const keepOpenInput = overlay.querySelector('#tx-keep-open');
  let hasSavedChanges = false;
  const formatMoney = (value) => `₩${Math.round(value || 0).toLocaleString('ko-KR')}`;

  const getSelectedItem = () => {
    if (!itemSelect || itemSelect.value === '') return null;
    return items[parseInt(itemSelect.value, 10)] || null;
  };

  const refreshTxSummary = () => {
    const selectedItem = getSelectedItem();
    const qty = parseFloat(inputs.qty.value) || 0;
    const price = parseFloat(inputs.price.value) || 0;
    const currentQty = selectedItem ? (parseFloat(selectedItem.quantity) || 0) : 0;
    const nextQty = type === 'in' ? currentQty + qty : currentQty - qty;

    overlay.querySelector('#tx-summary-item').textContent = selectedItem?.itemName || inputs.itemName?.value?.trim() || '미선택';
    overlay.querySelector('#tx-summary-code').textContent = selectedItem
      ? `코드 ${selectedItem.itemCode || '-'} / 현재 재고 ${currentQty.toLocaleString('ko-KR')}개`
      : '품목을 선택하면 코드와 현재 재고가 표시됩니다.';
    overlay.querySelector('#tx-summary-stock').textContent = selectedItem ? `${nextQty.toLocaleString('ko-KR')}개` : '-';
    overlay.querySelector('#tx-summary-stock-note').textContent = selectedItem
      ? `${typeLabel} 후 예상 재고는 ${nextQty.toLocaleString('ko-KR')}개입니다.`
      : '수량 입력 전입니다.';
    overlay.querySelector('#tx-summary-amount').textContent = qty > 0 && price > 0 ? formatMoney(qty * price) : '₩0';
    overlay.querySelector('#tx-summary-amount-note').textContent = qty > 0 && price > 0
      ? `${qty.toLocaleString('ko-KR')}개 × ${formatMoney(price)} 기준 금액입니다.`
      : '수량과 단가를 넣으면 금액을 즉시 계산합니다.';

    const statusItems = [
      { done: !!(selectedItem || inputs.itemName?.value?.trim()), text: '품목이 선택되었습니다.' },
      { done: qty > 0, text: '수량이 입력되었습니다.' },
      { done: !!inputs.date.value, text: '날짜가 입력되었습니다.' },
      { done: !!inputs.vendor.value, text: '거래처가 연결되었습니다.' },
      { done: type !== 'out' || !selectedItem || nextQty >= 0, text: type === 'out' ? '출고 후 재고가 음수가 아닙니다.' : '입고 반영 후 재고가 계산되었습니다.' },
    ];
    overlay.querySelector('#tx-status-list').innerHTML = statusItems.map(entry => `
      <div class="form-status-item ${entry.done ? 'is-complete' : ''}">${entry.text}</div>
    `).join('');
  };

  if (itemSelect) {
    itemSelect.addEventListener('change', () => {
      const selectedItem = getSelectedItem();
      if (selectedItem && !inputs.price.value) {
        inputs.price.value = selectedItem.unitPrice || '';
      }
      refreshTxSummary();
    });
  }
  Object.values(inputs).forEach(input => {
    input?.addEventListener('input', refreshTxSummary);
    input?.addEventListener('change', refreshTxSummary);
  });

  const lastVendor = localStorage.getItem(lastVendorKey);
  if (lastVendor && inputs.vendor && Array.from(inputs.vendor.options).some(opt => opt.value === lastVendor)) {
    inputs.vendor.value = lastVendor;
  }
  inputs.vendor?.addEventListener('change', () => {
    if (inputs.vendor.value) localStorage.setItem(lastVendorKey, inputs.vendor.value);
  });
  refreshTxSummary();

  const close = () => {
    overlay.remove();
    if (hasSavedChanges) renderInoutPage(container, navigateTo);
  };
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#modal-save').addEventListener('click', () => {
    let itemName = '';
    let itemCode = '';

    if (items.length > 0 && itemSelect) {
      const idx = itemSelect.value;
      if (idx === '') {
        showToast('품목을 선택해 주세요.', 'warning');
        return;
      }
      const selectedItem = items[parseInt(idx, 10)];
      itemName = selectedItem.itemName;
      itemCode = selectedItem.itemCode || '';
    } else {
      itemName = inputs.itemName?.value.trim();
      if (!itemName) {
        showToast('품목명을 입력해 주세요.', 'warning');
        return;
      }
    }

    const qty = parseFloat(inputs.qty.value);
    if (!qty || qty <= 0) {
      showToast('수량을 입력해 주세요.', 'warning');
      return;
    }

    const date = inputs.date.value;
    if (!date) {
      showToast('날짜를 선택해 주세요.', 'warning');
      return;
    }

    if (type === 'out' && items.length > 0 && itemSelect) {
      const idx = parseInt(itemSelect.value, 10);
      const currentQty = parseFloat(items[idx]?.quantity) || 0;
      if (qty > currentQty) {
        showToast(`출고 수량이 현재 재고 ${currentQty}개를 넘습니다.`, 'error');
        return;
      }
    }

    addTransaction({
      type,
      vendor: inputs.vendor.value || '',
      itemName,
      itemCode,
      quantity: qty,
      unitPrice: parseFloat(inputs.price.value) || 0,
      date,
      note: inputs.note.value.trim(),
    });
    hasSavedChanges = true;

    const latestTxId = getState().transactions?.[0]?.id;
    showActionToast(
      `${typeLabel} 기록: ${itemName} ${qty}개`,
      '실행 취소',
      () => {
        if (!latestTxId) return;
        deleteTransaction(latestTxId);
        showToast('방금 등록한 기록을 취소했습니다.', 'info');
      },
      type === 'in' ? 'success' : 'info',
      5000,
    );

    if (inputs.vendor.value) localStorage.setItem(lastVendorKey, inputs.vendor.value);

    const keepOpen = !!keepOpenInput?.checked;
    if (!keepOpen) {
      close();
      return;
    }

    if (itemSelect) itemSelect.value = '';
    if (inputs.itemName) inputs.itemName.value = '';
    inputs.qty.value = '';
    inputs.price.value = '';
    inputs.note.value = '';
    refreshTxSummary();
    const nextFocus = itemSelect || inputs.itemName || inputs.qty;
    nextFocus?.focus();
  });

  setTimeout(() => {
    if (items.length > 0) {
      overlay.querySelector('#tx-item')?.focus();
    } else {
      overlay.querySelector('#tx-item-name')?.focus();
    }
  }, 100);
}

// === ?좏떥 ===

function countToday(transactions, type) {
  const today = new Date().toISOString().split('T')[0];
  return transactions.filter(tx => tx.type === type && tx.date === today).length;
}

/**
 * 嫄곕옒泥??꾪꽣 ?듭뀡 異붿텧
 * ???몃옖??뀡怨??덈ぉ 紐⑤몢?먯꽌? ??湲곗〈 ?몃옖??뀡??vendor媛 ?놁쓣 ???덉쑝誘濡?
 *   ?덈ぉ??vendor???ы븿?섏뿬 鍮덊땲?놁씠 ?꾪꽣留?
 */
function getVendorOptions(transactions, items) {
  const fromTx = transactions.map(tx => tx.vendor).filter(Boolean);
  const fromItems = items.map(i => i.vendor).filter(Boolean);
  return [...new Set([...fromTx, ...fromItems])].sort();
}

/**
 * ?깅줉???덈ぉ?ㅼ쓽 ?덈ぉ肄붾뱶 紐⑸줉 異붿텧
 */
function getCodeList(items) {
  return [...new Set(items.map(i => i.itemCode).filter(Boolean))].sort();
}

