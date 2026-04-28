# 성능 최적화 보고서 — INVEX ERP-Lite

분석 기준일: 2026-04-28
대상: `supabase/schema.sql` (762줄), `_workspace/02_migration.sql` (V001~V006)

---

## 성능 목표

| 지표 | 목표 |
|------|------|
| 예상 데이터 규모 | items: 10만 행/테넌트, transactions: 100만 행/테넌트, attendance: 36만 행/테넌트(직원 50명×20일×365일), payrolls: 6만 행/테넌트 |
| 읽기/쓰기 비율 | 70:30 (조회 중심, 엑셀 업로드 일괄 쓰기 포함) |
| p50 목표 | < 30ms |
| p99 목표 | < 200ms |
| 배치 INSERT | 엑셀 업로드 1~5,000행/회, < 10초 허용 |

---

## 1. 현재 인덱스 평가

### 전체 인덱스 목록 및 평가

| # | 인덱스명 | 테이블 | 컬럼 | 타입 | 평가 | 비고 |
|---|---------|--------|------|------|------|------|
| 1 | idx_items_user | items | (user_id) | B-Tree | **중복** | idx_items_category 등 복합 인덱스가 user_id 선두 포함 |
| 2 | idx_items_category | items | (user_id, category) | B-Tree | 양호 | 카테고리 필터 쿼리에 효과적 |
| 3 | idx_items_warehouse | items | (user_id, warehouse) | B-Tree | 양호, V006 후 warehouse_id 버전으로 교체 필요 | |
| 4 | idx_items_vendor | items | (user_id, vendor) | B-Tree | 조건부 필요 | TEXT 벤더 필터링 빈도가 낮으면 제거 가능 |
| 5 | idx_items_low_stock | items | (user_id) WHERE quantity <= min_stock | B-Tree Partial | 양호 | min_stock NULL 품목 제외 주의 |
| 6 | idx_tx_user | transactions | (user_id) | B-Tree | **중복** | idx_tx_date, idx_tx_item이 user_id 선두 복합 인덱스로 커버 |
| 7 | idx_tx_date | transactions | (user_id, date DESC) | B-Tree | **부분 대체** | V004 후 idx_tx_txn_date로 완전 교체 예정 |
| 8 | idx_tx_item | transactions | (user_id, item_name) | B-Tree | 양호 | 품목별 이력 조회에 사용 |
| 9 | idx_tx_composite | transactions | (user_id, date DESC, type) | B-Tree | **핵심** | 입/출고 탭 필터 쿼리의 주 인덱스 |
| 10 | idx_vendors_user | vendors | (user_id) | B-Tree | 적절 | 거래처 목록 소규모 |
| 11 | idx_transfers_user | transfers | (user_id) | B-Tree | 미흡 | 날짜 정렬 쿼리 지원 없음 |
| 12 | idx_audit_user | audit_logs | (user_id, created_at DESC) | B-Tree | 양호 | |
| 13 | idx_accounts_user | account_entries | (user_id) | B-Tree | 미흡 | type, status 필터 미지원 |
| 14 | idx_pos_user | pos_sales | (user_id, sale_date DESC) | B-Tree | 양호 | |
| 15 | idx_emp_user | employees | (user_id) | B-Tree | **중복** | idx_emp_dept, idx_emp_status가 포함 |
| 16 | idx_emp_dept | employees | (user_id, dept) | B-Tree | 양호 | |
| 17 | idx_emp_status | employees | (user_id, status) | B-Tree | 양호 | |
| 18 | idx_att_user | attendance | (user_id) | B-Tree | **중복** | idx_att_emp_month으로 커버됨 |
| 19 | idx_att_month | attendance | (user_id, work_date) | B-Tree | **중복** | idx_att_emp_month의 접두 탐색으로 커버 |
| 20 | idx_att_emp | attendance | (employee_id, work_date DESC) | B-Tree | **중복** | idx_att_emp_month으로 커버 |
| 21 | idx_att_emp_month | attendance | (user_id, employee_id, work_date) | B-Tree | **핵심 — 유지** | 나머지 attendance 인덱스 3개 대체 |
| 22 | idx_payroll_user | payrolls | (user_id) | B-Tree | **중복** | idx_payroll_period가 포함 |
| 23 | idx_payroll_period | payrolls | (user_id, pay_year, pay_month) | B-Tree | **핵심** | |
| 24 | idx_payroll_emp | payrolls | (employee_id, pay_year, pay_month) | B-Tree | 양호 | |
| 25 | idx_payroll_status | payrolls | (user_id, status) | B-Tree | 양호 | |
| 26 | idx_leave_user | leaves | (user_id) | B-Tree | **중복** | idx_leave_status가 포함 |
| 27 | idx_leave_emp | leaves | (employee_id, start_date DESC) | B-Tree | 양호 | |
| 28 | idx_leave_status | leaves | (user_id, status, start_date DESC) | B-Tree | 양호 | |
| 29 | idx_salary_items_user | salary_items | (user_id) | B-Tree | 적절 | |

### 🔴 중복 인덱스 제거 DDL (즉시 실행 가능)

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_items_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_tx_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_att_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_att_month;
DROP INDEX CONCURRENTLY IF EXISTS idx_att_emp;
DROP INDEX CONCURRENTLY IF EXISTS idx_payroll_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_emp_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_leave_user;
```

---

## 2. 누락 인덱스

### 🔴 즉시 추가 필요

```sql
-- [누락-1] transactions: category 필터 + 날짜 범위 — 손익 분석 쿼리 핵심
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_analysis
  ON transactions(user_id, type, txn_date, category)
  INCLUDE (total_amount);

-- [누락-2] transactions: warehouse 필터
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_warehouse
  ON transactions(user_id, warehouse, txn_date DESC)
  WHERE warehouse IS NOT NULL;

-- [누락-3] items: item_name 검색
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_name
  ON items(user_id, item_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_name_text
  ON items(user_id, item_name text_pattern_ops);

-- [누락-4] account_entries: type + status 복합 필터
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_type_status
  ON account_entries(user_id, type, status)
  INCLUDE (amount, due_date_d);

-- [누락-5] purchase_orders: status + 날짜
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_po_status
  ON purchase_orders(user_id, status, order_date DESC)
  WHERE status != 'completed';

-- [누락-6] employees: 재직자 전용 부분 인덱스
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emp_active
  ON employees(user_id, name)
  WHERE status = 'active';

-- [누락-7] attendance: 전체 직원 월별 집계 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_date_range
  ON attendance(user_id, work_date, employee_id)
  INCLUDE (work_min, overtime_min, status);

-- [누락-8] transactions: item_id 기반 재고 집계
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_item_id
  ON transactions(item_id, user_id)
  WHERE item_id IS NOT NULL;
```

### 🟡 권장 추가

```sql
-- transactions: vendor 필터
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_vendor
  ON transactions(user_id, vendor, txn_date DESC)
  WHERE vendor IS NOT NULL;

-- payrolls.allowances JSONB GIN 인덱스
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_allowances_gin
  ON payrolls USING GIN (allowances);

-- items.extra JSONB GIN 인덱스
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_extra_gin
  ON items USING GIN (extra);

-- transfers: 날짜 정렬
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transfers_date
  ON transfers(user_id, date DESC);

-- audit_logs: action 타입 필터
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_action
  ON audit_logs(user_id, action, created_at DESC);
```

---

## 3. 쿼리 최적화

### 쿼리 1: 손익 분석 (V004 적용 후)

```sql
-- BEFORE (TEXT 날짜 기반)
SELECT category, SUM(total_amount) AS total
FROM transactions
WHERE user_id = $1 AND type = 'out'
  AND date >= $2 AND date <= $3
GROUP BY category ORDER BY total DESC;

-- AFTER (DATE 타입 + idx_tx_analysis 활용)
SELECT category, SUM(total_amount) AS total
FROM transactions
WHERE user_id = $1 AND type = 'out'
  AND txn_date >= $2::DATE AND txn_date <= $3::DATE
GROUP BY category ORDER BY total DESC;
-- 예상: 100만 행에서 Index-Only Scan으로 10~50배 속도 개선
```

### 쿼리 2: 월별 급여 계산 최적화

```sql
WITH period AS (
  SELECT
    make_date($2, $3, 1) AS period_start,
    make_date($2, $3, 1) + INTERVAL '1 month' - INTERVAL '1 day' AS period_end
),
att_summary AS (
  SELECT
    a.employee_id,
    COUNT(*) FILTER (WHERE a.status != '결근') AS work_days,
    SUM(a.overtime_min) AS total_overtime_min,
    SUM(a.work_min) AS total_work_min
  FROM attendance a, period
  WHERE a.user_id = $1
    AND a.work_date BETWEEN period.period_start AND period.period_end
  GROUP BY a.employee_id
)
SELECT
  e.name, e.emp_no, e.dept,
  p.base, p.gross, p.net, p.status,
  COALESCE(att.work_days, 0) AS work_days,
  COALESCE(att.total_overtime_min, 0) AS total_overtime_min
FROM payrolls p
JOIN employees e ON e.id = p.employee_id
LEFT JOIN att_summary att ON att.employee_id = p.employee_id
WHERE p.user_id = $1 AND p.pay_year = $2 AND p.pay_month = $3
ORDER BY e.name;
```

---

## 4. 파티셔닝 전략

| 테이블 | 현재 판단 | 도입 조건 |
|--------|----------|---------|
| transactions | 인덱스 최적화로 충분 | 단일 연도 500만 행/테넌트 이상 |
| audit_logs | 아카이빙 정책 우선 | 전체 1,000만 행 초과 |
| attendance | 파티셔닝 불필요 | - |

---

## 5. Supabase 특화 최적화

### Connection Pooling 권장 설정

| 파라미터 | 권장값 |
|----------|--------|
| Pool Mode | Transaction |
| Default Pool Size | 15 |
| Max Client Conn | 200 |
| Server Idle Timeout | 600초 |
| Query Timeout | 30초 |

### REPLICA IDENTITY FULL 오버헤드

- transactions, audit_logs는 INSERT-only 성격 → REPLICA IDENTITY DEFAULT로 전환 검토

```sql
ALTER TABLE audit_logs REPLICA IDENTITY DEFAULT;
-- transactions Realtime 구독 불필요 시
ALTER TABLE transactions REPLICA IDENTITY DEFAULT;
```

### 배치 INSERT 최적화

```sql
-- unnest() 활용으로 N개 단일 INSERT 대신 1회 요청
INSERT INTO transactions (user_id, type, item_name, quantity, unit_price, txn_date, vendor, warehouse)
SELECT $1, unnest($2::text[]), unnest($3::text[]), unnest($4::numeric[]),
       unnest($5::numeric[]), unnest($6::date[]), unnest($7::text[]), unnest($8::text[]);
```

---

## 6. Materialized View 권장

```sql
-- 재고 요약 뷰
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_inventory_summary AS
SELECT
  i.user_id, i.id AS item_id, i.item_name, i.category, i.warehouse,
  i.quantity, i.unit_price, i.min_stock,
  CASE WHEN i.min_stock IS NOT NULL AND i.quantity <= i.min_stock THEN true ELSE false END AS is_low_stock,
  COUNT(t.id) AS tx_count_90d,
  MAX(t.txn_date) AS last_tx_date
FROM items i
LEFT JOIN transactions t ON t.item_id = i.id
  AND t.txn_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY i.id, i.user_id, i.item_name, i.category, i.warehouse,
         i.quantity, i.unit_price, i.min_stock
WITH DATA;

CREATE UNIQUE INDEX ON mv_inventory_summary(user_id, item_id);

-- 월별 손익 요약 뷰
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_profit AS
SELECT
  user_id, date_trunc('month', txn_date)::DATE AS month,
  type, category,
  SUM(total_amount) AS total_amount, COUNT(*) AS tx_count
FROM transactions WHERE txn_date IS NOT NULL
GROUP BY user_id, date_trunc('month', txn_date), type, category
WITH DATA;
-- 갱신: 매일 자정 REFRESH MATERIALIZED VIEW CONCURRENTLY
```

---

## 7. 우선순위 실행 계획

### Phase 1 — 즉시 (CONCURRENTLY, 다운타임 없음)
1. 중복 인덱스 8개 제거
2. idx_tx_analysis 추가 (손익 쿼리 10~50배 개선)
3. idx_att_date_range 추가 (월별 급여 계산 최적화)
4. idx_tx_item_id 추가 (재고 JOIN 쿼리)
5. idx_emp_active 부분 인덱스 추가

### Phase 2 — V004 완료 후
- idx_tx_date, idx_tx_composite 삭제
- idx_tx_txn_date, idx_tx_composite_date 활성화

### Phase 3 — 데이터 규모 성장 시
- Materialized View 생성 및 갱신 스케줄
- payrolls GIN 인덱스
- transactions 파티셔닝 평가
