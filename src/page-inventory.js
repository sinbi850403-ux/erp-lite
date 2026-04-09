/**
 * page-inventory.js - ?ш퀬 ?꾪솴 ?섏씠吏
 * ?ㅻТ 湲곕뒫: ?섎룞 ?덈ぉ 異붽?/?몄쭛, ?덉쟾?ш퀬 寃쎄퀬, 寃???꾪꽣, ?섏씠吏?ㅼ씠?? ?묒? ?대낫?닿린
 * **而щ읆 ?쒖떆 ?ㅼ젙**: ?ъ슜?먭? 蹂닿퀬 ?띠? 而щ읆留??좏깮?댁꽌 蹂????덉쓬
 */

import { getState, setState, addItem, updateItem, deleteItem, setSafetyStock } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { generateInventoryPDF } from './pdf-generator.js';
import { renderGuidedPanel, renderInsightHero, renderQuickFilterRow } from './ux-toolkit.js';

// ?섏씠吏??????
const PAGE_SIZE = 20;

// ?꾩껜 ?꾨뱶 ?뺤쓽 (?쒖꽌 ?좎?)
const ALL_FIELDS = [
  { key: 'itemName', label: '품목명', numeric: false },
  { key: 'itemCode', label: '품목코드', numeric: false },
  { key: 'category', label: '분류', numeric: false },
  { key: 'vendor', label: '거래처', numeric: false },
  { key: 'quantity', label: '수량', numeric: true },
  { key: 'unit', label: '단위', numeric: false },
  { key: 'unitPrice', label: '매입가(원가)', numeric: true },
  { key: 'salePrice', label: '판매가(소가)', numeric: true },
  { key: 'supplyValue', label: '공급가액', numeric: true },
  { key: 'vat', label: '부가세', numeric: true },
  { key: 'totalPrice', label: '합계금액', numeric: true },
  { key: 'warehouse', label: '창고/위치', numeric: false },
  { key: 'expiryDate', label: '유통기한', numeric: false },
  { key: 'lotNumber', label: 'LOT번호', numeric: false },
  { key: 'note', label: '비고', numeric: false },
];

// 媛꾪렪 李몄“ 留?
const FIELD_LABELS = {};
ALL_FIELDS.forEach(f => { FIELD_LABELS[f.key] = f.label; });

/**
 * ?꾩옱 ?쒖떆??而щ읆 紐⑸줉 寃곗젙
 * ????濡쒖쭅? ??visibleColumns ?ㅼ젙???덉쑝硫?洹멸구 ?곕Ⅴ怨?
 * ?놁쑝硫??곗씠?곗뿉 ?ㅼ젣 媛믪씠 ?덈뒗 ?꾨뱶留??먮룞 ?좏깮
 */
function getVisibleFields(data) {
  const state = getState();
  const visibleColumns = state.visibleColumns;

  // ?곗씠?곗뿉 ?ㅼ젣 媛믪씠 ?ㅼ뼱?덈뒗 ?꾨뱶 紐⑸줉
  const hasData = new Set(
    ALL_FIELDS.map(f => f.key).filter(key =>
      data.some(row => row[key] !== '' && row[key] !== undefined && row[key] !== null)
    )
  );

  if (visibleColumns && Array.isArray(visibleColumns)) {
    // [VAT ?⑥튂] 湲곗〈 ?ㅼ젙???덈뜑?쇰룄 ?덈∼寃?異붽???怨듦툒媛?? 遺媛?몃뒗 ?곗꽑 蹂댁씠寃?蹂댁젙
    const updatedVisible = [...visibleColumns];
    if (!updatedVisible.includes('supplyValue')) updatedVisible.push('supplyValue');
    if (!updatedVisible.includes('vat')) updatedVisible.push('vat');
    
    // ?ъ슜???ㅼ젙???덉쑝硫????ㅼ젙???ы븿??寃껊쭔 (?쒖꽌??ALL_FIELDS ?쒖꽌 ?좎?)
    return ALL_FIELDS.filter(f => updatedVisible.includes(f.key)).map(f => f.key);
  }

  // ?ㅼ젙 ?놁쑝硫????곗씠?곌? ?덈뒗 ?꾨뱶留??먮룞 ?좏깮
  // ?ш린???좉퇋 而щ읆??鍮꾩뼱?덈뜑?쇰룄 ?쇰떒 ?ㅻ뜑??蹂댁씠?꾨줉 媛뺤젣 ?ы븿 (?좎? ?붿껌)
  return ALL_FIELDS.filter(f => hasData.has(f.key) || f.key === 'supplyValue' || f.key === 'vat').map(f => f.key);
}

/**
 * ?ш퀬 ?꾪솴 ?섏씠吏 ?뚮뜑留?
 */
export function renderInventoryPage(container, navigateTo) {
  const state = getState();
  const data = state.mappedData || [];
  const safetyStock = state.safetyStock || {};

  if (data.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="title-icon">?벀</span> ?ш퀬 ?꾪솴</h1>
          <div class="page-desc">?덈ぉ???ш퀬 ?섎웾怨?湲덉븸??愿由ы빀?덈떎.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-item">+ ?덈ぉ 異붽?</button>
        </div>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">?벀</div>
          <div class="msg">?꾩쭅 ?깅줉???덈ぉ???놁뒿?덈떎</div>
          <div class="sub">?뚯씪???낅줈?쒗븯嫄곕굹, ?꾩쓽 "?덈ぉ 異붽?" 踰꾪듉?쇰줈 吏곸젒 ?깅줉?섏꽭??</div>
          <br/>
          <button class="btn btn-outline" id="btn-go-upload">?뚯씪 ?낅줈?쒗븯湲?/button>
        </div>
      </div>
    `;
    container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
    container.querySelector('#btn-add-item')?.addEventListener('click', () => openItemModal(container, navigateTo));
    return;
  }

  // ?꾩옱 ?쒖떆???꾨뱶 紐⑸줉
  let activeFields = getVisibleFields(data);

  // ?곗씠?곗뿉 媛믪씠 ?덈뒗 ?꾩껜 ?꾨뱶 紐⑸줉 (而щ읆 ?ㅼ젙 ?⑤꼸?먯꽌 ?ъ슜)
  const allAvailableFields = ALL_FIELDS.filter(f =>
    data.some(row => row[f.key] !== '' && row[f.key] !== undefined && row[f.key] !== null)
  );

  // ?덉쟾?ш퀬 ?댄븯 ??ぉ 移댁슫??
  const warningCount = data.filter(d => {
    const min = safetyStock[d.itemName];
    const qtyStr = typeof d.quantity === 'string' ? d.quantity.replace(/,/g, '') : d.quantity;
    return min !== undefined && (parseFloat(qtyStr) || 0) <= min;
  }).length;
  const missingVendorCount = data.filter(row => !String(row.vendor || '').trim()).length;
  const missingWarehouseCount = data.filter(row => !String(row.warehouse || '').trim()).length;
  const missingSalePriceCount = data.filter(row => !(parseFloat(row.salePrice) > 0)).length;
  const beginnerMode = state.beginnerMode !== false;
  const hasTransactions = (state.transactions || []).length > 0;
  const inventoryHealthMetrics = [
    {
      label: '부족 품목',
      value: warningCount > 0 ? `${warningCount}건` : '안정',
      note: '안전재고 아래로 내려간 품목 수입니다.',
      stateClass: warningCount > 0 ? 'text-danger' : 'text-success',
    },
    {
      label: '거래처 미연결',
      value: missingVendorCount > 0 ? `${missingVendorCount}건` : '완료',
      note: '거래처를 연결하면 발주와 보고가 더 쉬워집니다.',
      stateClass: missingVendorCount > 0 ? 'text-warning' : 'text-success',
    },
    {
      label: '위치 미입력',
      value: missingWarehouseCount > 0 ? `${missingWarehouseCount}건` : '완료',
      note: '창고나 위치를 넣어두면 현장 찾기가 쉬워집니다.',
      stateClass: missingWarehouseCount > 0 ? 'text-warning' : 'text-success',
    },
    {
      label: '판매가 미입력',
      value: missingSalePriceCount > 0 ? `${missingSalePriceCount}건` : '완료',
      note: '판매가를 넣어두면 이익과 마진을 더 정확히 볼 수 있습니다.',
      stateClass: missingSalePriceCount > 0 ? 'text-warning' : 'text-success',
    },
  ];
  const inventoryFocusChips = [
    { value: 'all', label: '전체 보기' },
    { value: 'low', label: '부족 품목' },
    { value: 'zero', label: '수량 0' },
    { value: 'missingVendor', label: '거래처 미입력' },
    { value: 'missingWarehouse', label: '위치 미입력' },
  ];
  const sortOptions = [
    { value: 'default', label: '정렬 없음 (원본 순서)' },
    { value: 'itemName:asc', label: '품목명 오름차순' },
    { value: 'quantity:desc', label: '수량 많은 순' },
    { value: 'quantity:asc', label: '수량 적은 순' },
    { value: 'totalPrice:desc', label: '합계금액 높은 순' },
    { value: 'vendor:asc', label: '거래처 가나다순' },
    { value: '__lowStock:desc', label: '재고 부족 우선' },
  ];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">?벀</span> ?ш퀬 ?꾪솴</h1>
        <div class="page-desc">${state.fileName ? `?뱞 ${state.fileName}` : ''} 珥?${data.length}媛??덈ぉ</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export">?뱿 ?묒?</button>
        <button class="btn btn-outline" id="btn-export-pdf">?뱞 PDF</button>
        <button class="btn btn-primary" id="btn-add-item">+ ?덈ぉ 異붽?</button>
      </div>
    </div>

    <!-- ?듦퀎 移대뱶 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">?꾩껜 ?덈ぉ</div>
        <div class="stat-value text-accent" id="stat-total">${data.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">珥??섎웾</div>
        <div class="stat-value text-accent" id="stat-qty">${calcTotalQty(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">?⑷퀎 怨듦툒媛??/div>
        <div class="stat-value text-accent" id="stat-supply">${calcTotalSupply(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">?⑷퀎 遺媛??/div>
        <div class="stat-value text-accent" id="stat-vat">${calcTotalVat(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">珥??⑷퀎湲덉븸</div>
        <div class="stat-value text-success" id="stat-price">${calcTotalPrice(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">?ш퀬 遺議?寃쎄퀬</div>
        <div class="stat-value ${warningCount > 0 ? 'text-danger' : ''}" id="stat-warn">
          ${warningCount > 0 ? `${warningCount}건` : '없음'}
        </div>
      </div>
    </div>

    ${renderInsightHero({
      eyebrow: '?ш퀬 ?댁쁺 ?곹깭',
      title: '?꾧? 遊먮룄 諛붾줈 ?댄빐?섎뒗 ?ш퀬 嫄닿컯?꾨? 癒쇱? 蹂댁뿬以띾땲??',
      desc: '?섎웾, 湲덉븸, 嫄곕옒泥??곌껐, ?꾩튂 ?낅젰 ?곹깭瑜???踰덉뿉 ?먭??댁꽌 珥덈낫?먮룄 臾댁뾿遺???뺣━?좎? 諛붾줈 ?????덇쾶 援ъ꽦?덉뒿?덈떎.',
      tone: warningCount > 0 ? 'warning' : 'success',
      metrics: inventoryHealthMetrics,
      bullets: [
        warningCount > 0 ? `遺議??덈ぉ ${warningCount}嫄댁? 癒쇱? 蹂댁땐 ?щ?瑜??먮떒?섏꽭??` : '遺議??덈ぉ? ?놁뒿?덈떎. ?꾩옱 ?ш퀬 ?먮쫫? ?덉젙?곸엯?덈떎.',
        missingVendorCount > 0 ? `嫄곕옒泥섍? 鍮꾩뼱 ?덈뒗 ?덈ぉ ${missingVendorCount}嫄댁? 諛쒖＜? 臾몄꽌 ?곌껐???딄만 ???덉뒿?덈떎.` : '嫄곕옒泥??뺣낫??異⑸텇???곌껐?섏뼱 ?덉뒿?덈떎.',
        missingWarehouseCount > 0 ? `?꾩튂媛 鍮꾩뼱 ?덉쑝硫??꾩옣 議고쉶媛 ?먮젮吏묐땲?? ?꾩튂 誘몄엯???덈ぉ???곗꽑 ?뺣━?섏꽭??` : '?꾩튂 ?뺣낫?????뺣━?섏뼱 ?덉뒿?덈떎.',
      ],
      actions: [
        { id: 'btn-add-item-inline', label: '???덈ぉ 諛붾줈 異붽?', variant: 'btn-primary' },
        { nav: 'dashboard', label: '怨좉툒 遺꾩꽍 ?닿린', variant: 'btn-outline' },
        { nav: 'guide', label: '?낅젰 媛?대뱶 蹂닿린', variant: 'btn-ghost' },
      ],
    })}

    ${beginnerMode && !hasTransactions ? `
    <div class="card quick-start-card">
      <div class="quick-start-head">
        <div>
          <div class="quick-start-title">泥섏쓬 ?ъ슜??異붿쿇 ?먮쫫</div>
          <div class="quick-start-desc">3?④퀎留??곕씪?섎㈃ 諛붾줈 ?ㅻТ ?댁쁺??媛?ν빀?덈떎.</div>
        </div>
        <span class="badge badge-info">珥덈낫 紐⑤뱶</span>
      </div>
      <div class="quick-start-steps">
        <div class="quick-start-step is-done">1) ?ш퀬 ?덈ぉ ?뺤씤 ?꾨즺</div>
        <div class="quick-start-step">2) 泥??낆텧怨??깅줉</div>
        <div class="quick-start-step">3) ??쒕낫?쒖뿉???꾪솴 ?뺤씤</div>
      </div>
      <div class="quick-start-actions">
        <button class="btn btn-primary btn-sm" id="btn-quick-inout">泥??낆텧怨??깅줉</button>
        <button class="btn btn-outline btn-sm" id="btn-quick-guide">?ъ슜 媛?대뱶</button>
        <button class="btn btn-ghost btn-sm" id="btn-quick-dashboard">??쒕낫???대룞</button>
      </div>
    </div>
    ` : ''}

    ${renderQuickFilterRow({
      label: '鍮좊Ⅸ 蹂닿린',
      attr: 'data-inventory-focus',
      chips: inventoryFocusChips.map(chip => ({ ...chip, active: chip.value === 'all' })),
    })}

    <!-- 寃???꾪꽣 + ?뺣젹 + 而щ읆 ?ㅼ젙 -->
    <div class="toolbar">
      <input type="text" class="search-input" id="search-input"
        placeholder="?덈ぉ紐? 肄붾뱶, 遺꾨쪟濡?寃??.." />
      <select class="filter-select" id="filter-item-code">
        <option value="">?꾩껜 ?덈ぉ肄붾뱶</option>
        ${getItemCodes(data).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-vendor">
        <option value="">?꾩껜 嫄곕옒泥?/option>
        ${getVendors(data).map(v => `<option value="${v}">${v}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-category">
        <option value="">?꾩껜 遺꾨쪟</option>
        ${getCategories(data).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-warehouse">
        <option value="">?꾩껜 李쎄퀬</option>
        ${getWarehouses(data).map(w => `<option value="${w}">${w}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-stock">
        <option value="">?꾩껜 ?ш퀬</option>
        <option value="low">?좑툘 遺議???ぉ留?/option>
      </select>
      <select class="filter-select" id="sort-preset" title="?뺣젹">
        ${sortOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" id="btn-filter-reset" title="?꾪꽣 珥덇린??>?봽 珥덇린??/button>
      <div class="col-settings-wrap" style="position:relative;">
        <button class="btn btn-outline btn-sm" id="btn-col-settings" title="?쒖떆??而щ읆 ?좏깮">
          ?숋툘 ?쒖떆 ??ぉ
        </button>
        <div class="col-settings-panel" id="col-settings-panel">
          <div class="col-settings-header">
            <strong>?뱥 ?쒖떆????ぉ ?좏깮</strong>
            <button class="col-settings-close" id="col-settings-close">??/button>
          </div>
          <div class="col-settings-body">
            ${allAvailableFields.map(f => `
              <label class="col-settings-item">
                <input type="checkbox" class="col-check" data-key="${f.key}"
                  ${activeFields.includes(f.key) ? 'checked' : ''} />
                <span>${f.label}</span>
              </label>
            `).join('')}
          </div>
          <div class="col-settings-footer">
            <button class="btn btn-ghost btn-sm" id="col-select-all">?꾩껜 ?좏깮</button>
            <button class="btn btn-primary btn-sm" id="col-apply">?곸슜</button>
          </div>
        </div>
      </div>
    </div>
    <div class="filter-summary" id="inventory-filter-summary"></div>

    <!-- ?곗씠???뚯씠釉?-->
    <div class="card card-flush">
      <div class="table-wrapper" style="border:none;">
        <table class="data-table" id="inventory-table">
          <thead id="inventory-thead"></thead>
          <tbody id="inventory-body"></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>

    <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
      ?뮕 ????붾툝?대┃?섎㈃ 吏곸젒 ?섏젙?????덉뒿?덈떎. | ?숋툘 ?쒖떆 ??ぉ 踰꾪듉?쇰줈 蹂닿퀬 ?띠? 而щ읆???좏깮?섏꽭??
    </div>
  `;

  // === ?곹깭 蹂??===
  const defaultFilter = { keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all' };
  const defaultSort = { key: '', direction: '' };
  const savedViewPrefs = state.inventoryViewPrefs || {};
  let currentFilter = sanitizeInventoryFilter(savedViewPrefs.filter);
  let currentPageNum = 1;
  let currentSort = sanitizeInventorySort(savedViewPrefs.sort);
  let persistTimer = null;

  function sanitizeInventoryFilter(raw) {
    const candidate = raw || {};
    return {
      keyword: typeof candidate.keyword === 'string' ? candidate.keyword : '',
      category: typeof candidate.category === 'string' ? candidate.category : '',
      warehouse: typeof candidate.warehouse === 'string' ? candidate.warehouse : '',
      stock: candidate.stock === 'low' ? 'low' : '',
      itemCode: typeof candidate.itemCode === 'string' ? candidate.itemCode : '',
      vendor: typeof candidate.vendor === 'string' ? candidate.vendor : '',
      focus: ['all', 'low', 'zero', 'missingVendor', 'missingWarehouse'].includes(candidate.focus) ? candidate.focus : 'all',
    };
  }

  function sanitizeInventorySort(raw) {
    const candidate = raw || {};
    const allowedKeys = new Set(['__lowStock', ...ALL_FIELDS.map(field => field.key)]);
    const direction = candidate.direction === 'asc' || candidate.direction === 'desc' ? candidate.direction : '';
    if (!candidate.key || !direction || !allowedKeys.has(candidate.key)) {
      return { ...defaultSort };
    }
    return { key: candidate.key, direction };
  }

  function persistInventoryPrefs({ debounced = false } = {}) {
    const payload = {
      filter: { ...currentFilter },
      sort: { ...currentSort },
    };
    if (debounced) {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        setState({ inventoryViewPrefs: payload });
      }, 250);
      return;
    }
    clearTimeout(persistTimer);
    setState({ inventoryViewPrefs: payload });
  }

  // === ?뺣젹 ?좏떥 ===
  function getSortOptionLabel(sort) {
    if (!sort.key || !sort.direction) return '?뺣젹 ?놁쓬';
    const option = sortOptions.find(opt => opt.value === `${sort.key}:${sort.direction}`);
    if (option) return option.label;
    if (sort.key === '__lowStock') return '?ш퀬 遺議??곗꽑';
    const label = FIELD_LABELS[sort.key] || sort.key;
    return `${label} ${sort.direction === 'asc' ? '?ㅻ쫫李⑥닚' : '?대┝李⑥닚'}`;
  }

  function getSortIndicator(key) {
    if (currentSort.key !== key) return '↕';
    return currentSort.direction === 'asc' ? '↑' : '↓';
  }

  function getSortPresetValue(sort) {
    if (!sort.key || !sort.direction) return 'default';
    const value = `${sort.key}:${sort.direction}`;
    const hasPreset = sortOptions.some(option => option.value === value);
    return hasPreset ? value : 'default';
  }

  function parseSortPreset(value) {
    if (!value || value === 'default') return { key: '', direction: '' };
    const [key, direction] = value.split(':');
    if (!key || !direction) return { key: '', direction: '' };
    return { key, direction };
  }

  function getNumericValue(value) {
    if (value === '' || value === null || value === undefined) return null;
    const cleaned = typeof value === 'string' ? value.replace(/,/g, '') : value;
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  function isLowStockRow(row) {
    const min = safetyStock[row.itemName];
    const qty = getNumericValue(row.quantity) || 0;
    return min !== undefined && qty <= min;
  }

  function getComparableValue(row, key) {
    if (key === '__lowStock') {
      return isLowStockRow(row) ? 1 : 0;
    }

    const field = ALL_FIELDS.find(f => f.key === key);
    const raw = row[key];
    if (field?.numeric) {
      return getNumericValue(raw);
    }

    if (key === 'expiryDate' && raw) {
      const ts = new Date(raw).getTime();
      return Number.isNaN(ts) ? String(raw).toLowerCase() : ts;
    }

    if (raw === '' || raw === null || raw === undefined) return '';
    return String(raw).toLowerCase();
  }

  function sortRows(rows) {
    if (!currentSort.key || !currentSort.direction) return rows;

    const multiplier = currentSort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getComparableValue(a, currentSort.key);
      const bv = getComparableValue(b, currentSort.key);

      if ((av === null || av === '') && (bv === null || bv === '')) return 0;
      if (av === null || av === '') return 1;
      if (bv === null || bv === '') return -1;

      let compareResult = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        compareResult = av - bv;
      } else {
        compareResult = String(av).localeCompare(String(bv), 'ko-KR', { numeric: true, sensitivity: 'base' });
      }
      return compareResult * multiplier;
    });
  }

  function renderFilterSummary(filteredCount, totalCount) {
    const summaryEl = container.querySelector('#inventory-filter-summary');
    if (!summaryEl) return;

    const chips = [];
    if (currentFilter.keyword) chips.push(`검색: ${currentFilter.keyword}`);
    if (currentFilter.itemCode) chips.push(`품목코드: ${currentFilter.itemCode}`);
    if (currentFilter.vendor) chips.push(`거래처: ${currentFilter.vendor}`);
    if (currentFilter.category) chips.push(`분류: ${currentFilter.category}`);
    if (currentFilter.warehouse) chips.push(`창고: ${currentFilter.warehouse}`);
    if (currentFilter.stock === 'low') chips.push('부족 항목만');
    if (currentFilter.focus === 'zero') chips.push('수량 0');
    if (currentFilter.focus === 'missingVendor') chips.push('거래처 미입력');
    if (currentFilter.focus === 'missingWarehouse') chips.push('위치 미입력');
    if (currentFilter.focus === 'low') chips.push('빠른 보기: 부족 품목');
    if (currentSort.key && currentSort.direction) chips.push(`정렬: ${getSortOptionLabel(currentSort)}`);

    const chipsHtml = chips.length > 0
      ? chips.map(text => `<span class="filter-chip">${text}</span>`).join('')
      : '<span class="filter-chip filter-chip-muted">?꾪꽣 ?놁쓬</span>';

    summaryEl.innerHTML = `
      <div class="filter-summary-row">
        <div class="filter-summary-count">?쒖떆 ${filteredCount}嫄?/ ?꾩껜 ${totalCount}嫄?/div>
        <div class="filter-summary-chips">${chipsHtml}</div>
      </div>
    `;
  }

  function attachSortHeaderEvents() {
    container.querySelectorAll('.sortable-header[data-sort-key]').forEach(header => {
      header.setAttribute('tabindex', '0');
      header.setAttribute('role', 'button');
      header.addEventListener('click', () => {
        const key = header.dataset.sortKey;
        if (!key) return;

        if (currentSort.key !== key) {
          currentSort = { key, direction: 'asc' };
        } else if (currentSort.direction === 'asc') {
          currentSort = { key, direction: 'desc' };
        } else {
          currentSort = { key: '', direction: '' };
        }

        const sortSelect = container.querySelector('#sort-preset');
        if (sortSelect) sortSelect.value = getSortPresetValue(currentSort);

        persistInventoryPrefs();
        currentPageNum = 1;
        renderTableHeader();
        renderTable();
      });

      header.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        header.click();
      });
    });
  }

  // === ?뚯씠釉??ㅻ뜑 ?뚮뜑留?(而щ읆 蹂寃????ы샇異? ===
  function renderTableHeader() {
    const thead = container.querySelector('#inventory-thead');
    thead.innerHTML = `
      <tr>
        <th class="col-num">#</th>
        ${activeFields.map(key => `
          <th
            class="sortable-header ${ALL_FIELDS.find(f => f.key === key)?.numeric ? 'text-right' : ''} ${currentSort.key === key ? 'is-active' : ''}"
            data-sort-key="${key}"
            title="?대┃?섏뿬 ?뺣젹"
            aria-sort="${currentSort.key === key ? (currentSort.direction === 'asc' ? 'ascending' : currentSort.direction === 'desc' ? 'descending' : 'none') : 'none'}"
          >
            <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
              <span class="sort-label">${FIELD_LABELS[key]}</span>
              <span class="sort-indicator">${getSortIndicator(key)}</span>
            </button>
          </th>
        `).join('')}
        <th class="text-center" style="width:70px;">?덉쟾?ш퀬</th>
        <th class="col-actions">愿由?/th>
      </tr>
    `;
    attachSortHeaderEvents();
  }

  // === ?꾪꽣留?===
  function getFilteredData() {
    return data.filter(row => {
      const kw = currentFilter.keyword.toLowerCase();
      if (kw && !(
        (row.itemName || '').toLowerCase().includes(kw) ||
        (row.itemCode || '').toLowerCase().includes(kw) ||
        (row.category || '').toLowerCase().includes(kw)
      )) return false;

      if (currentFilter.category && row.category !== currentFilter.category) return false;
      if (currentFilter.warehouse && row.warehouse !== currentFilter.warehouse) return false;
      if (currentFilter.itemCode && row.itemCode !== currentFilter.itemCode) return false;
      if (currentFilter.vendor && row.vendor !== currentFilter.vendor) return false;
      if (currentFilter.stock === 'low' && !isLowStockRow(row)) return false;
      if (currentFilter.focus === 'low' && !isLowStockRow(row)) return false;
      if (currentFilter.focus === 'zero' && getNumericValue(row.quantity) !== 0) return false;
      if (currentFilter.focus === 'missingVendor' && String(row.vendor || '').trim()) return false;
      if (currentFilter.focus === 'missingWarehouse' && String(row.warehouse || '').trim()) return false;
      return true;
    });
  }

  // === ?뚯씠釉?諛붾뵒 ?뚮뜑留?===
  function renderTable() {
    const filtered = getFilteredData();
    const sorted = sortRows(filtered);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (currentPageNum > totalPages) currentPageNum = totalPages;

    const start = (currentPageNum - 1) * PAGE_SIZE;
    const pageData = sorted.slice(start, start + PAGE_SIZE);

    const tbody = container.querySelector('#inventory-body');
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${activeFields.length + 3}" style="text-align:center; padding:32px; color:var(--text-muted);">
        寃??寃곌낵媛 ?놁뒿?덈떎.
      </td></tr>`;
    } else {
      tbody.innerHTML = pageData.map((row, i) => {
        const realIdx = data.indexOf(row);
        const min = safetyStock[row.itemName];
        const qtyStr = typeof row.quantity === 'string' ? row.quantity.replace(/,/g, '') : row.quantity;
        const qty = parseFloat(qtyStr) || 0;
        const isLow = min !== undefined && qty <= min;
        const isDanger = min !== undefined && qty === 0;

        return `
          <tr class="${isDanger ? 'row-danger' : isLow ? 'row-warning' : ''}" data-idx="${realIdx}">
            <td class="col-num">${start + i + 1}</td>
            ${activeFields.map(key => `
              <td class="editable-cell ${ALL_FIELDS.find(f => f.key === key)?.numeric ? 'text-right' : ''}"
                  data-field="${key}" data-idx="${realIdx}">
                ${formatCell(key, row[key])}
                ${key === 'quantity' && isLow ? ' <span class="badge badge-danger" style="font-size:10px;">遺議?/span>' : ''}
              </td>
            `).join('')}
            <td class="text-center">
              <button class="btn-icon btn-safety" data-name="${row.itemName}" data-min="${min ?? ''}"
                title="?대┃?섏뿬 ?덉쟾?ш퀬 ?섎웾 ?ㅼ젙"
                style="font-size:11px; padding:2px 6px; border-radius:4px;
                  ${min !== undefined ? 'background:rgba(63,185,80,0.15); color:var(--success);' : 'color:var(--text-muted);'}">
                ${min !== undefined ? `?뵒 ${min}` : '?ㅼ젙'}
              </button>
            </td>
            <td class="col-actions">
              <button class="btn-icon btn-edit" data-idx="${realIdx}" title="?몄쭛">?륅툘</button>
              <button class="btn-icon btn-icon-danger btn-del" data-idx="${realIdx}" title="??젣">?뿊截?/button>
            </td>
          </tr>
        `;
      }).join('');
    }

    renderFilterSummary(sorted.length, data.length);

    // ?섏씠吏?ㅼ씠??
    const paginationEl = container.querySelector('#pagination');
    const pageStart = sorted.length === 0 ? 0 : start + 1;
    paginationEl.innerHTML = `
      <span>${sorted.length}嫄?以?${pageStart}~${Math.min(start + PAGE_SIZE, sorted.length)}</span>
      <div class="pagination-btns">
        <button class="page-btn" id="page-prev" ${currentPageNum <= 1 ? 'disabled' : ''}>???댁쟾</button>
        ${Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
          let p;
          if (totalPages <= 7) { p = i + 1; }
          else if (currentPageNum <= 4) { p = i + 1; }
          else if (currentPageNum >= totalPages - 3) { p = totalPages - 6 + i; }
          else { p = currentPageNum - 3 + i; }
          return `<button class="page-btn ${p === currentPageNum ? 'active' : ''}" data-p="${p}">${p}</button>`;
        }).join('')}
        <button class="page-btn" id="page-next" ${currentPageNum >= totalPages ? 'disabled' : ''}>?ㅼ쓬 ??/button>
      </div>
    `;

    // ?대깽???ъ뿰寃?
    attachTableEvents();
    attachPaginationEvents();
  }

  // === ?뚯씠釉??대깽??(?몃씪???몄쭛, ??젣 ?? ===
  function attachTableEvents() {
    // ?몃씪???몄쭛
    container.querySelectorAll('.editable-cell').forEach(cell => {
      cell.addEventListener('dblclick', () => {
        const idx = parseInt(cell.dataset.idx);
        const field = cell.dataset.field;
        const currentValue = data[idx]?.[field] ?? '';
        if (cell.querySelector('input')) return;

        const input = document.createElement('input');
        input.value = currentValue;
        input.className = 'form-input';
        input.style.cssText = 'padding:4px 6px; font-size:13px;';
        cell.textContent = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
          const newVal = input.value;
          updateItem(idx, { [field]: newVal });
          // ?⑷퀎 ?ш퀎??(留ㅼ엯?④? ?먮뒗 ?먮ℓ?④? 蹂寃???
          if (field === 'quantity' || field === 'unitPrice' || field === 'salePrice') {
            const q = parseFloat(data[idx].quantity) || 0;
            const p = parseFloat(data[idx].unitPrice) || 0;
            const supply = q * p;
            const vat = Math.floor(supply * 0.1);
            updateItem(idx, { 
              supplyValue: supply,
              vat: vat,
              totalPrice: supply + vat 
            });
          }
          renderTable();
          updateStats();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') renderTable();
        });
      });
    });

    // ??젣
    container.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const name = data[idx]?.itemName || `${idx + 1}踰???ぉ`;
        if (confirm(`"${name}"??瑜? ??젣?섏떆寃좎뒿?덇퉴?`)) {
          deleteItem(idx);
          renderTable();
          updateStats();
          showToast(`"${name}" ??ぉ????젣?덉뒿?덈떎.`, 'info');
        }
      });
    });

    // ?몄쭛 (紐⑤떖)
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        openItemModal(container, navigateTo, idx);
      });
    });

    // ?덉쟾?ш퀬 ?ㅼ젙
    container.querySelectorAll('.btn-safety').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const currentMin = btn.dataset.min;
        const input = prompt(
          `"${name}"???덉쟾?ш퀬(理쒖냼 ?섎웾)瑜??낅젰?섏꽭??\n鍮꾩썙?먮㈃ ?댁젣?⑸땲??`,
          currentMin
        );
        if (input === null) return; // 痍⑥냼
        if (input.trim() === '') {
          setSafetyStock(name, undefined);
          showToast(`"${name}" ?덉쟾?ш퀬 ?댁젣`, 'info');
        } else {
          const num = parseInt(input);
          if (isNaN(num) || num < 0) {
            showToast('?レ옄瑜??낅젰??二쇱꽭??', 'warning');
            return;
          }
          setSafetyStock(name, num);
          showToast(`"${name}" ?덉쟾?ш퀬瑜?${num}?쇰줈 ?ㅼ젙?덉뒿?덈떎.`, 'success');
        }
        renderTable();
        updateStats();
      });
    });
  }

  // ?섏씠吏?ㅼ씠???대깽??
  function attachPaginationEvents() {
    container.querySelector('#page-prev')?.addEventListener('click', () => {
      if (currentPageNum > 1) { currentPageNum--; renderTable(); }
    });
    container.querySelector('#page-next')?.addEventListener('click', () => {
      currentPageNum++;
      renderTable();
    });
    container.querySelectorAll('.page-btn[data-p]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPageNum = parseInt(btn.dataset.p);
        renderTable();
      });
    });
  }

  // ?듦퀎 ?낅뜲?댄듃
  function updateStats() {
    const d = getState().mappedData || [];
    const ss = getState().safetyStock || {};
    container.querySelector('#stat-total').textContent = d.length;
    container.querySelector('#stat-qty').textContent = calcTotalQty(d);
    const supplyEl = container.querySelector('#stat-supply');
    if(supplyEl) supplyEl.textContent = calcTotalSupply(d);
    const vatEl = container.querySelector('#stat-vat');
    if(vatEl) vatEl.textContent = calcTotalVat(d);
    container.querySelector('#stat-price').textContent = calcTotalPrice(d);
    const wc = d.filter(r => {
      const min = ss[r.itemName];
      const qtyStr = typeof r.quantity === 'string' ? r.quantity.replace(/,/g, '') : r.quantity;
      return min !== undefined && (parseFloat(qtyStr) || 0) <= min;
    }).length;
    // warningCount ?섎━癒쇳듃???꾩뿉???쒓? display:none ?섍굅???꾩삁 類먮뒗??.. (?댁씠荑?類먮꽕??
    // ?ㅼ떆 ?앷컖??蹂대땲 ?ш퀬 遺議?寃쎄퀬 移대뱶??以묒슂?⑸땲??
    const warnEl = container.querySelector('#stat-warn');
    if (warnEl) {
      warnEl.textContent = wc > 0 ? `${wc}건` : '없음';
      warnEl.className = `stat-value ${wc > 0 ? 'text-danger' : ''}`;
    }
  }

  // === 而щ읆 ?ㅼ젙 ?⑤꼸 ?대깽??===

  const colPanel = container.querySelector('#col-settings-panel');
  const colBtn = container.querySelector('#btn-col-settings');

  // ?⑤꼸 ?닿린/?リ린
  colBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    colPanel.classList.toggle('open');
  });

  container.querySelector('#col-settings-close').addEventListener('click', () => {
    colPanel.classList.remove('open');
  });

  // ?⑤꼸 ?몃? ?대┃ ???リ린
  document.addEventListener('click', (e) => {
    if (!colPanel.contains(e.target) && e.target !== colBtn) {
      colPanel.classList.remove('open');
    }
  });

  // ?꾩껜 ?좏깮 踰꾪듉
  container.querySelector('#col-select-all').addEventListener('click', () => {
    container.querySelectorAll('.col-check').forEach(cb => { cb.checked = true; });
  });

  // ?곸슜 踰꾪듉 ???좏깮??而щ읆????ν븯怨??뚯씠釉??덈줈 洹몃━湲?
  container.querySelector('#col-apply').addEventListener('click', () => {
    const checked = [];
    container.querySelectorAll('.col-check:checked').forEach(cb => {
      checked.push(cb.dataset.key);
    });

    if (checked.length === 0) {
      showToast('理쒖냼 1媛??댁긽????ぉ???좏깮??二쇱꽭??', 'warning');
      return;
    }

    // ?꾩껜 ?좏깮?대㈃ null濡????(湲곕낯媛?= ?먮룞)
    const allKeys = allAvailableFields.map(f => f.key);
    const isAll = checked.length === allKeys.length && allKeys.every(k => checked.includes(k));

    setState({ visibleColumns: isAll ? null : checked });
    activeFields = checked;

    // ?뚯씠釉??ㅻ뜑+諛붾뵒 ?ㅼ떆 洹몃━湲?
    renderTableHeader();
    renderTable();
    colPanel.classList.remove('open');
    showToast(`${checked.length}媛???ぉ ?쒖떆`, 'success');
  });

  // 珥덉떖??鍮좊Ⅸ ?≪뀡
  container.querySelector('#btn-quick-inout')?.addEventListener('click', () => navigateTo('inout'));
  container.querySelector('#btn-quick-guide')?.addEventListener('click', () => navigateTo('guide'));
  container.querySelector('#btn-quick-dashboard')?.addEventListener('click', () => navigateTo('home'));
  container.querySelector('#btn-add-item-inline')?.addEventListener('click', () => openItemModal(container, navigateTo));
  container.querySelectorAll('[data-nav]').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.nav));
  });

  function syncFocusChips() {
    container.querySelectorAll('[data-inventory-focus]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.inventoryFocus === currentFilter.focus);
    });
  }

  container.querySelectorAll('[data-inventory-focus]').forEach(button => {
    button.addEventListener('click', () => {
      currentFilter.focus = button.dataset.inventoryFocus || 'all';
      if (currentFilter.focus === 'low') {
        currentFilter.stock = 'low';
        const stockFilter = container.querySelector('#filter-stock');
        if (stockFilter) stockFilter.value = 'low';
      } else if (currentFilter.stock === 'low' && currentFilter.focus !== 'all') {
        currentFilter.stock = '';
        const stockFilter = container.querySelector('#filter-stock');
        if (stockFilter) stockFilter.value = '';
      }
      if (currentFilter.focus === 'all') {
        currentFilter.stock = '';
        const stockFilter = container.querySelector('#filter-stock');
        if (stockFilter) stockFilter.value = '';
      }
      currentPageNum = 1;
      renderTable();
      highlightActiveFilters();
      syncFocusChips();
      persistInventoryPrefs();
    });
  });

  // === 寃???꾪꽣/?뺣젹 ?대깽??===
  container.querySelector('#search-input').addEventListener('input', (e) => {
    currentFilter.keyword = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs({ debounced: true });
  });
  container.querySelector('#filter-item-code').addEventListener('change', (e) => {
    currentFilter.itemCode = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#filter-vendor').addEventListener('change', (e) => {
    currentFilter.vendor = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#filter-category').addEventListener('change', (e) => {
    currentFilter.category = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#filter-warehouse').addEventListener('change', (e) => {
    currentFilter.warehouse = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#filter-stock').addEventListener('change', (e) => {
    currentFilter.stock = e.target.value;
    if (e.target.value === 'low') currentFilter.focus = 'low';
    else if (currentFilter.focus === 'low') currentFilter.focus = 'all';
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    syncFocusChips();
    persistInventoryPrefs();
  });
  container.querySelector('#sort-preset').addEventListener('change', (e) => {
    currentSort = sanitizeInventorySort(parseSortPreset(e.target.value));
    currentPageNum = 1;
    renderTableHeader();
    renderTable();
    persistInventoryPrefs();
  });

  // ?꾪꽣/?뺣젹 珥덇린??踰꾪듉
  container.querySelector('#btn-filter-reset').addEventListener('click', () => {
    currentFilter = { ...defaultFilter };
    currentSort = { ...defaultSort };
    container.querySelector('#search-input').value = '';
    container.querySelector('#filter-item-code').value = '';
    container.querySelector('#filter-vendor').value = '';
    container.querySelector('#filter-category').value = '';
    container.querySelector('#filter-warehouse').value = '';
    container.querySelector('#filter-stock').value = '';
    container.querySelector('#sort-preset').value = 'default';
    currentPageNum = 1;
    renderTableHeader();
    renderTable();
    highlightActiveFilters();
    syncFocusChips();
    persistInventoryPrefs();
    showToast('?꾪꽣? ?뺣젹??珥덇린?뷀뻽?듬땲??', 'info');
  });

  // ?꾪꽣 ?쒖꽦 ?곹깭 ?쒓컖???쒖떆
  function highlightActiveFilters() {
    const filterIds = ['filter-item-code', 'filter-vendor', 'filter-category', 'filter-warehouse', 'filter-stock', 'sort-preset'];
    filterIds.forEach(id => {
      const el = container.querySelector(`#${id}`);
      const isSort = id === 'sort-preset';
      const active = isSort ? (el && el.value && el.value !== 'default') : (el && el.value);
      if (active) {
        el.classList.add('filter-active');
      } else if (el) {
        el.classList.remove('filter-active');
      }
    });
    const searchEl = container.querySelector('#search-input');
    if (searchEl) searchEl.classList.toggle('filter-active', !!currentFilter.keyword);
  }

  // ?묒? ?대낫?닿린 ???꾩옱 ?쒖떆 以묒씤 而щ읆留??대낫?닿린
  container.querySelector('#btn-export').addEventListener('click', () => {
    try {
      const exportData = data.map(row => {
        const obj = {};
        activeFields.forEach(key => { obj[FIELD_LABELS[key]] = row[key]; });
        return obj;
      });
      const baseName = (state.fileName || '?ш퀬?꾪솴').replace(/\.[^.]+$/, '');
      downloadExcel(exportData, `${baseName}_?ш퀬?꾪솴`);
      showToast('?묒? ?뚯씪???ㅼ슫濡쒕뱶?덉뒿?덈떎.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // PDF ?대낫?닿린
  container.querySelector('#btn-export-pdf')?.addEventListener('click', () => {
    generateInventoryPDF(data);
  });

  // ?덈ぉ 異붽? 踰꾪듉
  container.querySelector('#btn-add-item').addEventListener('click', () => {
    openItemModal(container, navigateTo);
  });

  // === 珥덇린 ?뚮뜑留?===
  container.querySelector('#search-input').value = currentFilter.keyword;
  container.querySelector('#filter-item-code').value = currentFilter.itemCode;
  container.querySelector('#filter-vendor').value = currentFilter.vendor;
  container.querySelector('#filter-category').value = currentFilter.category;
  container.querySelector('#filter-warehouse').value = currentFilter.warehouse;
  container.querySelector('#filter-stock').value = currentFilter.stock;
  container.querySelector('#sort-preset').value = getSortPresetValue(currentSort);
  renderTableHeader();
  renderTable();
  highlightActiveFilters();
  syncFocusChips();
}

// === ?덈ぉ 異붽?/?몄쭛 紐⑤떖 ===

function openItemModal(container, navigateTo, editIdx = null) {
  const state = getState();
  const isEdit = editIdx !== null;
  const item = isEdit ? (state.mappedData[editIdx] || {}) : {};

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? '품목 수정' : '새 품목 추가'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-shell">
          <div class="form-shell-main">
            ${renderGuidedPanel({
              eyebrow: '품목 입력 순서',
              title: isEdit ? '필수값만 먼저 확인하고 빠르게 수정하세요.' : '필수값만 입력해도 바로 저장할 수 있습니다.',
              desc: '품목명, 수량, 원가만 입력하면 재고 금액 계산이 즉시 됩니다. 거래처, 위치, 판매가는 나중에 채워도 괜찮습니다.',
              badge: isEdit ? '수정 모드' : '초보자 추천',
              steps: [
                { kicker: 'STEP 1', title: '품목명과 수량 입력', desc: '현장에서 부르는 이름 그대로 적으면 검색이 빨라집니다.' },
                { kicker: 'STEP 2', title: '원가와 판매가 확인', desc: '판매가를 넣으면 손익 분석 정확도가 올라갑니다.' },
                { kicker: 'STEP 3', title: '거래처와 위치는 보강 추천', desc: '지금 급하면 비워두고 저장 후 다시 수정해도 됩니다.' },
              ],
            })}

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">품목명<span class="required">*</span></label>
                <input class="form-input" id="f-itemName" value="${item.itemName || ''}" placeholder="예: A4용지, 복사용지 80g" />
              </div>
              <div class="form-group">
                <label class="form-label">품목코드</label>
                <input class="form-input" id="f-itemCode" value="${item.itemCode || ''}" placeholder="예: P-001" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">수량 <span class="required">*</span></label>
                <input class="form-input" type="number" id="f-quantity" value="${item.quantity ?? ''}" placeholder="0" />
              </div>
              <div class="form-group">
                <label class="form-label">단위</label>
                <input class="form-input" id="f-unit" value="${item.unit || ''}" placeholder="EA, BOX, KG ..." />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">매입가(원가)</label>
                <input class="form-input" type="number" id="f-unitPrice" value="${item.unitPrice ?? ''}" placeholder="0" />
              </div>
              <div class="form-group">
                <label class="form-label">판매단가</label>
                <input class="form-input" type="number" id="f-salePrice" value="${item.salePrice ?? ''}" placeholder="미입력 시 손익 정확도가 내려갑니다." />
              </div>
            </div>

            <details class="smart-details" open>
              <summary>추가 정보 더 보기</summary>
              <div class="smart-details-body">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">분류</label>
                    <input class="form-input" id="f-category" value="${item.category || ''}" placeholder="예: 사무용품" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">거래처</label>
                    <input class="form-input" id="f-vendor" value="${item.vendor || ''}" placeholder="예: (주)신성상사" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">창고/위치</label>
                    <input class="form-input" id="f-warehouse" value="${item.warehouse || ''}" placeholder="예: 본사 1층 A-03" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">비고</label>
                    <input class="form-input" id="f-note" value="${item.note || ''}" placeholder="메모" />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div class="form-shell-side">
            <div class="form-card">
              <div class="form-card-title">입력 진행 상태</div>
              <div class="form-card-desc">필수값만 채워도 저장됩니다. 판매가, 거래처, 위치는 보강 추천 항목입니다.</div>
              <div class="form-status-list" id="item-status-list"></div>
            </div>
            <div class="smart-summary-grid">
              <div class="smart-summary-item">
                <div class="smart-summary-label">현재 재고 가치</div>
                <div class="smart-summary-value" id="f-totalPriceLabel">₩0</div>
                <div class="smart-summary-note" id="item-price-note">수량과 원가를 입력하면 공급가액, 부가세, 합계가 자동 계산됩니다.</div>
                <input type="hidden" id="f-supplyValue" value="${item.supplyValue ?? ''}" />
                <input type="hidden" id="f-vat" value="${item.vat ?? ''}" />
                <input type="hidden" id="f-totalPrice" value="${item.totalPrice ?? ''}" />
              </div>
              <div class="smart-summary-item">
                <div class="smart-summary-label">예상 판매 기준 차익</div>
                <div class="smart-summary-value" id="f-marginLabel">미입력</div>
                <div class="smart-summary-note" id="item-margin-note">판매가를 넣으면 원가 대비 차익을 바로 볼 수 있습니다.</div>
              </div>
              <div class="smart-summary-item">
                <div class="smart-summary-label">데이터 품질</div>
                <div class="smart-summary-value" id="item-quality-label">기본 입력 전</div>
                <div class="smart-summary-note" id="item-quality-note">거래처와 위치 정보가 있으면 발주와 보고가 훨씬 쉬워집니다.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="modal-cancel">취소</button>
        <button class="btn btn-primary" id="modal-save">${isEdit ? '수정 저장' : '품목 저장'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const inputs = {
    name: overlay.querySelector('#f-itemName'),
    code: overlay.querySelector('#f-itemCode'),
    quantity: overlay.querySelector('#f-quantity'),
    unit: overlay.querySelector('#f-unit'),
    unitPrice: overlay.querySelector('#f-unitPrice'),
    salePrice: overlay.querySelector('#f-salePrice'),
    category: overlay.querySelector('#f-category'),
    vendor: overlay.querySelector('#f-vendor'),
    warehouse: overlay.querySelector('#f-warehouse'),
    note: overlay.querySelector('#f-note'),
  };

  const formatMoney = (value) => `₩${Math.round(value || 0).toLocaleString('ko-KR')}`;

  const refreshItemSummary = () => {
    const qty = parseFloat(inputs.quantity.value) || 0;
    const unitPrice = parseFloat(inputs.unitPrice.value) || 0;
    const salePrice = parseFloat(inputs.salePrice.value) || 0;
    const supply = qty * unitPrice;
    const vat = Math.floor(supply * 0.1);
    const total = supply + vat;

    overlay.querySelector('#f-supplyValue').value = supply;
    overlay.querySelector('#f-vat').value = vat;
    overlay.querySelector('#f-totalPrice').value = total;
    overlay.querySelector('#f-totalPriceLabel').textContent = total > 0 ? formatMoney(total) : '₩0';
    overlay.querySelector('#item-price-note').textContent =
      total > 0
        ? `공급가액 ${formatMoney(supply)} / 부가세 ${formatMoney(vat)} / 합계 ${formatMoney(total)}`
        : '수량과 원가를 입력하면 공급가액, 부가세, 합계가 자동 계산됩니다.';

    const marginPerUnit = salePrice > 0 ? salePrice - unitPrice : null;
    overlay.querySelector('#f-marginLabel').textContent =
      marginPerUnit === null ? '미입력' : `${marginPerUnit >= 0 ? '+' : '-'}${formatMoney(Math.abs(marginPerUnit))}`;
    overlay.querySelector('#item-margin-note').textContent =
      marginPerUnit === null
        ? '판매가를 넣으면 원가 대비 차익을 바로 볼 수 있습니다.'
        : `판매단가 기준 예상 차익은 개당 ${marginPerUnit >= 0 ? '+' : '-'}${formatMoney(Math.abs(marginPerUnit))}입니다.`;

    const statusItems = [
      { done: !!inputs.name.value.trim(), text: '품목명이 입력되었습니다.' },
      { done: inputs.quantity.value !== '', text: '수량이 입력되었습니다.' },
      { done: unitPrice > 0, text: '원가가 입력되었습니다.' },
      { done: salePrice > 0, text: '판매가가 입력되었습니다.' },
      { done: !!inputs.vendor.value.trim(), text: '거래처가 연결되었습니다.' },
      { done: !!inputs.warehouse.value.trim(), text: '창고/위치가 입력되었습니다.' },
    ];
    overlay.querySelector('#item-status-list').innerHTML = statusItems.map(entry => `
      <div class="form-status-item ${entry.done ? 'is-complete' : ''}">${entry.text}</div>
    `).join('');

    const completedQuality = statusItems.filter(entry => entry.done).length;
    overlay.querySelector('#item-quality-label').textContent = `${completedQuality}/6 단계 완료`;
    overlay.querySelector('#item-quality-note').textContent =
      completedQuality >= 5
        ? '보고와 발주에 필요한 정보가 대부분 잘 채워져 있습니다.'
        : '거래처, 위치, 판매가를 채우면 보고와 원가 분석 품질이 더 좋아집니다.';
  };

  Object.values(inputs).forEach(input => {
    input?.addEventListener('input', refreshItemSummary);
  });
  refreshItemSummary();

  overlay.querySelector('#modal-save').addEventListener('click', () => {
    const name = inputs.name.value.trim();
    const qty = inputs.quantity.value;

    if (!name) {
      showToast('품목명은 필수입니다.', 'warning');
      inputs.name.focus();
      return;
    }

    const newItem = {
      itemName: name,
      itemCode: inputs.code.value.trim(),
      category: inputs.category.value.trim(),
      vendor: inputs.vendor.value.trim(),
      quantity: qty === '' ? 0 : parseFloat(qty),
      unit: inputs.unit.value.trim(),
      unitPrice: parseFloat(inputs.unitPrice.value) || 0,
      salePrice: parseFloat(inputs.salePrice.value) || 0,
      warehouse: inputs.warehouse.value.trim(),
      note: inputs.note.value.trim(),
    };
    newItem.supplyValue = newItem.quantity * newItem.unitPrice;
    newItem.vat = Math.floor(newItem.supplyValue * 0.1);
    newItem.totalPrice = newItem.supplyValue + newItem.vat;

    if (isEdit) {
      updateItem(editIdx, newItem);
      showToast(`"${name}" 품목을 수정했습니다.`, 'success');
    } else {
      addItem(newItem);
      showToast(`"${name}" 품목을 추가했습니다.`, 'success');
    }

    close();
    renderInventoryPage(container, navigateTo);
  });

  setTimeout(() => overlay.querySelector('#f-itemName').focus(), 100);
}

// === ?좏떥 ===

function formatCell(key, value) {
  if (value === '' || value === null || value === undefined) return '';
  if (['quantity', 'unitPrice', 'salePrice', 'supplyValue', 'vat', 'totalPrice'].includes(key)) {
    const valStr = typeof value === 'string' ? value.replace(/,/g, '') : value;
    const num = parseFloat(valStr);
    if (!isNaN(num)) {
      // ??Math.round? ???먮떒??諛섏삱由?(?쒓뎅 ?먰솕???뚯닔???놁쓬)
      if (key === 'unitPrice' || key === 'salePrice' || key === 'supplyValue' || key === 'vat' || key === 'totalPrice') {
        return '₩' + Math.round(num).toLocaleString('ko-KR');
      }
      return Math.round(num).toLocaleString('ko-KR');
    }
  }
  return String(value);
}

function calcTotalQty(data) {
  return Math.round(data.reduce((s, r) => {
    const v = typeof r.quantity === 'string' ? r.quantity.replace(/,/g, '') : r.quantity;
    return s + (parseFloat(v) || 0);
  }, 0)).toLocaleString('ko-KR');
}

function calcTotalPrice(data) {
  const total = Math.round(data.reduce((s, r) => {
    const v = typeof r.totalPrice === 'string' ? r.totalPrice.replace(/,/g, '') : r.totalPrice;
    return s + (parseFloat(v) || 0);
  }, 0));
  return total > 0 ? '₩' + total.toLocaleString('ko-KR') : '-';
}

function calcTotalSupply(data) {
  const total = Math.round(data.reduce((s, r) => {
    const v = typeof r.supplyValue === 'string' ? r.supplyValue.replace(/,/g, '') : r.supplyValue;
    return s + (parseFloat(v) || 0);
  }, 0));
  return total > 0 ? '₩' + total.toLocaleString('ko-KR') : '-';
}

function calcTotalVat(data) {
  const total = Math.round(data.reduce((s, r) => {
    const v = typeof r.vat === 'string' ? r.vat.replace(/,/g, '') : r.vat;
    return s + (parseFloat(v) || 0);
  }, 0));
  return total > 0 ? '₩' + total.toLocaleString('ko-KR') : '-';
}

function getCategories(data) {
  return [...new Set(data.map(r => r.category).filter(Boolean))].sort();
}

function getWarehouses(data) {
  return [...new Set(data.map(r => r.warehouse).filter(Boolean))].sort();
}

/**
 * ?덈ぉ肄붾뱶 紐⑸줉 異붿텧
 * ??蹂꾨룄 ?⑥닔? ???쒕∼?ㅼ슫 ?꾪꽣?먯꽌 ?뱀젙 ?덈ぉ肄붾뱶濡?鍮좊Ⅴ寃?議고쉶?섍린 ?꾪븿
 */
function getItemCodes(data) {
  return [...new Set(data.map(r => r.itemCode).filter(Boolean))].sort();
}

/**
 * 嫄곕옒泥?紐⑸줉 異붿텧
 * ??蹂꾨룄 ?⑥닔? ??嫄곕옒泥섎퀎 ?꾪꽣濡??뱀젙 ?낆껜???덈ぉ留?蹂????덇쾶 ?섍린 ?꾪븿
 */
function getVendors(data) {
  return [...new Set(data.map(r => r.vendor).filter(Boolean))].sort();
}

