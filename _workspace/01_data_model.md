# 데이터 모델 설계 문서 — INVEX 재고관리 모듈 재설계

## 설계 개요

- **DBMS**: Supabase PostgreSQL 15.x (Managed)
- **정규화 수준**: 3NF (+ 전략적 비정규화 2개소)
- **핵심 테이블 수**: 기존 5개 재설계 대상 -> 신규 3개 (item_stocks, safety_stocks 신설, stocktake_items 컬럼 보강) + 기존 4개 변경
- **RLS**: 모든 테이블 `auth.uid() = user_id` 정책 적용

### 핵심 액세스 패턴

| # | 패턴 | 빈도 | 비고 |
|---|------|------|------|
| P1 | 품목별 현재고 조회 (대시보드) | 매우 높음 | SoT 방안 결정의 핵심 |
| P2 | 창고별 재고 집계 | 높음 | 다창고 지원 |
| P3 | 수불대장 조회 (기간/품목 필터) | 높음 | 거래처/단가/금액 포함 |
| P4 | 실사 차이 분석 (품목별 시스템/실사 비교) | 중간 | JSONB 분리 필요 |
| P5 | 안전재고 미달 알람 | 중간 | FK 기반 비교 |
| P6 | 품목명 변경 후 이력 연속성 보장 | 낮음 | item_id FK가 해결 |

---

## 1. 재고수량 SoT 방안 평가 및 결정

### 방안별 비교

| 기준 | 방안A: 집계 뷰 | 방안B: item_stocks 캐시 | 방안C: items.quantity + 트리거 |
|------|--------------|------------------------|-------------------------------|
| 정확성 | 항상 정확 (SUM 계산) | 트리거 정상 시 정확 | 트리거 정상 시 정확 |
| 조회 성능 | 느림 (full-scan 위험) | 빠름 (캐시 테이블 직접 조회) | 빠름 (기존 컬럼 유지) |
| Supabase 트리거 지원 | 불필요 | 필요 (지원됨) | 필요 (지원됨) |
| 창고별 분리 | 가능 (WHERE 추가) | 자연스럽게 분리 | 불가능 (items는 1행=1품목) |
| sync 오류 내성 | 완전 내성 (계산 기반) | 트리거가 DB 내에서 처리 | 동일 문제 재발 위험 |
| 스키마 단순성 | 단순 | 복잡 (테이블 추가) | 단순 (기존 유지) |
| 복구 용이성 | 항상 정확, 복구 불필요 | 재계산 함수로 복구 가능 | 재계산 함수로 복구 가능 |

### 결정: 방안B — item_stocks 캐시 테이블 + DB 트리거

**근거:**

1. **창고별 분리가 핵심 요구사항**: `item_stocks(item_id, warehouse_id)` 복합 PK로 품목+창고 조합을 자연스럽게 관리. 방안C는 `items` 1행에 창고별 수량을 담을 수 없어 구조적으로 부적합.

2. **트리거는 DB 내에서 실행**: 기존 문제(Supabase JS SDK sync 실패시 0 저장)는 앱 레이어 sync에 의존했기 때문에 발생. DB 트리거는 SDK와 무관하게 `INSERT/UPDATE/DELETE on transactions` 시 DB 내부에서 실행되므로 동일 문제가 재발하지 않음.

3. **조회 성능**: 수천 건 품목 * 다창고 환경에서 매 조회마다 `SUM(transactions)` 계산(방안A)은 트랜잭션이 누적될수록 느려짐. 방안B는 O(1) 단순 조회.

4. **정합성 복구 수단 확보**: `fn_recalculate_item_stocks()` 함수를 별도 제공해 불일치 시 전체 재계산 가능.

**허용된 비정규화**: `item_stocks.quantity`는 `transactions` 합산값의 사본임. 이는 성능과 창고별 분리를 위한 의도적 비정규화이며, 트리거로 동기화한다.

---

## 2. ERD (텍스트 형식)

```
[profiles] 1──N [warehouses]
     │
     1──N [items] ──────────────────────────── N──1 [warehouses]
              │                                          │
              │                                [item_stocks]
              │                               (item_id + warehouse_id = PK)
              │                                : 품목별 창고별 현재고 캐시
              │
              1──N [transactions] ─── N──1 [vendors]
              │        : item_id FK (NOT NULL, 전환 완료 후)
              │        : warehouse_id FK
              │
              1──N [transfers]
              │        : item_id FK (NOT NULL, 전환 완료 후)
              │        : from_warehouse_id / to_warehouse_id FK
              │
              1──N [safety_stocks]
              │        : item_id FK (NOT NULL)
              │        : warehouse_id FK (NULL 허용 -- 전체 창고 대상)
              │
[stocktakes] 1──N [stocktake_items]
                      : item_id FK
                      : warehouse_id FK
```

### 핵심 FK 관계 요약

| FK 컬럼 | 참조 | NULL 허용 | 비고 |
|---------|------|-----------|------|
| transactions.item_id | items.id | 전환 기간 YES, 완료 후 NO | |
| transactions.warehouse_id | warehouses.id | YES | 창고 미지정 허용 |
| transfers.item_id | items.id | 전환 기간 YES, 완료 후 NO | |
| transfers.from_warehouse_id | warehouses.id | 전환 기간 YES, 완료 후 NO | |
| transfers.to_warehouse_id | warehouses.id | 전환 기간 YES, 완료 후 NO | |
| item_stocks.item_id | items.id | NO | PK 구성 |
| item_stocks.warehouse_id | warehouses.id | NO | PK 구성 |
| safety_stocks.item_id | items.id | NO | |
| safety_stocks.warehouse_id | warehouses.id | YES | NULL=모든 창고 통합 |
| stocktake_items.item_id | items.id | YES | 미등록 품목 실사 허용 |
| stocktake_items.warehouse_id | warehouses.id | YES | |

---

## 3. 테이블 상세

### 3.1 warehouses (창고 마스터)

> 기존 schema.sql 섹션 18에 정의됨. 변경 없음. 재고 모듈과의 연결 명확화.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| id | UUID | NO | gen_random_uuid() | PK |
| user_id | UUID | NO | - | FK -> profiles.id |
| name | VARCHAR(100) | NO | - | 창고명 |
| code | VARCHAR(20) | YES | - | 창고 코드 |
| address | TEXT | YES | - | 주소 |
| manager | VARCHAR(100) | YES | - | 담당자 |
| memo | TEXT | YES | - | 비고 |
| is_active | BOOLEAN | NO | true | 활성 여부 |
| created_at | TIMESTAMPTZ | NO | now() | |
| updated_at | TIMESTAMPTZ | NO | now() | |

**인덱스**: (user_id)
**제약**: UNIQUE(user_id, name)

---

### 3.2 items (품목 마스터) — 기존 + 컬럼 추가

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| id | UUID | NO | gen_random_uuid() | PK |
| user_id | UUID | NO | - | FK -> profiles.id |
| item_name | VARCHAR(200) | NO | - | 품목명 |
| item_code | VARCHAR(50) | YES | - | 품목 코드 |
| category | VARCHAR(100) | YES | - | 분류 |
| unit | VARCHAR(20) | NO | 'EA' | 단위 |
| unit_price | NUMERIC(15,2) | NO | 0 | 매입 단가 |
| sale_price | NUMERIC(15,2) | NO | 0 | 판매 단가 |
| supply_value | NUMERIC(15,2) | NO | 0 | 공급가 |
| vat | NUMERIC(15,2) | NO | 0 | 부가세 |
| spec | TEXT | YES | - | 규격 |
| color | VARCHAR(50) | YES | - | 색상 |
| warehouse_id | UUID | YES | - | FK -> warehouses.id (기본창고) |
| warehouse | VARCHAR(100) | YES | - | 레거시 텍스트 (전환 기간 유지) |
| min_stock | NUMERIC(10,2) | YES | - | 최소재고 (DEPRECATED -> safety_stocks 전환 후) |
| expiry_date | TEXT | YES | - | 유통기한 텍스트 (레거시) |
| expiry_date_d | DATE | YES | - | 유통기한 DATE |
| lot_number | VARCHAR(100) | YES | - | 로트번호 |
| asset_type | VARCHAR(50) | YES | - | 자산구분 |
| memo | TEXT | YES | - | 비고 |
| extra | JSONB | NO | '{}' | 커스텀 필드 |
| quantity | NUMERIC(15,4) | NO | 0 | 레거시 캐시 (item_stocks 전환 후 deprecated) |
| created_at | TIMESTAMPTZ | NO | now() | |
| updated_at | TIMESTAMPTZ | NO | now() | |

**인덱스**: (user_id), (user_id, category), (user_id, item_name), (user_id, warehouse_id)
**제약**: UNIQUE(user_id, item_name)
**비고**: `quantity` 컬럼은 item_stocks 전환 완료 후 deprecated 처리. 하위 호환을 위해 현재 유지.

---

### 3.3 item_stocks (창고별 현재고 캐시) — 신규

> 방안B의 핵심 테이블. transactions INSERT/UPDATE/DELETE 시 트리거로 자동 갱신.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| item_id | UUID | NO | - | PK 구성, FK -> items.id |
| warehouse_id | UUID | NO | - | PK 구성, FK -> warehouses.id |
| user_id | UUID | NO | - | RLS용, FK -> profiles.id |
| quantity | NUMERIC(15,4) | NO | 0 | 현재고 (트리거 자동갱신) |
| last_updated_at | TIMESTAMPTZ | NO | now() | 최종 갱신 시각 |

**PK**: (item_id, warehouse_id)
**인덱스**: (user_id, item_id), (user_id, warehouse_id)
**RLS**: auth.uid() = user_id

---

### 3.4 transactions (입출고 이력) — 기존 + FK 추가

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| id | UUID | NO | gen_random_uuid() | PK |
| user_id | UUID | NO | - | FK -> profiles.id |
| type | VARCHAR(10) | NO | - | CHECK: in/out/loss/adjust |
| item_id | UUID | YES->NO | - | FK -> items.id (전환 기간 YES, 완료 후 NO) |
| item_name | VARCHAR(200) | NO | - | 비정규화 사본 (수불대장 당시 품목명 보존) |
| item_code | VARCHAR(50) | YES | - | 품목코드 사본 |
| quantity | NUMERIC(15,4) | NO | - | 수량 |
| unit_price | NUMERIC(15,2) | NO | 0 | 매입/원가 단가 |
| selling_price | NUMERIC(15,2) | NO | 0 | 판매 단가 |
| actual_selling_price | NUMERIC(15,2) | NO | 0 | 실제 판매가 (할인 반영) |
| supply_value | NUMERIC(15,2) | NO | 0 | 공급가 |
| vat | NUMERIC(15,2) | NO | 0 | 부가세 |
| total_amount | NUMERIC(15,2) | NO | 0 | 합계 금액 |
| date | TEXT | YES | - | 레거시 날짜 텍스트 |
| txn_date | DATE | YES | - | DATE 타입 날짜 (인덱스 대상) |
| vendor | VARCHAR(200) | YES | - | 거래처명 텍스트 (비정규화, 수불대장용) |
| vendor_id | UUID | YES | - | FK -> vendors.id |
| warehouse | VARCHAR(100) | YES | - | 레거시 창고 텍스트 |
| warehouse_id | UUID | YES | - | FK -> warehouses.id (신규 추가) |
| spec | TEXT | YES | - | 규격 |
| color | VARCHAR(50) | YES | - | 색상 |
| unit | VARCHAR(20) | YES | - | 단위 |
| category | VARCHAR(100) | YES | - | 분류 |
| note | TEXT | YES | - | 비고 |
| created_at | TIMESTAMPTZ | NO | now() | |

**인덱스**: (user_id), (user_id, txn_date DESC), (user_id, type, date DESC), (item_id) WHERE item_id IS NOT NULL, (warehouse_id) WHERE warehouse_id IS NOT NULL
**비고**: `item_name`과 `vendor`는 수불대장 출력 시 품목명/거래처명 변경 이력과 무관하게 당시 데이터를 보존하기 위한 의도적 비정규화. INSERT 후 변경 불가로 운영.

---

### 3.5 transfers (창고 이동) — 기존 + FK 추가

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| id | UUID | NO | gen_random_uuid() | PK |
| user_id | UUID | NO | - | FK -> profiles.id |
| item_id | UUID | YES->NO | - | FK -> items.id |
| item_name | VARCHAR(200) | NO | - | 비정규화 사본 |
| from_warehouse_id | UUID | YES->NO | - | FK -> warehouses.id |
| to_warehouse_id | UUID | YES->NO | - | FK -> warehouses.id |
| from_warehouse | VARCHAR(100) | YES | - | 레거시 텍스트 |
| to_warehouse | VARCHAR(100) | YES | - | 레거시 텍스트 |
| quantity | NUMERIC(15,4) | NO | - | 이동 수량 |
| date | TEXT | YES | - | 레거시 날짜 |
| date_d | DATE | YES | - | DATE 타입 |
| note | TEXT | YES | - | 비고 |
| created_at | TIMESTAMPTZ | NO | now() | |

**인덱스**: (user_id), (user_id, date_d DESC), (item_id) WHERE item_id IS NOT NULL

---

### 3.6 stocktakes (재고 실사 헤더) — 기존 + 컬럼 보강

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| id | UUID | NO | gen_random_uuid() | PK |
| user_id | UUID | NO | - | FK -> profiles.id |
| date | TEXT | YES | - | 실사 날짜 (레거시) |
| date_d | DATE | YES | - | DATE 타입 |
| inspector | VARCHAR(100) | YES | - | 실사 담당자 |
| adjust_count | INTEGER | NO | 0 | 조정 품목 수 |
| total_items | INTEGER | NO | 0 | 총 실사 품목 수 |
| details | JSONB | YES | '[]' | 레거시 (신규 입력은 stocktake_items 사용) |
| status | VARCHAR(20) | NO | 'draft' | draft/confirmed |
| created_at | TIMESTAMPTZ | NO | now() | |

---

### 3.7 stocktake_items (실사 품목 라인) — 기존 + 컬럼 보강

> 기존 schema.sql 섹션 20에 이미 정의됨. warehouse_id, unit_price 컬럼 추가.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| id | UUID | NO | gen_random_uuid() | PK |
| user_id | UUID | NO | - | FK -> profiles.id |
| stocktake_id | UUID | NO | - | FK -> stocktakes.id |
| item_id | UUID | YES | - | FK -> items.id (미등록 품목 허용) |
| item_name | VARCHAR(200) | NO | - | 비정규화 사본 |
| warehouse_id | UUID | YES | - | FK -> warehouses.id (신규 추가) |
| system_qty | NUMERIC(15,4) | NO | 0 | 시스템 현재고 (item_stocks 기준) |
| actual_qty | NUMERIC(15,4) | NO | 0 | 실사 수량 |
| diff_qty | NUMERIC(15,4) | YES | GENERATED | actual_qty - system_qty (STORED) |
| unit_price | NUMERIC(15,2) | NO | 0 | 단가 (차이금액 계산용, 신규 추가) |
| note | TEXT | YES | - | 비고 |

**인덱스**: (stocktake_id), (item_id) WHERE item_id IS NOT NULL

---

### 3.8 safety_stocks (안전재고) — 신규

> 기존 user_settings.key='safetyStock' JSONB를 정규화된 테이블로 분리.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| id | UUID | NO | gen_random_uuid() | PK |
| user_id | UUID | NO | - | FK -> profiles.id |
| item_id | UUID | NO | - | FK -> items.id |
| warehouse_id | UUID | YES | NULL | FK -> warehouses.id (NULL=전체 창고 통합) |
| min_qty | NUMERIC(15,4) | NO | 0 | 안전재고 수량 |
| created_at | TIMESTAMPTZ | NO | now() | |
| updated_at | TIMESTAMPTZ | NO | now() | |

**인덱스**: (user_id, item_id), (item_id, warehouse_id)
**제약**: UNIQUE NULLS NOT DISTINCT (user_id, item_id, warehouse_id) — PG15, warehouse_id NULL 포함 유니크 보장
**RLS**: auth.uid() = user_id

---

## 4. 관계 매트릭스

| 소스 | 대상 | 관계 | FK 위치 | ON DELETE | 비고 |
|------|------|------|---------|-----------|------|
| profiles | warehouses | 1:N | warehouses.user_id | CASCADE | |
| profiles | items | 1:N | items.user_id | CASCADE | |
| profiles | item_stocks | 1:N | item_stocks.user_id | CASCADE | RLS용 |
| profiles | transactions | 1:N | transactions.user_id | CASCADE | |
| profiles | transfers | 1:N | transfers.user_id | CASCADE | |
| profiles | safety_stocks | 1:N | safety_stocks.user_id | CASCADE | |
| items | item_stocks | 1:N | item_stocks.item_id | CASCADE | 품목 삭제 시 재고도 삭제 |
| items | transactions | 1:N | transactions.item_id | SET NULL | 이력 보존, item_name 유지 |
| items | transfers | 1:N | transfers.item_id | SET NULL | |
| items | safety_stocks | 1:N | safety_stocks.item_id | CASCADE | |
| items | stocktake_items | 1:N | stocktake_items.item_id | SET NULL | 미등록 품목 허용 |
| warehouses | item_stocks | 1:N | item_stocks.warehouse_id | RESTRICT | 재고 있는 창고 삭제 방지 |
| warehouses | transactions | 1:N | transactions.warehouse_id | SET NULL | |
| warehouses | transfers (from) | 1:N | transfers.from_warehouse_id | RESTRICT | 이동 이력 있으면 삭제 방지 |
| warehouses | transfers (to) | 1:N | transfers.to_warehouse_id | RESTRICT | |
| warehouses | safety_stocks | 1:N | safety_stocks.warehouse_id | CASCADE | |
| stocktakes | stocktake_items | 1:N | stocktake_items.stocktake_id | CASCADE | |
| vendors | transactions | 1:N | transactions.vendor_id | SET NULL | |

---

## 5. 비정규화 결정

| 위치 | 비정규화 내용 | 이유 | 동기화 방법 |
|------|-------------|------|-----------|
| item_stocks.quantity | transactions SUM 캐시 | 창고별 현재고 O(1) 조회, 다창고 지원 | DB 트리거 (fn_update_item_stock) |
| transactions.item_name | items.item_name 사본 | 수불대장: 품목명 변경 이력과 무관하게 당시 데이터 보존 | INSERT 시 고정, 이후 변경 금지 |
| transactions.vendor | vendors.name 사본 | 거래처명 변경 이력 보존, 수불대장 정확성 | INSERT 시 고정 |
| transfers.item_name | items.item_name 사본 | 이동 이력 보존 | INSERT 시 고정 |
| stocktake_items.item_name | items.item_name 사본 | 실사 시점 품목명 보존 | INSERT 시 고정 |

---

## 6. 전체 DDL

### 6.1 item_stocks 테이블 (신규)

```sql
CREATE TABLE IF NOT EXISTS item_stocks (
  item_id          UUID         NOT NULL REFERENCES items(id)      ON DELETE CASCADE,
  warehouse_id     UUID         NOT NULL REFERENCES warehouses(id)  ON DELETE RESTRICT,
  user_id          UUID         NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  quantity         NUMERIC(15,4) NOT NULL DEFAULT 0,
  last_updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, warehouse_id)
);

ALTER TABLE item_stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item_stocks_all" ON item_stocks FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_item_stocks_user_item ON item_stocks(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_item_stocks_user_wh   ON item_stocks(user_id, warehouse_id);
-- 재고 소진 알람용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_item_stocks_zero
  ON item_stocks(user_id, item_id)
  WHERE quantity <= 0;
```

### 6.2 safety_stocks 테이블 (신규)

```sql
CREATE TABLE IF NOT EXISTS safety_stocks (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  item_id      UUID          NOT NULL REFERENCES items(id)       ON DELETE CASCADE,
  warehouse_id UUID          REFERENCES warehouses(id)           ON DELETE CASCADE,
  min_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- PG15: warehouse_id NULL 포함 유니크 보장
  CONSTRAINT uq_safety_stock UNIQUE NULLS NOT DISTINCT (user_id, item_id, warehouse_id)
);

ALTER TABLE safety_stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "safety_stocks_all" ON safety_stocks FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_safety_stocks_user_item ON safety_stocks(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_safety_stocks_item_wh   ON safety_stocks(item_id, warehouse_id);

-- updated_at 자동 갱신 (기존 update_updated_at 함수 재사용)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON safety_stocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 6.3 transactions 변경 (FK 추가 + 백필)

```sql
-- warehouse_id FK 추가
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- vendor_id FK (이미 없는 경우)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

-- 백필: warehouse 텍스트 -> warehouse_id
UPDATE transactions t
   SET warehouse_id = w.id
  FROM warehouses w
 WHERE w.user_id = t.user_id
   AND w.name    = t.warehouse
   AND t.warehouse_id IS NULL
   AND t.warehouse IS NOT NULL;

-- 백필: vendor 텍스트 -> vendor_id
UPDATE transactions t
   SET vendor_id = v.id
  FROM vendors v
 WHERE v.user_id = t.user_id
   AND v.name    = t.vendor
   AND t.vendor_id IS NULL
   AND t.vendor IS NOT NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_tx_warehouse_id
  ON transactions(user_id, warehouse_id, txn_date DESC)
  WHERE warehouse_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tx_vendor_id
  ON transactions(vendor_id)
  WHERE vendor_id IS NOT NULL;
```

### 6.4 transfers 변경 (FK 추가 + 백필)

```sql
-- item_id FK (nullable, 전환 후 NOT NULL)
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES items(id) ON DELETE SET NULL;

-- 창고 FK
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS to_warehouse_id   UUID REFERENCES warehouses(id) ON DELETE RESTRICT;

-- 백필: item_name -> item_id
UPDATE transfers tr
   SET item_id = i.id
  FROM items i
 WHERE i.user_id  = tr.user_id
   AND i.item_name = tr.item_name
   AND tr.item_id IS NULL;

-- 백필: warehouse 텍스트 -> warehouse_id
UPDATE transfers tr
   SET from_warehouse_id = w.id
  FROM warehouses w
 WHERE w.user_id = tr.user_id
   AND w.name    = tr.from_warehouse
   AND tr.from_warehouse_id IS NULL;

UPDATE transfers tr
   SET to_warehouse_id = w.id
  FROM warehouses w
 WHERE w.user_id = tr.user_id
   AND w.name    = tr.to_warehouse
   AND tr.to_warehouse_id IS NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_transfers_item_id ON transfers(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfers_from_wh ON transfers(from_warehouse_id) WHERE from_warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfers_to_wh   ON transfers(to_warehouse_id)   WHERE to_warehouse_id IS NOT NULL;
```

### 6.5 stocktake_items 컬럼 보강

```sql
-- warehouse_id 추가 (창고별 실사)
ALTER TABLE stocktake_items
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- unit_price 추가 (차이금액 계산용)
ALTER TABLE stocktake_items
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(15,2) NOT NULL DEFAULT 0;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_sti_warehouse
  ON stocktake_items(warehouse_id) WHERE warehouse_id IS NOT NULL;
```

### 6.6 트리거 — item_stocks 자동 갱신 (transactions)

```sql
CREATE OR REPLACE FUNCTION fn_update_item_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id      UUID;
  v_warehouse_id UUID;
  v_user_id      UUID;
  v_delta        NUMERIC;
  v_sign         NUMERIC;
BEGIN
  -- INSERT/UPDATE: NEW 기준, DELETE: OLD 기준
  IF TG_OP = 'DELETE' THEN
    v_item_id      := OLD.item_id;
    v_warehouse_id := OLD.warehouse_id;
    v_user_id      := OLD.user_id;
  ELSE
    v_item_id      := NEW.item_id;
    v_warehouse_id := NEW.warehouse_id;
    v_user_id      := NEW.user_id;
  END IF;

  -- item_id 또는 warehouse_id가 NULL이면 item_stocks 갱신 불가 -> 건너뜀
  IF v_item_id IS NULL OR v_warehouse_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- adjust 타입: 현재고를 NEW.quantity로 직접 설정
    IF NEW.type = 'adjust' THEN
      INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
        VALUES (v_item_id, v_warehouse_id, v_user_id, NEW.quantity, now())
        ON CONFLICT (item_id, warehouse_id)
        DO UPDATE SET quantity = NEW.quantity, last_updated_at = now();
      RETURN NEW;
    END IF;

    v_delta := CASE NEW.type
      WHEN 'in'   THEN  NEW.quantity
      WHEN 'out'  THEN -NEW.quantity
      WHEN 'loss' THEN -NEW.quantity
      ELSE 0
    END;

    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (v_item_id, v_warehouse_id, v_user_id, GREATEST(0, v_delta), now())
      ON CONFLICT (item_id, warehouse_id)
      DO UPDATE SET
        quantity        = GREATEST(0, item_stocks.quantity + v_delta),
        last_updated_at = now();

  ELSIF TG_OP = 'UPDATE' THEN
    -- item_id/warehouse_id 변경 시: OLD 위치 역전 + NEW 위치 적용
    IF OLD.item_id IS DISTINCT FROM NEW.item_id
       OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id THEN

      IF OLD.item_id IS NOT NULL AND OLD.warehouse_id IS NOT NULL THEN
        v_sign := CASE OLD.type
          WHEN 'in'   THEN -1
          WHEN 'out'  THEN  1
          WHEN 'loss' THEN  1
          ELSE 0
        END;
        UPDATE item_stocks SET
          quantity        = GREATEST(0, quantity + v_sign * OLD.quantity),
          last_updated_at = now()
        WHERE item_id = OLD.item_id AND warehouse_id = OLD.warehouse_id;
      END IF;

      v_sign := CASE NEW.type
        WHEN 'in'   THEN  1
        WHEN 'out'  THEN -1
        WHEN 'loss' THEN -1
        ELSE 0
      END;
      INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
        VALUES (NEW.item_id, NEW.warehouse_id, v_user_id, GREATEST(0, v_sign * NEW.quantity), now())
        ON CONFLICT (item_id, warehouse_id)
        DO UPDATE SET
          quantity        = GREATEST(0, item_stocks.quantity + v_sign * NEW.quantity),
          last_updated_at = now();
    ELSE
      -- 동일 품목/창고, 수량/타입 변경
      v_delta := CASE OLD.type
        WHEN 'in'   THEN -OLD.quantity
        WHEN 'out'  THEN  OLD.quantity
        WHEN 'loss' THEN  OLD.quantity
        ELSE 0
      END;
      v_delta := v_delta + CASE NEW.type
        WHEN 'in'   THEN  NEW.quantity
        WHEN 'out'  THEN -NEW.quantity
        WHEN 'loss' THEN -NEW.quantity
        ELSE 0
      END;
      UPDATE item_stocks SET
        quantity        = GREATEST(0, quantity + v_delta),
        last_updated_at = now()
      WHERE item_id = v_item_id AND warehouse_id = v_warehouse_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_delta := CASE OLD.type
      WHEN 'in'   THEN -OLD.quantity
      WHEN 'out'  THEN  OLD.quantity
      WHEN 'loss' THEN  OLD.quantity
      ELSE 0
    END;
    UPDATE item_stocks SET
      quantity        = GREATEST(0, quantity + v_delta),
      last_updated_at = now()
    WHERE item_id = v_item_id AND warehouse_id = v_warehouse_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_update_item_stock ON transactions;
CREATE TRIGGER trg_update_item_stock
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_item_stock();
```

### 6.7 트리거 — item_stocks 자동 갱신 (transfers)

```sql
CREATE OR REPLACE FUNCTION fn_update_item_stock_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_id IS NULL OR NEW.from_warehouse_id IS NULL OR NEW.to_warehouse_id IS NULL THEN
      RETURN NEW;
    END IF;
    -- 출발 창고 차감
    UPDATE item_stocks SET
      quantity        = GREATEST(0, quantity - NEW.quantity),
      last_updated_at = now()
    WHERE item_id = NEW.item_id AND warehouse_id = NEW.from_warehouse_id;
    -- 도착 창고 증가
    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (NEW.item_id, NEW.to_warehouse_id, NEW.user_id, NEW.quantity, now())
      ON CONFLICT (item_id, warehouse_id)
      DO UPDATE SET
        quantity        = item_stocks.quantity + NEW.quantity,
        last_updated_at = now();

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_id IS NULL OR OLD.from_warehouse_id IS NULL OR OLD.to_warehouse_id IS NULL THEN
      RETURN OLD;
    END IF;
    -- 이동 역전: 출발 창고 복구
    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (OLD.item_id, OLD.from_warehouse_id, OLD.user_id, OLD.quantity, now())
      ON CONFLICT (item_id, warehouse_id)
      DO UPDATE SET
        quantity        = item_stocks.quantity + OLD.quantity,
        last_updated_at = now();
    -- 도착 창고 차감
    UPDATE item_stocks SET
      quantity        = GREATEST(0, quantity - OLD.quantity),
      last_updated_at = now()
    WHERE item_id = OLD.item_id AND warehouse_id = OLD.to_warehouse_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_update_stock_on_transfer ON transfers;
CREATE TRIGGER trg_update_stock_on_transfer
  AFTER INSERT OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION fn_update_item_stock_on_transfer();
```

### 6.8 재고 전체 재계산 함수 (불일치 복구용)

```sql
CREATE OR REPLACE FUNCTION fn_recalculate_item_stocks(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 본인 데이터만 재계산 가능
  IF target_user_id != auth.uid() THEN
    RAISE EXCEPTION '본인 데이터만 재계산할 수 있습니다.';
  END IF;

  -- 기존 캐시 삭제
  DELETE FROM item_stocks WHERE user_id = target_user_id;

  -- transactions 기반 재계산 (adjust 타입은 SUM에 포함하지 않고 별도 처리)
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT
    item_id,
    warehouse_id,
    target_user_id,
    GREATEST(0,
      SUM(CASE
        WHEN type = 'in'   THEN  quantity
        WHEN type = 'out'  THEN -quantity
        WHEN type = 'loss' THEN -quantity
        ELSE 0
      END)
    ) AS quantity,
    now()
  FROM transactions
  WHERE user_id      = target_user_id
    AND item_id      IS NOT NULL
    AND warehouse_id IS NOT NULL
    AND type != 'adjust'  -- adjust는 별도 처리
  GROUP BY item_id, warehouse_id
  ON CONFLICT (item_id, warehouse_id) DO UPDATE
    SET quantity        = EXCLUDED.quantity,
        last_updated_at = now();

  -- adjust 타입: 가장 최근 adjust 값으로 덮어씀
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT DISTINCT ON (item_id, warehouse_id)
    item_id,
    warehouse_id,
    target_user_id,
    quantity,
    now()
  FROM transactions
  WHERE user_id      = target_user_id
    AND item_id      IS NOT NULL
    AND warehouse_id IS NOT NULL
    AND type = 'adjust'
  ORDER BY item_id, warehouse_id, txn_date DESC, created_at DESC
  ON CONFLICT (item_id, warehouse_id) DO UPDATE
    SET quantity        = EXCLUDED.quantity,
        last_updated_at = now();

  -- transfers 반영: from 창고 차감
  UPDATE item_stocks ist SET
    quantity        = GREATEST(0, ist.quantity - sub.out_qty),
    last_updated_at = now()
  FROM (
    SELECT item_id, from_warehouse_id AS warehouse_id, SUM(quantity) AS out_qty
    FROM transfers
    WHERE user_id         = target_user_id
      AND item_id         IS NOT NULL
      AND from_warehouse_id IS NOT NULL
    GROUP BY item_id, from_warehouse_id
  ) sub
  WHERE ist.item_id = sub.item_id AND ist.warehouse_id = sub.warehouse_id;

  -- transfers 반영: to 창고 증가
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT item_id, to_warehouse_id, target_user_id, SUM(quantity), now()
  FROM transfers
  WHERE user_id        = target_user_id
    AND item_id        IS NOT NULL
    AND to_warehouse_id IS NOT NULL
  GROUP BY item_id, to_warehouse_id
  ON CONFLICT (item_id, warehouse_id) DO UPDATE
    SET quantity        = item_stocks.quantity + EXCLUDED.quantity,
        last_updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

GRANT EXECUTE ON FUNCTION fn_recalculate_item_stocks(UUID) TO authenticated;
```

### 6.9 수불대장 뷰

```sql
CREATE OR REPLACE VIEW v_ledger AS
SELECT
  t.id,
  t.user_id,
  t.txn_date,
  t.date                    AS date_text,
  t.type,
  t.item_id,
  t.item_name,
  t.item_code,
  t.category,
  t.spec,
  t.color,
  t.unit,
  t.quantity,
  t.unit_price,
  t.selling_price,
  t.actual_selling_price,
  t.supply_value,
  t.vat,
  t.total_amount,
  t.vendor                  AS vendor_name_at_txn,   -- 거래 당시 거래처명 (불변)
  t.vendor_id,
  v.name                    AS vendor_name_current,   -- 현재 거래처명 (변경 추적용)
  t.warehouse               AS warehouse_name_at_txn, -- 거래 당시 창고명 (불변)
  t.warehouse_id,
  w.name                    AS warehouse_name_current,
  ist.quantity              AS current_stock,          -- 해당 창고 현재고
  t.note,
  t.created_at
FROM transactions t
LEFT JOIN vendors     v   ON v.id   = t.vendor_id
LEFT JOIN warehouses  w   ON w.id   = t.warehouse_id
LEFT JOIN item_stocks ist ON ist.item_id = t.item_id
                         AND ist.warehouse_id = t.warehouse_id;
-- RLS: transactions 테이블의 RLS(tx_all)가 뷰를 통해 적용됨
```

### 6.10 안전재고 미달 알람 뷰

```sql
CREATE OR REPLACE VIEW v_low_stock_alert AS
SELECT
  ss.user_id,
  ss.item_id,
  i.item_name,
  i.item_code,
  i.category,
  ss.warehouse_id,
  w.name                              AS warehouse_name,
  ss.min_qty                          AS safety_qty,
  COALESCE(ist.quantity, 0)           AS current_qty,
  ss.min_qty - COALESCE(ist.quantity, 0) AS shortage
FROM safety_stocks ss
JOIN items i ON i.id = ss.item_id
LEFT JOIN warehouses w ON w.id = ss.warehouse_id
LEFT JOIN item_stocks ist
  ON ist.item_id = ss.item_id
  AND (
    ss.warehouse_id IS NULL              -- 전체 창고 통합 기준: 첫 번째 창고만 표시
    OR ist.warehouse_id = ss.warehouse_id
  )
WHERE COALESCE(ist.quantity, 0) < ss.min_qty;
```

---

## 7. 액세스 패턴

| 패턴 | 쿼리 유형 | 빈도 | 대상 테이블 | 인덱스 |
|------|----------|------|-----------|--------|
| P1: 전체 품목 현재고 | SELECT | 매우 높음 | item_stocks JOIN items | (user_id, item_id) |
| P2: 창고별 재고 | SELECT | 높음 | item_stocks | (user_id, warehouse_id) |
| P3: 수불대장 (기간/품목) | SELECT | 높음 | v_ledger / transactions | (user_id, txn_date DESC), (item_id) |
| P4: 안전재고 미달 | SELECT | 중간 | v_low_stock_alert | (user_id, item_id) |
| P5: 실사 차이 분석 | SELECT | 중간 | stocktake_items | (stocktake_id), (item_id) |
| P6: 품목별 입출고 이력 | SELECT | 중간 | transactions | (item_id, user_id) |
| P7: 재고 실사 등록 | INSERT | 낮음 | stocktakes + stocktake_items | - |
| P8: 입고 등록 | INSERT | 높음 | transactions -> 트리거 -> item_stocks | - |
| P9: 창고 이동 등록 | INSERT | 중간 | transfers -> 트리거 -> item_stocks | - |

---

## 8. JS Store 변경 영향 분석

### 8.1 추가/변경해야 할 Store 키

```javascript
// store.js 에 추가할 상태 키
{
  // 신규
  itemStocks: [],      // item_stocks 테이블 -- 품목별 창고별 현재고
                       // 기존 mappedData[i].quantity 대신 이 테이블 참조
  safetyStocks: [],    // safety_stocks 테이블 -- 기존 safetyStock:{} 대체

  // 기존 (warehouses는 이미 store에 있을 수 있음)
  warehouses: [],
}
```

### 8.2 기존 Store 키 변경 영향

| 기존 Store 키 | 기존 DB 매핑 | 변경 후 | 영향 |
|-------------|------------|--------|------|
| `mappedData[i].quantity` | items.quantity | item_stocks.quantity (캐시 조회) | 현재고 조회 로직 변경 필요 |
| `safetyStock` (객체, 품목명 키) | user_settings.key='safetyStock' | safety_stocks 테이블 | db.js 전환 함수 추가 필요 |
| `transactions[i].itemName` | transactions.item_name | 유지 (비정규화 사본) | 변경 없음 |
| `transactions[i].itemId` | transactions.item_id | 기존 nullable, 필수화 예정 | db.js camelCase 변환 추가 |
| `transfers[i].itemId` | transfers.item_id | 신규 추가 | db.js 변환 추가 |

### 8.3 db.js 변경 필요 사항

```javascript
// 추가 필요한 변환 함수

export const itemStocks = {
  listAll:    () => { /* SELECT * FROM item_stocks WHERE user_id = auth.uid() */ },
  byItem:     (itemId) => { /* SELECT * FROM item_stocks WHERE item_id = $1 */ },
  recalculate: () => { /* SELECT fn_recalculate_item_stocks(auth.uid()) */ },
};

// safety_stocks (기존 user_settings safetyStock 대체)
export const safetyStocks = {
  list:   () => { /* SELECT * FROM safety_stocks WHERE user_id = auth.uid() */ },
  upsert: (itemId, warehouseId, minQty) => { /* INSERT ... ON CONFLICT DO UPDATE */ },
  delete: (itemId, warehouseId) => { /* DELETE */ },
};

// DB->JS camelCase 변환 추가 필요 컬럼
// item_id          -> itemId
// warehouse_id     -> warehouseId
// vendor_id        -> vendorId
// from_warehouse_id -> fromWarehouseId
// to_warehouse_id   -> toWarehouseId
// last_updated_at   -> lastUpdatedAt
```

### 8.4 현재고 조회 패턴 변경

```javascript
// 기존 (items.quantity -- sync 실패시 0)
const stock = item.quantity;

// 변경 후: itemStocks 캐시 참조
// 전체 창고 합산 현재고
const stock = itemStocks
  .filter(s => s.itemId === item.id)
  .reduce((sum, s) => sum + (s.quantity || 0), 0);

// 특정 창고 현재고
const stock = itemStocks.find(
  s => s.itemId === item.id && s.warehouseId === targetWarehouseId
)?.quantity ?? 0;
```

### 8.5 안전재고 마이그레이션 (user_settings -> safety_stocks)

```javascript
// 기존: safetyStock: {"사과": 100, "배": 50}
// 전환 스크립트 (db.js 또는 마이그레이션 페이지에서 1회 실행)
async function migrateSafetyStock(safetyStockObj, items) {
  for (const [itemName, minQty] of Object.entries(safetyStockObj)) {
    const item = items.find(i => i.itemName === itemName);
    if (!item) continue;
    await supabase.from('safety_stocks').upsert({
      user_id: currentUserId,
      item_id: item.id,
      warehouse_id: null,  // 전체 창고 통합
      min_qty: minQty,
    }, { onConflict: 'user_id,item_id,warehouse_id' });
  }
}
```

---

## 9. 마이그레이션 관리자 전달 사항

### 9.1 실행 순서 (의존성 순)

1. warehouses 테이블 존재 확인 (schema.sql 섹션 18에 이미 정의됨)
2. item_stocks 테이블 생성 (DDL 6.1)
3. safety_stocks 테이블 생성 (DDL 6.2)
4. transactions 컬럼 추가 + 백필 (DDL 6.3)
5. transfers 컬럼 추가 + 백필 (DDL 6.4)
6. stocktake_items 컬럼 보강 (DDL 6.5)
7. 트리거 설치: fn_update_item_stock (DDL 6.6)
8. 트리거 설치: fn_update_item_stock_on_transfer (DDL 6.7)
9. 재계산 함수 설치: fn_recalculate_item_stocks (DDL 6.8)
10. 뷰 생성: v_ledger, v_low_stock_alert (DDL 6.9, 6.10)
11. item_stocks 초기 데이터: 각 사용자별 `SELECT fn_recalculate_item_stocks(user_id)` 실행
12. 안전재고 마이그레이션: user_settings.safetyStock -> safety_stocks (앱 or 스크립트)

### 9.2 item_name -> item_id 전환 전략 (3단계)

**Phase 1 — NULL 허용 기간 (현재):**
- transactions.item_id NULL 허용 유지
- 신규 INSERT 시 앱에서 item_id를 함께 전송 (item_name도 유지)
- 기존 행은 DDL 6.3/6.4 백필 쿼리로 item_id 설정 시도

**Phase 2 — 백필 완료 확인:**
```sql
-- NULL 남은 행 확인 (0이면 Phase 3 진행)
SELECT COUNT(*) FROM transactions WHERE item_id IS NULL AND item_name IS NOT NULL;
SELECT COUNT(*) FROM transfers WHERE item_id IS NULL;
```

**Phase 3 — NOT NULL 제약 추가 (완료 후):**
```sql
ALTER TABLE transactions   ALTER COLUMN item_id        SET NOT NULL;
ALTER TABLE transfers      ALTER COLUMN item_id        SET NOT NULL;
ALTER TABLE transfers      ALTER COLUMN from_warehouse_id SET NOT NULL;
ALTER TABLE transfers      ALTER COLUMN to_warehouse_id   SET NOT NULL;
```

### 9.3 무중단 전환 위험 구간

| 작업 | 위험도 | 대응 방안 |
|------|--------|---------|
| ALTER TABLE (컬럼 추가) | 낮음 | PG15 DDL 잠금 시간 짧음 |
| 대량 UPDATE 백필 | 중간 | 1,000행씩 배치 처리, 피크 타임 회피 |
| 트리거 설치 | 낮음 | 기존 데이터에 소급 적용 없음 |
| NOT NULL 추가 (Phase 3) | 중간 | NULL 행 0개 확인 후 실행 |
| item_stocks 초기 계산 | 낮음 | fn_recalculate 함수가 원자적 처리 |

### 9.4 롤백 계획

```sql
-- 트리거 제거로 item_stocks 갱신 중단 (item_stocks 테이블은 무해)
DROP TRIGGER IF EXISTS trg_update_item_stock          ON transactions;
DROP TRIGGER IF EXISTS trg_update_stock_on_transfer   ON transfers;
-- safety_stocks, item_stocks 테이블 삭제 (데이터 손실 없음)
DROP TABLE IF EXISTS item_stocks;
DROP TABLE IF EXISTS safety_stocks;
```

---

## 10. 성능 분석가 전달 사항

### 10.1 예상 데이터 규모

| 테이블 | 예상 행 수 (사용자당) | 증가율 |
|--------|---------------------|--------|
| items | 100~5,000 | 낮음 |
| transactions | 수천~수만 (누적) | 높음 |
| item_stocks | items * warehouses 수 (최대 수천) | 낮음 |
| safety_stocks | items 수와 동일 | 낮음 |
| transfers | 수백~수천 (누적) | 중간 |
| stocktake_items | 실사당 items 수 | 중간 |

### 10.2 인덱스 우선순위

| 우선순위 | 인덱스 | 대상 패턴 |
|---------|--------|---------|
| 1 | item_stocks(user_id, item_id) | P1 현재고 조회 |
| 2 | item_stocks(user_id, warehouse_id) | P2 창고별 집계 |
| 3 | transactions(user_id, txn_date DESC) | P3 수불대장 |
| 4 | transactions(item_id, user_id) WHERE item_id IS NOT NULL | P6 품목별 이력 |
| 5 | safety_stocks(user_id, item_id) | P4 안전재고 미달 |

### 10.3 Materialized View 수정 필요

기존 `mv_inventory_summary`는 items.quantity를 사용. item_stocks 전환 후 재정의 필요:
```sql
-- REFRESH 주기: 대시보드 로드 시 또는 15분마다
-- item_stocks.quantity로 교체 필요
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_summary;
```

---

## 11. 보안 감사자 전달 사항

### 11.1 민감 데이터 컬럼

| 테이블 | 컬럼 | 민감도 | 현황 |
|--------|------|--------|------|
| transactions | unit_price, total_amount | 높음 | RLS 적용됨 |
| item_stocks | quantity | 중간 | RLS 적용됨 |
| safety_stocks | min_qty | 낮음 | RLS 적용됨 |

### 11.2 신규 테이블 RLS 체크리스트

```sql
-- 적용 확인 필수
ALTER TABLE item_stocks   ENABLE ROW LEVEL SECURITY;  -- DDL 6.1에 포함
ALTER TABLE safety_stocks ENABLE ROW LEVEL SECURITY;  -- DDL 6.2에 포함

-- 정책 존재 확인
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('item_stocks', 'safety_stocks');
```

### 11.3 트리거 함수 보안

- 모든 트리거 함수: `SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp` 적용
- `fn_recalculate_item_stocks`: 함수 내부에 `auth.uid() != target_user_id` 검사 포함 (DDL 6.8)
- 뷰(v_ledger, v_low_stock_alert): 기반 테이블의 RLS가 자동 적용됨

### 11.4 접근 제어 요구사항

| 기능 | 필요 역할 | 비고 |
|------|---------|------|
| 현재고 조회 | viewer 이상 | RLS로 자기 데이터만 |
| 재고 재계산 | staff 이상 | fn_recalculate 직접 호출 |
| 안전재고 설정 | manager 이상 | 앱 레이어에서 role 확인 권장 |
| 창고 삭제 | admin | RESTRICT FK로 재고 있으면 차단 |
