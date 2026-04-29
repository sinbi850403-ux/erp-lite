# 마이그레이션 계획서 — INVEX 재고관리 DB v2.0.0

## 마이그레이션 개요

- **도구**: Supabase SQL Editor (직접 실행) / psql (CLI 대안)
- **대상 DBMS**: PostgreSQL 15.x (Supabase Managed)
- **총 마이그레이션 섹션**: 13개 (Phase 3 별도)
- **예상 실행 시간**: 전체 15~30분 (데이터 규모 의존)
- **무중단 필요 여부**: 예. 모든 섹션은 잠금 최소화 전략 적용
- **작성일**: 2026-04-29

---

## 1. 실행 순서도 (의존성 포함)

```
[SECTION 1] item_stocks 테이블 생성
    |-- 의존: items, warehouses, profiles 테이블 존재
[SECTION 2] safety_stocks 테이블 생성
    |-- 의존: items, warehouses, profiles 테이블 존재
    |-- 의존: update_updated_at() 함수 존재 (기존 schema.sql)
[SECTION 3] transactions 컬럼 추가 (item_id, warehouse_id, vendor_id, txn_date)
    |-- 의존: items, warehouses, vendors 테이블 존재
[SECTION 4] transfers 컬럼 추가 (item_id, from/to_warehouse_id, date_d)
    |-- 의존: items, warehouses 테이블 존재
[SECTION 5] stocktake_items 컬럼 보강 (warehouse_id, unit_price, diff_qty)
    |-- 의존: warehouses 테이블 존재
[SECTION 6] 백필: transactions.warehouse_id
    |-- 의존: SECTION 3 완료
[SECTION 7] 백필: transactions.vendor_id
    |-- 의존: SECTION 3 완료
[SECTION 8] 백필: item_id, txn_date/date_d (transactions + transfers)
    |-- 의존: SECTION 3, 4 완료
[SECTION 9] 트리거 함수 설치 (fn_update_item_stock, fn_update_item_stock_on_transfer, fn_recalculate)
    |-- 의존: SECTION 1 완료 (item_stocks 테이블 존재)
[SECTION 10] item_stocks 초기 데이터 계산
    |-- 의존: SECTION 8, 9 완료 (백필 + 트리거 설치 후)
[SECTION 11] 뷰 생성 (v_ledger, v_low_stock_alert)
    |-- 의존: SECTION 1, 2, 9, 10 완료
[SECTION 12] RLS 정책 최종 확인 (검증 쿼리)
    |-- 의존: 모든 섹션 완료
[SECTION 13] 안전재고 마이그레이션 (user_settings -> safety_stocks)
    |-- 의존: SECTION 2 완료

[PHASE 3] NOT NULL 제약 추가 — 별도 일정 (백필 완료 확인 후)
    |-- 의존: SECTION 8 완료 + Phase 2 검증 통과
    |-- 의존: 앱 코드 item_id 전송 배포 완료
```

---

## 2. 단계별 예상 소요 시간

| 섹션 | 작업 내용 | 소규모 (<1만 행) | 중규모 (1~10만 행) | 대규모 (>10만 행) | 잠금 유형 |
|------|----------|----------------|--------------------|-------------------|----------|
| S1 | item_stocks 테이블 생성 | <1초 | <1초 | <1초 | AccessExclusive (신규) |
| S2 | safety_stocks 테이블 생성 | <1초 | <1초 | <1초 | AccessExclusive (신규) |
| S3 | transactions 컬럼 4개 추가 | <1초 | 2~5초 | 10~30초 | ShareUpdateExclusive |
| S4 | transfers 컬럼 4개 추가 | <1초 | 1~3초 | 5~15초 | ShareUpdateExclusive |
| S5 | stocktake_items 컬럼 보강 | <1초 | <1초 | 2~5초 | ShareUpdateExclusive |
| S6 | 백필: warehouse_id | 1~5초 | 10~60초 | 2~10분 | RowExclusive (배치) |
| S7 | 백필: vendor_id | 1~5초 | 10~60초 | 2~10분 | RowExclusive (배치) |
| S8 | 백필: item_id + 날짜 | 2~10초 | 30초~3분 | 5~20분 | RowExclusive (배치) |
| S9 | 트리거 함수 설치 | <1초 | <1초 | <1초 | AccessExclusive (잠깐) |
| S10 | item_stocks 초기 계산 | 1~5초 | 10~60초 | 1~5분 | RowExclusive |
| S11 | 뷰 생성 | <1초 | <1초 | <1초 | 없음 (CREATE OR REPLACE) |
| S12 | RLS 확인 (SELECT만) | <1초 | <1초 | <1초 | 없음 |
| S13 | 안전재고 마이그레이션 | <1초 | <1초 | <1초 | RowExclusive |
| Phase 3 | NOT NULL 제약 | <1초 | 2~5초 | 10~30초 | ShareUpdateExclusive |

> Supabase Free 플랜 기준 SQL Editor 타임아웃: 30초. 배치 처리(1,000행씩)로 분할.

---

## 3. 운영 영향 분석

### 3.1 무중단 근거

| 작업 | 서비스 중단 | 이유 |
|------|------------|------|
| 신규 테이블 생성 (S1~S2) | 없음 | 기존 테이블 잠금 없음 |
| ALTER TABLE 컬럼 추가 (S3~S5) | 순간적 잠금 | PG15 ADD COLUMN은 NULL 허용 시 메타데이터 변경만 (즉시 완료) |
| 백필 UPDATE (S6~S8) | 없음 | 배치 1,000행씩, RowExclusive (SELECT와 공존 가능) |
| 트리거 설치 (S9) | 없음 | CREATE OR REPLACE는 기존 트랜잭션 차단 없음 |
| item_stocks 초기 계산 (S10) | 없음 | INSERT/UPDATE, 읽기 쿼리와 공존 |
| 뷰 생성 (S11) | 없음 | CREATE OR REPLACE VIEW |
| NOT NULL 추가 (Phase 3) | 순간적 잠금 | PG15 NULL 행 없으면 메타데이터 변경만 |

### 3.2 피크 타임 회피 권장 섹션

백필 섹션(S6~S8)과 초기 계산(S10)은 트랜잭션 데이터 볼륨에 비례해 시간이 걸립니다.
INVEX 사용 패턴상 새벽 시간대(00:00~06:00 KST) 실행을 권장합니다.

### 3.3 레거시 앱 호환성

- 기존 컬럼(`item_name`, `warehouse`, `vendor`, `date` 등) 절대 삭제하지 않음
- 신규 FK 컬럼은 모두 NULL 허용으로 추가 — 기존 INSERT 문 수정 불필요
- 트리거는 item_id/warehouse_id가 NULL이면 item_stocks 갱신을 건너뜀 (레거시 앱 안전)

---

## 4. 검증 쿼리 (각 단계 완료 후 확인)

### S1 완료 확인
```sql
SELECT COUNT(*) FROM item_stocks;  -- 0 (빈 테이블)
SELECT policyname FROM pg_policies WHERE tablename = 'item_stocks';  -- 'item_stocks_all'
```

### S2 완료 확인
```sql
SELECT COUNT(*) FROM safety_stocks;  -- 0
SELECT policyname FROM pg_policies WHERE tablename = 'safety_stocks';  -- 'safety_stocks_all'
```

### S3~S5 완료 확인
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('item_id', 'warehouse_id', 'vendor_id', 'txn_date')
ORDER BY column_name;
-- 4개 행 반환

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'transfers'
  AND column_name IN ('item_id', 'from_warehouse_id', 'to_warehouse_id', 'date_d');
-- 4개 행 반환

SELECT column_name FROM information_schema.columns
WHERE table_name = 'stocktake_items'
  AND column_name IN ('warehouse_id', 'unit_price', 'diff_qty');
-- 3개 행 반환
```

### S6~S8 백필 진행률 확인
```sql
-- transactions 백필 현황
SELECT
  COUNT(*) FILTER (WHERE warehouse_id IS NOT NULL AND warehouse IS NOT NULL) AS wh_backfilled,
  COUNT(*) FILTER (WHERE warehouse_id IS NULL     AND warehouse IS NOT NULL) AS wh_remaining,
  COUNT(*) FILTER (WHERE vendor_id IS NOT NULL    AND vendor IS NOT NULL)    AS vendor_backfilled,
  COUNT(*) FILTER (WHERE vendor_id IS NULL        AND vendor IS NOT NULL)    AS vendor_remaining,
  COUNT(*) FILTER (WHERE item_id IS NOT NULL      AND item_name IS NOT NULL) AS item_backfilled,
  COUNT(*) FILTER (WHERE item_id IS NULL          AND item_name IS NOT NULL) AS item_remaining,
  COUNT(*) FILTER (WHERE txn_date IS NOT NULL)                               AS date_backfilled
FROM transactions;

-- transfers 백필 현황
SELECT
  COUNT(*) FILTER (WHERE item_id IS NOT NULL)           AS item_backfilled,
  COUNT(*) FILTER (WHERE item_id IS NULL)               AS item_remaining,
  COUNT(*) FILTER (WHERE from_warehouse_id IS NOT NULL) AS from_wh_backfilled,
  COUNT(*) FILTER (WHERE to_warehouse_id IS NOT NULL)   AS to_wh_backfilled
FROM transfers;
```

### S9 트리거 확인
```sql
SELECT trigger_name, event_object_table, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_name IN ('trg_update_item_stock', 'trg_update_stock_on_transfer')
ORDER BY event_object_table;
-- 4개 행 반환 (trg_update_item_stock: INSERT/UPDATE/DELETE, trg_update_stock_on_transfer: INSERT/DELETE)
```

### S10 초기 계산 확인
```sql
SELECT
  COUNT(*)              AS stock_lines,
  SUM(quantity)         AS total_qty,
  COUNT(DISTINCT user_id) AS user_count
FROM item_stocks;

-- 품목별 창고별 합계가 transactions 합계와 일치하는지 샘플 확인
SELECT
  ist.item_id,
  ist.warehouse_id,
  ist.quantity AS cached_qty,
  COALESCE(SUM(CASE
    WHEN t.type = 'in'   THEN  t.quantity
    WHEN t.type = 'out'  THEN -t.quantity
    WHEN t.type = 'loss' THEN -t.quantity
    ELSE 0
  END), 0) AS calc_qty
FROM item_stocks ist
LEFT JOIN transactions t
  ON t.item_id = ist.item_id
  AND t.warehouse_id = ist.warehouse_id
  AND t.type != 'adjust'
GROUP BY ist.item_id, ist.warehouse_id, ist.quantity
HAVING ABS(ist.quantity - COALESCE(SUM(CASE
    WHEN t.type = 'in'   THEN  t.quantity
    WHEN t.type = 'out'  THEN -t.quantity
    WHEN t.type = 'loss' THEN -t.quantity
    ELSE 0
  END), 0)) > 0.0001
LIMIT 10;
-- 0개 행이어야 정상 (차이 없음)
```

### S11 뷰 확인
```sql
SELECT COUNT(*) FROM v_ledger LIMIT 1;
SELECT COUNT(*) FROM v_low_stock_alert;
```

### S13 안전재고 마이그레이션 확인
```sql
SELECT us.user_id,
       jsonb_object_keys(us.value) AS item_name_from_settings,
       ss.item_id,
       ss.min_qty
FROM user_settings us
JOIN safety_stocks ss ON ss.user_id = us.user_id
WHERE us.key = 'safetyStock'
LIMIT 20;
```

---

## 5. 롤백 절차

### 5.1 전체 롤백 (마이그레이션 전 상태로 완전 복구)

**순서: 역순으로 실행**

```sql
-- Step 1: 트리거 제거 (item_stocks 갱신 중단)
DROP TRIGGER IF EXISTS trg_update_item_stock        ON transactions;
DROP TRIGGER IF EXISTS trg_update_stock_on_transfer ON transfers;

-- Step 2: 뷰 제거
DROP VIEW IF EXISTS v_low_stock_alert;
DROP VIEW IF EXISTS v_ledger;

-- Step 3: 신규 테이블 제거
DROP TABLE IF EXISTS item_stocks;
DROP TABLE IF EXISTS safety_stocks;

-- Step 4: 함수 제거
REVOKE EXECUTE ON FUNCTION fn_recalculate_item_stocks(UUID) FROM authenticated;
DROP FUNCTION IF EXISTS fn_recalculate_item_stocks(UUID);
DROP FUNCTION IF EXISTS fn_update_item_stock();
DROP FUNCTION IF EXISTS fn_update_item_stock_on_transfer();

-- Step 5: 추가된 컬럼 제거 (기존 데이터 영향 없음)
-- transactions
ALTER TABLE transactions DROP COLUMN IF EXISTS item_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS warehouse_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS vendor_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS txn_date;

-- transfers
ALTER TABLE transfers DROP COLUMN IF EXISTS item_id;
ALTER TABLE transfers DROP COLUMN IF EXISTS from_warehouse_id;
ALTER TABLE transfers DROP COLUMN IF EXISTS to_warehouse_id;
ALTER TABLE transfers DROP COLUMN IF EXISTS date_d;

-- stocktake_items
ALTER TABLE stocktake_items DROP COLUMN IF EXISTS warehouse_id;
ALTER TABLE stocktake_items DROP COLUMN IF EXISTS unit_price;
ALTER TABLE stocktake_items DROP COLUMN IF EXISTS diff_qty;
```

### 5.2 부분 롤백 (섹션별)

각 섹션의 `-- ROLLBACK SECTION N:` 주석 아래 SQL을 참조.
섹션 롤백 시 반드시 해당 섹션보다 이후 섹션을 먼저 롤백해야 합니다 (역순 원칙).

### 5.3 Phase 3 롤백 (NOT NULL 추가 후)

```sql
ALTER TABLE transactions   ALTER COLUMN item_id           DROP NOT NULL;
ALTER TABLE transfers      ALTER COLUMN item_id           DROP NOT NULL;
ALTER TABLE transfers      ALTER COLUMN from_warehouse_id DROP NOT NULL;
ALTER TABLE transfers      ALTER COLUMN to_warehouse_id   DROP NOT NULL;
```

---

## 6. Phase 3 전환 체크리스트 (NOT NULL 추가 전 확인사항)

아래 항목을 모두 통과한 후에만 Phase 3 SQL을 실행합니다.

### DB 레이어 확인

- [ ] Phase 2 검증 쿼리 실행 결과: `transactions.item_id NULL = 0`
- [ ] Phase 2 검증 쿼리 실행 결과: `transfers.item_id NULL = 0`
- [ ] Phase 2 검증 쿼리 실행 결과: `transfers.from_warehouse_id NULL = 0`
- [ ] Phase 2 검증 쿼리 실행 결과: `transfers.to_warehouse_id NULL = 0`
- [ ] item_stocks 데이터 검증: 캐시 수량과 계산 수량 차이 행 = 0

### 앱 레이어 확인

- [ ] `db.js` 변환 함수 추가 완료 (`itemStocks`, `safetyStocks`)
- [ ] 입고 등록(transactions INSERT) 시 `item_id` 필드 전송 확인
- [ ] 출고 등록 시 `item_id` + `warehouse_id` 필드 전송 확인
- [ ] 창고 이동 등록(transfers INSERT) 시 `item_id`, `from_warehouse_id`, `to_warehouse_id` 전송 확인
- [ ] `store.js` 상태 키 추가: `itemStocks: []`, `safetyStocks: []`
- [ ] 현재고 조회 로직: `item.quantity` -> `itemStocks` 집계로 변경 확인
- [ ] `pages/InventoryPage.jsx` 현재고 표시 정상 확인
- [ ] `pages/InoutPage.jsx` 입출고 등록 후 item_stocks 반영 확인
- [ ] 안전재고 미달 알람 표시 확인 (v_low_stock_alert)

### 운영 확인

- [ ] 스테이징 환경에서 Phase 3 실행 성공 확인
- [ ] 롤백 절차 테스트 완료
- [ ] 피크 타임 외 시간대 실행 일정 확정

---

## 7. 안전재고 마이그레이션 절차

### 7.1 현재 구조 (마이그레이션 전)

```
user_settings 테이블
  key = 'safetyStock'
  value = {"품목명A": 100, "품목명B": 50, ...}  -- JSONB
```

### 7.2 목표 구조 (마이그레이션 후)

```
safety_stocks 테이블
  (user_id, item_id, warehouse_id=NULL, min_qty=100)  -- 품목명A
  (user_id, item_id, warehouse_id=NULL, min_qty=50)   -- 품목명B
```

### 7.3 마이그레이션 실행 (SECTION 13)

SECTION 13 SQL은 다음 조건으로 변환합니다.
- `user_settings.key = 'safetyStock'` 행 대상
- JSONB 키(품목명) -> `items.id` 조인 (동일 user_id + item_name 기준)
- `warehouse_id = NULL` (전체 창고 통합 기준, 기존 동작과 동일)
- 이미 삽입된 행은 `ON CONFLICT ... DO UPDATE`로 min_qty 갱신

### 7.4 품목명 불일치 처리

JSONB의 품목명이 `items.item_name`과 다를 경우 JOIN에서 누락됩니다.

```sql
-- 누락된 품목명 확인 (마이그레이션 후 실행)
SELECT kv.item_name, us.user_id
FROM user_settings us
CROSS JOIN LATERAL jsonb_each_text(us.value) AS kv(item_name, value)
WHERE us.key = 'safetyStock'
  AND NOT EXISTS (
    SELECT 1 FROM items i
    WHERE i.user_id = us.user_id AND i.item_name = kv.item_name
  );
```

누락된 항목은 앱 UI에서 수동 재입력하거나 items 테이블의 item_name을 확인해 수동 처리합니다.

### 7.5 마이그레이션 완료 후 user_settings 보존

`user_settings.key='safetyStock'` 행은 삭제하지 않습니다.
앱 코드가 safety_stocks 테이블 사용으로 전환된 후 수동으로 정리합니다.

---

## 8. 앱 코드 변경 타임라인

DB 마이그레이션과 앱 배포는 하위 호환성을 유지하면서 진행합니다.

```
Day 0: DB 마이그레이션 (SECTION 1~13)
  - 신규 컬럼은 모두 NULL 허용
  - 기존 컬럼 유지 (레거시 앱 정상 동작)
  - 트리거는 item_id/warehouse_id NULL이면 item_stocks 갱신 건너뜀

Day 0~7: 앱 코드 변경 + 스테이징 검증
  - db.js: itemStocks, safetyStocks CRUD 함수 추가
  - store.js: itemStocks: [], safetyStocks: [] 상태 키 추가
  - 입출고 등록: item_id + warehouse_id 필드 전송 추가
  - 창고 이동 등록: item_id, from/to_warehouse_id 전송 추가
  - 현재고 조회: items.quantity -> itemStocks 집계로 교체
  - pages/InventoryPage.jsx: item_stocks 기반 표시
  - pages/InoutPage.jsx: item_id 기반 등록

Day 7~14: 프로덕션 배포 (앱 코드)
  - 신규 앱: item_id 포함 INSERT -> 트리거가 item_stocks 자동 갱신
  - 기존 데이터: 이미 백필 완료 -> item_stocks에 반영됨

Day 14~30: Phase 2 검증
  - NULL 행 모니터링 (백필되지 않은 레거시 데이터)
  - 품목명 매핑 오류 수동 보정

Day 30+: Phase 3 (Phase 2 검증 통과 후)
  - transactions.item_id NOT NULL
  - transfers.item_id, from/to_warehouse_id NOT NULL
  - items.quantity 컬럼 deprecated 표시 (삭제는 별도 일정)
```

---

## 9. 성능 분석가 전달 사항

- `item_stocks(user_id, item_id)` 인덱스가 P1 패턴(전체 품목 현재고 대시보드)의 핵심
- `item_stocks(user_id, warehouse_id)` 인덱스가 P2 패턴(창고별 집계)의 핵심
- `transactions(user_id, txn_date DESC)` 인덱스는 수불대장 날짜 범위 조회에 사용
- `idx_item_stocks_zero` 부분 인덱스: quantity <= 0 행만 인덱싱하여 재고 소진 알람 쿼리 최적화
- 대규모 백필(S6~S8) 중 idx 인덱스 빌드 추가 비용 발생 — 피크 타임 외 실행 권장
- `v_ledger` 뷰의 `current_stock` 컬럼은 item_stocks 직접 조회(O(1)) — 기존 SUM 집계 대비 극적 개선
- 기존 `mv_inventory_summary` Materialized View가 존재한다면 items.quantity -> item_stocks.quantity로 재정의 필요

---

## 10. 보안 감사자 전달 사항

- `item_stocks`, `safety_stocks` 신규 테이블: RLS 활성화 + `auth.uid() = user_id` 정책 적용 (SECTION 1, 2)
- `fn_update_item_stock`, `fn_update_item_stock_on_transfer`: `SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp` 적용하여 search_path 인젝션 방지
- `fn_recalculate_item_stocks`: 함수 내부 `auth.uid() != target_user_id` 검사로 타 사용자 데이터 재계산 차단
- `v_ledger`, `v_low_stock_alert` 뷰: 기반 테이블(transactions, safety_stocks)의 RLS가 뷰를 통해 자동 적용
- SECTION 12의 확인 쿼리로 RLS ON 상태와 정책 존재 여부 검증 가능
- `fn_recalculate_item_stocks` GRANT: `authenticated` 역할에만 EXECUTE 부여, `anon` 역할 제외

---

## 11. 마이그레이션 순서 요약표

| 순서 | 섹션 | 내용 | 의존 | 예상 시간(중규모) | 롤백 가능 |
|------|------|------|------|-----------------|----------|
| 1 | S1 | item_stocks 테이블 생성 | items, warehouses | <1초 | 가능 |
| 2 | S2 | safety_stocks 테이블 생성 | items, warehouses | <1초 | 가능 |
| 3 | S3 | transactions 컬럼 4개 추가 | items, warehouses, vendors | 2~5초 | 가능 |
| 4 | S4 | transfers 컬럼 4개 추가 | items, warehouses | 1~3초 | 가능 |
| 5 | S5 | stocktake_items 컬럼 보강 | warehouses | <1초 | 가능 |
| 6 | S6 | 백필: transactions.warehouse_id | S3 | 10~60초 | 불필요 |
| 7 | S7 | 백필: transactions.vendor_id | S3 | 10~60초 | 불필요 |
| 8 | S8 | 백필: item_id + 날짜 | S3, S4 | 30초~3분 | 불필요 |
| 9 | S9 | 트리거 함수 설치 | S1 | <1초 | 가능 |
| 10 | S10 | item_stocks 초기 데이터 계산 | S8, S9 | 10~60초 | 가능 (TRUNCATE) |
| 11 | S11 | 뷰 생성 | S1, S2, S9 | <1초 | 가능 |
| 12 | S12 | RLS 확인 (검증 쿼리) | 전체 | <1초 | - |
| 13 | S13 | 안전재고 마이그레이션 | S2 | <1초 | 가능 |
| 14 | Phase 3 | NOT NULL 제약 추가 | S8 완료 + 앱 배포 | 별도 일정 | 가능 |
