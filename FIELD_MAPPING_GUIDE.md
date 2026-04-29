# 입고(Intake) 필드 매핑 가이드 — 엑셀 → DB 완전 파이프라인

## 1. 사용자 요구사항 (최종 표준)

### 1.1 입고(Intake) 기록 — 14개 필드

| # | 한글명 | DB 컬럼명 | JS camelCase | 타입 | 설명 |
|----|--------|-----------|-------------|------|------|
| 1 | 순번 | id | id | UUID | 자동 생성 (crypto.randomUUID) |
| 2 | 자산 | category | category | TEXT | 부서/자산 분류 |
| 3 | 입고일자 | date | date | TEXT (YYYY-MM-DD) | 입고 날짜 |
| 4 | 거래처 | vendor | vendor | TEXT | 공급업체명 |
| 5 | 상품코드 | item_code | itemCode | TEXT | 제품 코드 |
| 6 | 상품명 | item_name | itemName | TEXT | 제품명 |
| 7 | 색상 | color | color | TEXT | 제품 색상 |
| 8 | 규격 | spec | spec | TEXT | 제품 규격 |
| 9 | 단위 | unit | unit | TEXT | 수량 단위 (EA, PCS 등) |
| 10 | 입고수량 | quantity | quantity | NUMERIC | 입고 수량 |
| 11 | 단가 | unit_price | unitPrice | NUMERIC | 제품 단가 (₩) |
| 12 | 공급가 | supply_value | supplyValue | NUMERIC | 계산됨: quantity × unitPrice |
| 13 | 부가세 | vat | vat | NUMERIC | 계산됨: ceil(supplyValue × 0.1) |
| 14 | 합계 | total_amount | totalAmount | NUMERIC | 계산됨: supplyValue + vat |

**추가 필드 (선택사항)**
- 비고 (note): 기타 메모
- 창고 (warehouse): 보관 위치 (기본값: "본사 창고")

### 1.2 출고(Outbound) 기록 — 14개 필드

| # | 한글명 | DB 컬럼명 | JS camelCase | 타입 | 설명 |
|----|--------|-----------|-------------|------|------|
| 1 | 순번 | id | id | UUID | 자동 생성 (crypto.randomUUID) |
| 2 | 자산 | category | category | TEXT | 부서/자산 분류 |
| 3 | 출고일자 | date | date | TEXT (YYYY-MM-DD) | 출고 날짜 |
| 4 | 거래처 | vendor | vendor | TEXT | 고객/판매처명 |
| 5 | 상품코드 | item_code | itemCode | TEXT | 제품 코드 |
| 6 | 상품명 | item_name | itemName | TEXT | 제품명 |
| 7 | 색상 | color | color | TEXT | 제품 색상 |
| 8 | 규격 | spec | spec | TEXT | 제품 규격 |
| 9 | 단위 | unit | unit | TEXT | 수량 단위 (EA, PCS 등) |
| 10 | 출고수량 | quantity | quantity | NUMERIC | 출고 수량 |
| 11 | 출고원가 | unit_price | unitPrice | NUMERIC | 제품 원가 (₩) |
| 12 | 공급가 | supply_value | supplyValue | NUMERIC | 계산됨: quantity × unitPrice |
| 13 | 부가세 | vat | vat | NUMERIC | 계산됨: ceil(supplyValue × 0.1) |
| 14 | 합계 | total_amount | totalAmount | NUMERIC | 계산됨: supplyValue + vat |

**추가 필드 (선택사항)**
- 비고 (note): 기타 메모
- 창고 (warehouse): 출고 창고 위치 (기본값: "본사 창고")

---

## 2. Excel 템플릿 헤더 (BulkUploadModal.jsx)

### 2.1 입고 양식
```
순번 | 자산 | 입고일자 | 거래처 | 상품코드 | 품명 | 색상 | 규격 | 단위 | 입고수량 | 단가 | 공급가 | 부가세 | 합계 | 비고
```

**정렬 규칙**
1. 순번: 사용자가 행 번호 입력 (선택사항, 파싱 시 무시됨)
2. 자산~합계: 필수/계산 필드 순서
3. 비고: 추가 정보

**샘플 데이터**
```
1 | 전자기기 | 2026-04-29 | (주)삼성전자 | SM-S925 | 갤럭시 S25 | 블랙 | 256GB | EA | 100 | 1200000 | 120000000 | 12000000 | 132000000 |
```

### 2.2 출고 양식
```
순번 | 자산 | 출고일자 | 거래처 | 상품코드 | 상품명 | 색상 | 규격 | 단위 | 출고수량 | 출고원가 | 공급가 | 부가세 | 합계 | 비고
```

**정렬 규칙**
1. 순번: 사용자가 행 번호 입력 (선택사항, 파싱 시 무시됨)
2. 자산~합계: 필수/계산 필드 순서
3. 비고: 추가 정보

**샘플 데이터**
```
1 | 전자기기 | 2026-04-29 | 강남점 | SM-S925 | 갤럭시 S25 | 블랙 | 256GB | EA | 10 | 1500000 | 15000000 | 1500000 | 16500000 |
```

---

## 3. 필드 검색 매핑 (inoutExcelParser.js → buildColMap)

Excel 헤더 → 컬럼 인덱스 매핑. **정확한 헤더명 필수**.

| 필드 | buildColMap 키 | 검색 대상 (우선순) | 입고 매칭 | 출고 매칭 |
|------|---------------|-----------------|---------|---------|
| type | type | '구분' | ❌ (modeDefault) | ❌ (modeDefault) |
| vendor | vendor | '거래처', '매장명' | ✅ '거래처' | ✅ '거래처' |
| itemName | itemName | '품명', '품목명' | ✅ '품명' | ✅ '상품명' |
| itemCode | itemCode | '상품코드', '품목코드' | ✅ '상품코드' | ✅ '상품코드' |
| quantity | quantity | '입고수량' (입고) / '출고수량' (출고), '수량' | ✅ '입고수량' | ✅ '출고수량' |
| unitPrice | unitPrice | '매입원가', **'출고원가'**, '매입가', '단가', '원가' | ✅ '단가' | ✅ '출고원가' |
| sellingPrice | sellingPrice | '판매가', '출고단가' | ❌ (미사용) | ❌ (미사용) |
| date | date | '입고일자' (입고) / '출고일자' (출고), '날짜' | ✅ '입고일자' | ✅ '출고일자' |
| warehouse | warehouse | '창고', '위치', '보관' | ❌ (기본값) | ❌ (기본값) |
| note | note | '비고' | ✅ '비고' | ✅ '비고' |
| spec | spec | '규격' | ✅ '규격' | ✅ '규격' |
| unit | unit | '단위' | ✅ '단위' | ✅ '단위' |
| color | color | '색상', '컬러', 'color' | ✅ '색상' | ✅ '색상' |
| category | category | '자산', '분류', '카테고리' | ✅ '자산' | ✅ '자산' |

**주의사항**:
- 입고: itemName 검색 '품명', unitPrice 검색 '단가'
- 출고: itemName 검색 '상품명', unitPrice 검색 '출고원가'

---

## 4. parseExcelRows 처리 로직 (inoutExcelParser.js)

```javascript
// 입력: 엑셀 행 배열 + colMap (컬럼 인덱스)
// 출력: camelCase 필드 객체 배열

const row = {
  type:         modeDefault === 'in' ? 'in' : 'out',  // 구분 컬럼 없으므로 modeDefault 사용
  vendor:       string,      // colMap.vendor >= 0 이면 시트의 해당 셀 값
  itemName:     string,      // 필수, 없으면 건너뜀
  itemCode:     string,      // 선택
  quantity:     number,      // 필수, 0 이하면 건너뜀
  unitPrice:    number,      // parseBulkNumber() 처리
  sellingPrice: number,      // 입고에선 0
  date:         YYYY-MM-DD,  // formatDateStr() 처리
  warehouse:    string,      // 기본값 ''
  note:         string,      // 선택
  spec:         string,      // 선택
  unit:         string,      // 선택
  color:        string,      // 선택
  category:     string,      // 선택
  matched:      boolean,     // 기존 상품과 매칭 여부
};
```

---

## 5. BulkUploadModal.jsx 처리 (자동 생성 + 계산)

### 5.1 거래처 자동 생성
```javascript
// previewRows의 모든 vendor 추출 → DB에서 조회 → 없으면 생성
const vendorNames = new Set(previewRows.map(r => r.vendor).filter(Boolean));
for (const vname of vendorNames) {
  if (!vendorMap.has(vname)) {
    const newVendor = await db.vendors.create({ name: vname });
    vendorMap.set(vname, newVendor.id);
  }
}
```

### 5.2 상품 자동 생성
```javascript
// previewRows의 모든 itemName 추출 → DB에서 조회 → 없으면 생성
const itemNames = new Set(previewRows.map(r => r.itemName).filter(Boolean));
for (const iname of itemNames) {
  if (!itemMap.has(iname)) {
    try {
      const newItem = await db.items.create({
        itemName: iname,
        category: '',
        unit: 'EA',
      });
      if (newItem?.id) itemMap.set(iname, newItem.id);
    } catch (err) {
      if (err.message?.includes('duplicate')) {
        // 중복 무시, 기존 항목 사용
        console.warn(`[BulkUploadModal] 상품 중복: ${iname}`);
      } else {
        throw err;
      }
    }
  }
}
```

### 5.3 거래처/상품 ID 매핑 및 금액 계산
```javascript
const txsToSave = previewRows.map(r => {
  const qty = parseFloat(r.quantity) || 0;
  const unitPrice = parseFloat(r.unitPrice) || 0;
  const sellingPrice = parseFloat(r.sellingPrice) || 0;
  const supplyValue = Math.round(unitPrice * qty);  // 단가 × 수량
  const vat = Math.ceil(supplyValue * 0.1);          // 공급가의 10%
  return {
    id: crypto.randomUUID(),  // 순번 (자동생성)
    type: r.type,             // in
    vendor: r.vendor,         // 거래처명 (TEXT)
    vendor_id: vendorMap.get(r.vendor),  // 거래처 ID (UUID FK) - 추후 활성화
    itemName: r.itemName,     // 상품명
    item_id: itemMap.get(r.itemName),    // 상품 ID (UUID FK) - 추후 활성화
    itemCode: r.itemCode,     // 상품코드
    quantity: qty,            // 입고수량
    unitPrice,                // 단가
    sellingPrice,             // 판매가
    supplyValue,              // 공급가 (계산)
    vat,                      // 부가세 (계산)
    totalAmount: supplyValue + vat,  // 합계 (계산)
    date: r.date,             // 입고일자
    warehouse: r.warehouse || '본사 창고',
    spec: r.spec,
    unit: r.unit,
    color: r.color,
    category: r.category,
    note: r.note,
  };
});
```

---

## 6. DB 저장 (db/transactions.js → Supabase)

### camelCase → snake_case 변환
```javascript
async bulkCreate(txArray) {
  const userId = await getUserId();
  const rows = txArray.map(tx => ({
    id: tx.id,                      // UUID → id
    user_id: userId,
    type: tx.type,                  // in
    item_name: tx.itemName,         // camelCase → snake_case
    item_code: tx.itemCode,
    quantity: tx.quantity,
    unit_price: tx.unitPrice,       // ⚠️ unitPrice → unit_price
    supply_value: tx.supplyValue,   // ⚠️ supplyValue → supply_value
    vat: tx.vat,
    total_amount: tx.totalAmount,   // ⚠️ totalAmount → total_amount
    selling_price: tx.sellingPrice,
    actual_selling_price: tx.actualSellingPrice,
    spec: tx.spec,
    unit: tx.unit,
    category: tx.category,
    color: tx.color,
    date: tx.date,
    vendor: tx.vendor,              // TEXT (아직 FK 아님)
    warehouse: tx.warehouse,
    note: tx.note,
  }));
  
  // upsert: 같은 id면 UPDATE, 없으면 INSERT
  const { data, error } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'id' })
    .select();
  handleError(error, '입출고 일괄 등록');
  return data || [];
}
```

---

## 7. 전체 파이프라인 요약

```
Excel 파일 (입고_양식.xlsx)
↓
readExcelFile() → sheetData (2D 배열)
↓
buildColMap(headers) → { vendor: 3, itemName: 5, ... }
↓
parseExcelRows(sheetData, colMap) → camelCase 행 배열
  └─ 값 정제: parseBulkNumber(), formatDateStr()
  └─ 기존 상품 매칭 여부 확인
↓
BulkUploadModal.jsx handleConfirm()
├─ 거래처 자동 생성: db.vendors.create()
├─ 상품 자동 생성: db.items.create()
├─ 금액 계산: supplyValue, vat, totalAmount
├─ UUID 생성: crypto.randomUUID()
└─ DB 저장: db.transactions.bulkCreate()
  └─ camelCase → snake_case 변환
  └─ Supabase upsert()
↓
DB 반영 ✅
```

---

## 8. 흔한 오류 및 해결책

| 오류 | 원인 | 해결책 |
|------|------|--------|
| "품명 또는 상품코드 컬럼을 찾을 수 없습니다" | 엑셀 헤더가 '품목명', '상품명' 등으로 다름 | 정확히 '품명' 사용 |
| "수량 컬럼을 찾을 수 없습니다" | 입고/출고 수량 컬럼 헤더 오류 | '입고수량' (입고 모드) / '출고수량' (출고 모드) |
| "duplicate key value violates unique constraint" | Excel에 같은 상품명이 여러 번 | 자동 생성 시 첫 번째만 생성, 나머지 무시 (정상) |
| 거래처/상품이 엑셀에는 있는데 DB에 안 보임 | Realtime Sync 비활성화 중 | 페이지 새로고침 또는 대시보드 수동 갱신 |

---

## 9. 검증 체크리스트

입고 일괄 등록 기능을 테스트할 때:

- [ ] Excel 템플릿 다운로드 가능
- [ ] 템플릿 헤더가 정확함 (순번, 자산, 입고일자, ...)
- [ ] 데이터 입력 후 업로드 → 미리보기 표시
- [ ] 미리보기에서 거래처, 상품명, 수량, 단가 확인
- [ ] "합계 {N}건 등록" 버튼 클릭
- [ ] 거래처 자동 생성 성공 (신규 거래처)
- [ ] 상품 자동 생성 성공 (신규 상품)
- [ ] DB 저장 성공 (에러 토스트 없음)
- [ ] 페이지 새로고침 후 거래처/상품/거래 내역 확인
- [ ] 수불대장에서 거래 내용 조회 가능 (거래처, 단가, 금액)

---

## 10. 향후 개선 (FK 정규화)

현재: `vendor` = TEXT (거래처명)  
향후: `vendor_id` = UUID FK → vendors 테이블

```sql
-- 마이그레이션 추가 필요
ALTER TABLE transactions
  ADD COLUMN vendor_id UUID REFERENCES vendors(id),
  ADD COLUMN item_id UUID REFERENCES items(id);

-- 기존 데이터 마이그레이션
UPDATE transactions t
  SET vendor_id = v.id
  FROM vendors v
  WHERE t.vendor = v.name AND t.user_id = v.user_id;
```

이후 BulkUploadModal.jsx에서 `vendor_id` 필드도 저장하면 정규화 완성.

---

**작성일**: 2026-04-29  
**상태**: 입고 파이프라인 검증 완료 ✅
