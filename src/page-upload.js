import { readExcelFile } from './excel.js';
import { setState, resetState, getState } from './store.js';
import { showToast } from './toast.js';
import { downloadTemplate, getTemplateList } from './excel-templates.js';

const ERP_FIELDS = [
  { key: 'itemName', label: '품목명' },
  { key: 'itemCode', label: '품목코드' },
  { key: 'category', label: '분류' },
  { key: 'vendor', label: '거래처' },
  { key: 'quantity', label: '수량' },
  { key: 'unit', label: '단위' },
  { key: 'unitPrice', label: '매입가(원가)' },
  { key: 'salePrice', label: '판매가(소가)' },
  { key: 'supplyValue', label: '공급가액' },
  { key: 'vat', label: '부가세' },
  { key: 'totalPrice', label: '합계금액' },
  { key: 'warehouse', label: '창고/위치' },
  { key: 'expiryDate', label: '유통기한' },
  { key: 'lotNumber', label: 'LOT번호' },
  { key: 'note', label: '비고' },
  { key: 'safetyStock', label: '안전재고' },
];

const MAPPING_KEYWORDS = {
  itemName: ['품목명', '품목', '품명', '제품명', '상품명', '이름', 'name', 'item', '자재명', '자재'],
  itemCode: ['품목코드', '코드', 'code', '번호', 'sku', '자재코드'],
  category: ['분류', '카테고리', 'category', '유형', '종류', '구분'],
  vendor: ['거래처', '업체', '업체명', '공급업체', '공급처', '매입처', 'vendor', 'supplier'],
  quantity: ['수량', 'qty', 'quantity', '재고', '개수', '입고수량', '출고수량', '현재고'],
  unit: ['단위', 'unit', 'uom'],
  unitPrice: ['매입가', '원가', '단가', '매입단가', '입고단가', '입고가', '사입가', '도매가', 'cost', 'buyprice', 'purchaseprice'],
  salePrice: ['소가', '판매가', '판매단가', '소비자가', '소매가', '출고단가', '출고가', '매출단가', 'sale', 'selling'],
  supplyValue: ['공급가액', '공급가', '금액'],
  vat: ['부가세', '세액', 'vat', 'tax'],
  totalPrice: ['합계금액', '총금액', '합계', 'total', '총액'],
  warehouse: ['창고', '위치', 'warehouse', 'location', '보관', '저장위치'],
  expiryDate: ['유통기한', '유효기한', '만료일', 'expiry', 'exp'],
  lotNumber: ['lot', 'lot번호', '로트', '로트번호', 'batch'],
  note: ['비고', 'note', 'memo', '메모', '참고', '특이사항'],
  safetyStock: ['안전재고', '최소재고', '최소수량', 'safetystock'],
};

export function renderUploadPage(container, navigateTo) {
  const state = getState();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📥</span> 파일 업로드</h1>
        <div class="page-desc">엑셀/CSV 파일을 읽고 자동 매핑한 뒤 바로 재고 데이터로 반영합니다.</div>
      </div>
    </div>

    <div class="steps">
      <div class="step active"><span class="step-num">1</span> 파일 업로드</div>
      <div class="step"><span class="step-num">2</span> 자동 매핑</div>
      <div class="step"><span class="step-num">3</span> 재고 확인</div>
    </div>

    <div class="card">
      <div id="upload-zone" class="upload-zone">
        <div class="icon">📄</div>
        <div class="label">파일을 끌어놓거나 클릭해서 업로드하세요.</div>
        <div class="hint">.xlsx, .xls, .csv 파일을 지원하며 업로드 즉시 자동 매핑합니다.</div>
        <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none" />
      </div>
    </div>

    <div class="card" style="margin-top:24px;">
      <h3 style="font-size:16px; font-weight:700; margin-bottom:4px;">📋 업종별 템플릿 다운로드</h3>
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
        입력 양식이 필요하면 템플릿을 내려받아 바로 사용할 수 있습니다.
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
        ${getTemplateList().map((template) => `
          <button class="template-card" data-template="${template.key}" title="${template.desc}">
            <div style="font-size:14px; font-weight:600; margin-bottom:2px;">${template.name}</div>
            <div style="font-size:11px; color:var(--text-muted);">${template.desc}</div>
            <div style="font-size:11px; color:var(--accent); margin-top:6px;">다운로드</div>
          </button>
        `).join('')}
      </div>
    </div>

    ${state.fileName ? `
      <div class="alert alert-info" style="margin-top:16px;">
        📎 현재 불러온 파일: <strong>${state.fileName}</strong>
        (${(state.mappedData || []).length}건 반영)
        <button class="btn btn-outline btn-sm" id="btn-clear" style="margin-left:12px;">다른 파일로 교체</button>
        <button class="btn btn-primary btn-sm" id="btn-go-inv" style="margin-left:4px;">재고 현황 보기</button>
      </div>
    ` : ''}
  `;

  const uploadZone = container.querySelector('#upload-zone');
  const fileInput = container.querySelector('#file-input');

  uploadZone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file, navigateTo);
  });

  uploadZone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone?.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone?.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file, navigateTo);
  });

  container.querySelector('#btn-clear')?.addEventListener('click', () => {
    resetState();
    renderUploadPage(container, navigateTo);
    showToast('이전 업로드 데이터를 초기화했습니다.', 'info');
  });

  container.querySelector('#btn-go-inv')?.addEventListener('click', () => {
    navigateTo('inventory');
  });

  container.querySelectorAll('.template-card').forEach((button) => {
    button.addEventListener('click', () => {
      downloadTemplate(button.dataset.template);
      showToast('템플릿을 다운로드했습니다.', 'success');
    });
  });
}

async function handleFile(file, navigateTo) {
  const extension = `.${file.name.split('.').pop().toLowerCase()}`;
  if (!['.xlsx', '.xls', '.csv'].includes(extension)) {
    showToast('지원하지 않는 파일 형식입니다.', 'error');
    return;
  }

  try {
    showToast('파일을 읽는 중입니다...', 'info', 1500);
    const result = await readExcelFile(file);
    const activeSheet = result.sheetNames[0];
    const rawData = result.sheets[activeSheet];

    if (!rawData || rawData.length < 2) {
      showToast('헤더만 있거나 데이터가 비어 있습니다.', 'warning');
      return;
    }

    const headers = rawData[0];
    const dataRows = rawData.slice(1);
    const mapping = autoMap(headers);
    const mappedData = buildMappedData(dataRows, mapping);
    const mappedCount = Object.keys(mapping).length;

    const previousMappedData = (getState().mappedData || []).slice();
    const uploadDiff = buildUploadDiff(previousMappedData, mappedData, file.name);
    const uploadSafetyStock = { ...getState().safetyStock };

    mappedData.forEach((row) => {
      if (row.safetyStock === '' || row.safetyStock === undefined || row.safetyStock === null) return;
      const value = parseFloat(row.safetyStock);
      if (!Number.isNaN(value)) uploadSafetyStock[row.itemName] = value;
    });

    resetState();
    setState({
      rawData,
      sheetNames: result.sheetNames,
      activeSheet,
      fileName: file.name,
      currentStep: 3,
      allSheets: result.sheets,
      columnMapping: mapping,
      mappedData,
      safetyStock: uploadSafetyStock,
      lastUploadDiff: uploadDiff,
    });

    showToast(`"${file.name}" 반영 완료 (${mappedData.length}건, 자동 매핑 ${mappedCount}개)`, 'success');
    navigateTo('inventory');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function buildUploadDiff(previousRows, nextRows, fileName = '') {
  const previousMap = new Map();
  previousRows.forEach((row, index) => {
    previousMap.set(getUploadRowKey(row, index), row);
  });

  const touched = new Set();
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  nextRows.forEach((row, index) => {
    const key = getUploadRowKey(row, index);
    const previous = previousMap.get(key);
    if (!previous) {
      added += 1;
      return;
    }

    touched.add(key);
    if (isUploadRowChanged(previous, row)) updated += 1;
    else unchanged += 1;
  });

  return {
    fileName,
    added,
    updated,
    unchanged,
    removed: Math.max(0, previousRows.length - touched.size),
    at: new Date().toISOString(),
  };
}

function getUploadRowKey(row, index) {
  const code = String(row?.itemCode || '').trim();
  const name = String(row?.itemName || '').trim();
  if (code) return `code:${code}`;
  if (name) return `name:${name}`;
  return `row:${index}`;
}

function isUploadRowChanged(previousRow, nextRow) {
  const compareKeys = [
    'itemName',
    'itemCode',
    'category',
    'vendor',
    'quantity',
    'unit',
    'unitPrice',
    'salePrice',
    'supplyValue',
    'vat',
    'totalPrice',
    'warehouse',
    'expiryDate',
    'lotNumber',
    'note',
    'safetyStock',
  ];

  return compareKeys.some((key) =>
    String(previousRow?.[key] ?? '').trim() !== String(nextRow?.[key] ?? '').trim()
  );
}

function autoMap(headers) {
  const normalizedHeaders = headers.map((header) => String(header || '').toLowerCase().trim());
  const mapping = {};
  const usedIndices = new Set();

  ERP_FIELDS.forEach((field) => {
    const keywords = MAPPING_KEYWORDS[field.key] || [];
    const matchIndex = normalizedHeaders.findIndex((header, index) => (
      !usedIndices.has(index) && keywords.some((keyword) => header.includes(keyword))
    ));

    if (matchIndex >= 0) {
      mapping[field.key] = matchIndex;
      usedIndices.add(matchIndex);
    }
  });

  return mapping;
}

function buildMappedData(dataRows, mapping) {
  return dataRows
    .filter((row) => row.some((cell) => cell !== '' && cell != null))
    .map((row) => {
      const item = {};

      ERP_FIELDS.forEach((field) => {
        const columnIndex = mapping[field.key];
        let value = columnIndex !== undefined ? (row[columnIndex] ?? '') : '';

        if (['quantity', 'unitPrice', 'salePrice', 'supplyValue', 'vat', 'totalPrice', 'safetyStock'].includes(field.key)) {
          if (typeof value === 'string') {
            const cleaned = value.replace(/,/g, '').trim();
            if (cleaned !== '' && !Number.isNaN(Number(cleaned))) {
              value = parseFloat(cleaned);
            }
          }
        }

        item[field.key] = value;
      });

      return item;
    });
}
