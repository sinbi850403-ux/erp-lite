# INVEX ERP-Lite -- 재고관리 DB 재설계 입력 명세

## 도메인
중소기업 맞춤 재고 경영 관리 SaaS (INVEX ERP-Lite)
재고 관련 핵심 모듈: 품목 마스터, 입출고, 창고이동, 재고실사, 수불대장

## DBMS
Supabase PostgreSQL (RLS 필수 -- 모든 테이블 auth.uid() = user_id)

---

## 현재 스키마 (문제 있는 현재 상태)

### items (품목 마스터)
- id UUID PK, user_id UUID FK(profiles)
- item_name TEXT NOT NULL, item_code TEXT
- quantity NUMERIC DEFAULT 0  -- 문제: sync 실패시 0으로 저장됨
- unit_price NUMERIC, sale_price NUMERIC
- supply_value NUMERIC, vat NUMERIC
- category TEXT, spec TEXT, unit TEXT, warehouse TEXT, color TEXT, note TEXT
- UNIQUE(user_id, item_name)

### transactions (입출고 이력)
- id UUID PK, user_id UUID FK(profiles)
- type TEXT CHECK(in/out/loss/adjust)
- item_name TEXT NOT NULL  -- 문제: FK없는 텍스트 참조
- item_code TEXT, quantity NUMERIC
- unit_price NUMERIC, selling_price NUMERIC, actual_selling_price NUMERIC
- supply_value NUMERIC, vat NUMERIC, total_amount NUMERIC
- date TEXT, vendor TEXT, warehouse TEXT, note TEXT, color TEXT, spec TEXT, unit TEXT

### transfers (창고이동)
- id UUID PK, user_id UUID FK(profiles)
- date TEXT, item_name TEXT  -- 문제: FK없음
- item_code TEXT, from_warehouse TEXT, to_warehouse TEXT
- quantity NUMERIC, note TEXT

### stocktakes (재고실사)
- id UUID PK, user_id UUID FK(profiles)
- date TEXT, inspector TEXT
- details JSONB DEFAULT '[]'  -- 문제: JSONB단일컬럼으로 쿼리불가

### user_settings (사용자설정 -- 안전재고 포함)
- id UUID PK, user_id UUID FK(profiles)
- key TEXT, value JSONB
- UNIQUE(user_id, key)
- 안전재고: key='safetyStock', value={"품목명": 수량} -- 문제: FK없음

---

## 핵심 문제점

1. items.quantity 신뢰 불가: Supabase sync 실패시 0 저장, 트랜잭션에서 역산필요
2. item_name 텍스트 FK: 품목명 변경시 트랜잭션 연결 끊김, JOIN 불가
3. 창고별 재고 분리없음: items.warehouse는 단순 텍스트, 다창고 집계 불가
4. stocktakes.details JSONB: 실사품목별 조회, 차이분석 쿼리 불가
5. 안전재고 JSON저장: 품목명기반, FK없음

---

## 설계 요구사항

1. 재고수량 단일 진실 공급원(SoT)
   - 방안A: inventory_ledger 뷰 -- transactions 합산으로 항상 계산
   - 방안B: item_stocks 테이블 -- 품목+창고별 현재고 캐시 (trigger 유지)
   - 방안C: items.quantity 유지 + DB trigger로 자동 갱신
   - 최적 방안 선택 및 근거 제시

2. FK 관계 정립
   - transactions.item_id -> items.id (UUID FK)
   - transfers.item_id -> items.id
   - stocktake_items.item_id -> items.id

3. 창고 마스터 분리: warehouses 테이블 신설, 품목+창고 조합 재고관리

4. 수불대장 정확성: 거래처, 색상, 금액, 단가 항상 보존, 가중평균단가 이력계산가능

5. 무중단 마이그레이션: 현재 운영중 -- 단계적 전환 (item_name -> item_id)

6. RLS 정책: 모든 테이블 auth.uid() = user_id

---

## JS Store 현재 구조

```js
mappedData: []        // items 테이블 (camelCase)
transactions: []      // transactions 테이블
transfers: []         // transfers 테이블
safetyStock: {}       // {품목명: 수량} -- user_settings
```

DB<->JS 변환: src/db.js (item_name->itemName, unit_price->unitPrice 등 snake_case<->camelCase)

---

## 예상 규모
- 품목: 수백~수천건 (중소기업)
- 일 트랜잭션: 수십~수백건
- 동시 사용자: 1~10명 (Supabase Free/Pro 플랜)
