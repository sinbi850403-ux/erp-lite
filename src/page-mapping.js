import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { indexToCol } from './excel.js';

const ERP_FIELDS = [
  { key: 'itemName', label: '품목명', required: true },
  { key: 'itemCode', label: '품목코드', required: false },
  { key: 'category', label: '분류', required: false },
  { key: 'vendor', label: '거래처', required: false },
  { key: 'quantity', label: '수량', required: true },
  { key: 'unit', label: '단위', required: false },
  { key: 'unitPrice', label: '매입가(원가)', required: false },
  { key: 'salePrice', label: '판매가(소가)', required: false },
  { key: 'supplyValue', label: '공급가액', required: false },
  { key: 'vat', label: '부가세', required: false },
  { key: 'totalPrice', label: '합계금액', required: false },
  { key: 'warehouse', label: '창고/위치', required: false },
  { key: 'expiryDate', label: '유통기한', required: false },
  { key: 'lotNumber', label: 'LOT번호', required: false },
  { key: 'note', label: '비고', required: false },
  { key: 'safetyStock', label: '안전재고', required: false },
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
  supplyValue: ['공급가액', '공급가'],
  vat: ['부가세', '세액', 'vat', 'tax'],
  totalPrice: ['합계금액', '총금액', '합계', 'total', '총액'],
  warehouse: ['창고', '위치', 'warehouse', 'location', '보관', '저장위치'],
  expiryDate: ['유통기한', '유효기한', '만료일', 'expiry', 'exp'],
  lotNumber: ['lot', 'lot번호', '로트', '로트번호', 'batch'],
  note: ['비고', 'note', 'memo', '메모', '참고', '특이사항'],
  safetyStock: ['안전재고', '최소재고', '최소수량', 'safetystock'],
};

export function renderMappingPage(container, navigateTo) {
  const state = getState();

  if (!state.rawData || state.rawData.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><span class="title-icon">📋</span> 데이터 확인</h1>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">📥</div>
          <div class="msg">먼저 파일을 업로드해 주세요.</div>
          <div class="sub">파일을 읽어 온 뒤 이 화면에서 컬럼 매핑을 검토할 수 있습니다.</div>
          <br />
          <button class="btn btn-primary" id="btn-go-upload">파일 업로드로 이동</button>
        </div>
      </div>
    `;
    container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
    return;
  }

  const headers = state.rawData[0] || [];
  const dataRows = state.rawData.slice(1);
  const originalMapping = state.columnMapping || {};
  const mapping = fillAutoMapping(headers, originalMapping);
  if (JSON.stringify(mapping) !== JSON.stringify(originalMapping)) {
    setState({ columnMapping: mapping });
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📋</span> 데이터 확인</h1>
        <div class="page-desc">업로드한 컬럼과 시스템 필드 연결 상태를 검토합니다.</div>
      </div>
    </div>

    <div class="steps">
      <div class="step done"><span class="step-num">1</span> 파일 업로드</div>
      <div class="step active"><span class="step-num">2</span> 컬럼 매핑</div>
      <div class="step"><span class="step-num">3</span> 확인 완료</div>
    </div>

    <div class="alert alert-info">
      📎 <strong>${state.fileName}</strong> | ${dataRows.length}건 데이터
      ${state.sheetNames.length > 1 ? `
        | 시트:
        <select id="sheet-select" class="filter-select" style="margin-left:4px;">
          ${state.sheetNames.map((sheetName) => `
            <option value="${sheetName}" ${sheetName === state.activeSheet ? 'selected' : ''}>${sheetName}</option>
          `).join('')}
        </select>
      ` : ''}
    </div>

    <div class="card">
      <div class="card-title">컬럼 연결 <span class="card-subtitle">비슷한 이름은 자동으로 먼저 연결합니다.</span></div>
      <div id="mapping-list">
        ${ERP_FIELDS.map((field) => renderMappingRow(field, headers, mapping)).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">데이터 미리보기 <span class="card-subtitle">처음 10건</span></div>
      <div class="table-wrapper">
        <table class="data-table" id="preview-table">
          <thead>
            <tr>
              <th style="width:36px;">#</th>
              ${headers.map((header, index) => `
                <th title="원본 ${indexToCol(index)}열">${header || `(${indexToCol(index)}열)`}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${dataRows.slice(0, 10).map((row, rowIndex) => `
              <tr>
                <td class="col-num">${rowIndex + 1}</td>
                ${headers.map((_, cellIndex) => `<td>${row[cellIndex] ?? ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
      <button class="btn btn-outline" id="btn-back">다시 업로드</button>
      <button class="btn btn-success btn-lg" id="btn-confirm">매핑 확인 완료</button>
    </div>
  `;

  container.querySelector('#sheet-select')?.addEventListener('change', (event) => {
    const nextSheet = event.target.value;
    const allSheets = state.allSheets || {};
    setState({ activeSheet: nextSheet, rawData: allSheets[nextSheet] || [], columnMapping: {} });
    renderMappingPage(container, navigateTo);
    showToast(`"${nextSheet}" 시트로 전환했습니다.`, 'info');
  });

  container.querySelectorAll('.mapping-select').forEach((select) => {
    select.addEventListener('change', () => {
      const fieldKey = select.dataset.field;
      const nextMapping = { ...getState().columnMapping };
      if (select.value === '') delete nextMapping[fieldKey];
      else nextMapping[fieldKey] = parseInt(select.value, 10);
      setState({ columnMapping: nextMapping });
      updatePreviewHighlight(container, nextMapping);
    });
  });

  container.querySelector('#btn-back')?.addEventListener('click', () => navigateTo('upload'));

  container.querySelector('#btn-confirm')?.addEventListener('click', () => {
    const currentMapping = getState().columnMapping || {};
    const missing = ERP_FIELDS
      .filter((field) => field.required && currentMapping[field.key] === undefined)
      .map((field) => field.label);

    if (missing.length > 0) {
      showToast(`필수 항목이 비어 있습니다: ${missing.join(', ')}`, 'warning');
      return;
    }

    const mappedData = buildMappedData(dataRows, currentMapping);
    const uploadSafetyStock = { ...getState().safetyStock };

    mappedData.forEach((row) => {
      if (row.safetyStock === '' || row.safetyStock === undefined || row.safetyStock === null) return;
      const value = parseFloat(row.safetyStock);
      if (!Number.isNaN(value)) uploadSafetyStock[row.itemName] = value;
    });

    setState({ mappedData, currentStep: 3, safetyStock: uploadSafetyStock });
    showToast(`${mappedData.length}건 매핑을 적용했습니다.`, 'success');
    navigateTo('inventory');
  });

  updatePreviewHighlight(container, mapping);
}

function renderMappingRow(field, headers, mapping) {
  const selectedIndex = mapping[field.key];
  const preview = selectedIndex !== undefined ? (getState().rawData?.[1]?.[selectedIndex] ?? '-') : '';

  return `
    <div class="mapping-row">
      <span class="mapping-label">
        ${field.label}${field.required ? ' <span style="color:var(--danger);">*</span>' : ''}
      </span>
      <select class="mapping-select" data-field="${field.key}">
        <option value="">-- 선택 안 함 --</option>
        ${headers.map((header, index) => `
          <option value="${index}" ${selectedIndex === index ? 'selected' : ''}>
            ${indexToCol(index)}: ${header || '(빈 헤더)'}
          </option>
        `).join('')}
      </select>
      <span class="mapping-preview" title="${preview}">${preview ? `예: ${preview}` : ''}</span>
    </div>
  `;
}

function fillAutoMapping(headers, existingMapping) {
  const nextMapping = { ...existingMapping };
  const normalizedHeaders = headers.map((header) => String(header || '').toLowerCase().trim());
  const usedIndices = new Set(
    Object.values(existingMapping).filter((value) => Number.isInteger(value))
  );

  ERP_FIELDS.forEach((field) => {
    if (nextMapping[field.key] !== undefined) return;

    const keywords = MAPPING_KEYWORDS[field.key] || [];
    const matchIndex = normalizedHeaders.findIndex((header, index) => (
      !usedIndices.has(index) && keywords.some((keyword) => header.includes(keyword))
    ));

    if (matchIndex >= 0) {
      nextMapping[field.key] = matchIndex;
      usedIndices.add(matchIndex);
    }
  });

  return nextMapping;
}

function updatePreviewHighlight(container, mapping) {
  const table = container.querySelector('#preview-table');
  if (!table) return;

  const mappedColumns = new Set(Object.values(mapping));
  table.querySelectorAll('th, td').forEach((cell) => {
    cell.style.background = '';
  });

  table.querySelectorAll('tr').forEach((row) => {
    row.querySelectorAll('th, td').forEach((cell, index) => {
      if (index > 0 && mappedColumns.has(index - 1)) {
        cell.style.background = 'rgba(37,99,235,0.15)';
      }
    });
  });
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

      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const supplyValue = quantity * unitPrice;
      const vat = Math.floor(supplyValue * 0.1);

      item.supplyValue = supplyValue;
      item.vat = vat;
      item.totalPrice = supplyValue + vat;

      return item;
    });
}
