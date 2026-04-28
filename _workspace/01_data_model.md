# 데이터 모델 설계 문서 — INVEX ERP-Lite

> 분석 기준일: 2026-04-28
> 분석 대상: `supabase/schema.sql` (762줄), `supabase/fix-profiles-rls-hr.sql`

---

## 설계 개요

- **DBMS**: PostgreSQL (Supabase 호스팅)
- **정규화 수준**: 대체로 2NF~3NF, 일부 의도적 비정규화(TEXT 외래키)
- **테이블 수**: 18개 (재고/거래 12 + HR 5 + 팀 워크스페이스 1)
- **멀티테넌트 격리**: 모든 테이블 `user_id UUID FK + RLS`
- **핵심 액세스 패턴**:
  - 품목 목록 조회 (창고/카테고리 필터)
  - 입출고 이력 조회 (날짜 범위 + 타입 필터)
  - 월별 급여 집계 (직원별)
  - 안전재고 이하 품목 알림

---

## ERD (Mermaid)

```mermaid
erDiagram
    auth_users ||--|| profiles : "1:1 (trigger auto-create)"
    profiles ||--o{ items : "1:N user_id"
    profiles ||--o{ transactions : "1:N user_id"
    profiles ||--o{ vendors : "1:N user_id"
    profiles ||--o{ transfers : "1:N user_id"
    profiles ||--o{ stocktakes : "1:N user_id"
    profiles ||--o{ audit_logs : "1:N user_id"
    profiles ||--o{ account_entries : "1:N user_id"
    profiles ||--o{ purchase_orders : "1:N user_id"
    profiles ||--o{ pos_sales : "1:N user_id"
    profiles ||--o{ custom_fields : "1:N user_id"
    profiles ||--o{ user_settings : "1:N user_id (PK)"
    profiles ||--o{ employees : "1:N user_id"
    profiles ||--o{ salary_items : "1:N user_id"
    profiles ||--|{ team_workspaces : "1:1 owner_id (TEXT)"

    items ||--o{ transactions : "1:N item_id (nullable)"

    employees ||--o{ attendance : "1:N employee_id"
    employees ||--o{ payrolls : "1:N employee_id"
    employees ||--o{ leaves : "1:N employee_id"

    items {
        UUID id PK
        UUID user_id FK
        TEXT item_name
        TEXT item_code
        TEXT category
        NUMERIC quantity
        NUMERIC unit_price
        TEXT warehouse "(비정규화 — 창고 마스터 없음)"
        TEXT vendor "(비정규화 — vendors 테이블 미연결)"
        TEXT expiry_date "(TEXT — DATE 아님)"
        JSONB extra
    }

    transactions {
        UUID id PK
        UUID user_id FK
        UUID item_id FK_nullable
        TEXT item_name "(비정규화)"
        TEXT date "(TEXT — DATE 아님)"
        TEXT vendor "(비정규화 — FK 없음)"
        TEXT warehouse "(비정규화)"
        NUMERIC quantity
        NUMERIC unit_price
    }

    vendors {
        UUID id PK
        UUID user_id FK
        TEXT name
        TEXT type
        TEXT biz_number
    }

    purchase_orders {
        UUID id PK
        UUID user_id FK
        TEXT vendor "(TEXT — FK 없음)"
        JSONB items "(품목 라인 JSONB)"
        TEXT order_date "(TEXT — DATE 아님)"
        TEXT expected_date "(TEXT — DATE 아님)"
        TEXT status
    }

    employees {
        UUID id PK
        UUID user_id FK
        TEXT emp_no
        TEXT name
        TEXT dept "(부서 마스터 없음)"
        DATE hire_date
        BYTEA rrn_enc
        TEXT rrn_mask
        NUMERIC base_salary
        JSONB insurance_flags
        INTEGER dependents
    }

    payrolls {
        UUID id PK
        UUID user_id FK
        UUID employee_id FK
        INT pay_year
        INT pay_month
        NUMERIC gross
        JSONB allowances
        JSONB other_deduct
        NUMERIC net
        TEXT status
        UUID confirmed_by "(profiles FK 없음)"
    }

    leaves {
        UUID id PK
        UUID user_id FK
        UUID employee_id FK
        TEXT leave_type
        DATE start_date
        DATE end_date
        NUMERIC days
        TEXT status
        UUID approved_by "(profiles FK 없음)"
    }

    team_workspaces {
        TEXT id PK "(UUID 아닌 TEXT)"
        TEXT owner_id "(TEXT — UUID FK 아님)"
        JSONB members "(멤버 목록 비정규화)"
    }
```

---

## 테이블별 정규화 평가

| 테이블 | 정규화 수준 | 비고 |
|--------|-----------|------|
| profiles | 2NF — 부분 함수 종속 없음, 단 `subscription JSONB`·`payment_history JSONB` 반복그룹 | 결제 이력은 별도 테이블 권장 |
| items | 2NF — `warehouse TEXT`·`vendor TEXT`가 문자열로 비정규화 | 의도적 비정규화, 창고 마스터 없음 |
| transactions | 2NF — `item_name`, `vendor`, `warehouse` 중복 저장. `item_id` FK는 nullable | 이력성 데이터로 일부 비정규화 정당 |
| vendors | 3NF — 정상 | 양호 |
| transfers | 2NF — `from_warehouse`, `to_warehouse`, `item_name` 모두 TEXT. 날짜 `date TEXT` | 창고/품목 FK 없음 |
| stocktakes | 1NF 경계 — `details JSONB` 배열에 품목별 실사 데이터가 비구조화 저장 | 실사 라인 별도 테이블 권장 |
| audit_logs | 3NF — 정상. `detail TEXT`에 자유 텍스트 | 양호 |
| account_entries | 2NF — `vendor TEXT`로 FK 없음 | vendors 외래키 추가 권장 |
| purchase_orders | 1NF 경계 — `items JSONB` 배열에 발주 라인 비구조화. `vendor TEXT` | 발주 라인 별도 테이블 필요 |
| pos_sales | 3NF — 정상 (분석용 집계 데이터) | 양호 |
| custom_fields | 3NF — 정상 | 양호 |
| user_settings | 3NF — key-value 의도적 설계 | 양호 |
| employees | 2NF — `dept TEXT`(부서 마스터 없음), `allowances JSONB`(schema.sql 버전에만 존재, fix-hr.sql과 불일치) | 부서 테이블 권장 |
| attendance | 3NF — 정상. 중복 인덱스 존재(idx_att_month vs idx_att_emp_month) | 인덱스 정리 권장 |
| payrolls | 2NF — `confirmed_by UUID` 가 profiles FK 없음. schema.sql과 fix-hr.sql 컬럼 불일치(`base` vs `base_salary` 등) | 두 파일 간 스키마 충돌 주의 |
| leaves | 2NF — `approved_by UUID` FK 없음. fix-hr.sql에서 `start_date`·`end_date` NOT NULL 추가됨 | 두 파일 간 차이 존재 |
| salary_items | 3NF — 정상. fix-hr.sql이 `code` NOT NULL, `formula TEXT` 컬럼 추가 | fix-hr.sql이 schema.sql보다 명세 우수 |
| team_workspaces | 1NF 경계 — `members JSONB`에 멤버 목록 비구조화. `id`·`owner_id`가 TEXT(UUID 아님) | 심각한 설계 문제 |

---

## 문제점 분류

### 필수 수정 (데이터 정합성·운영 위험)

**[1] schema.sql vs fix-profiles-rls-hr.sql 스키마 충돌**

두 파일이 동일 테이블(employees, payrolls 등)을 다르게 정의합니다. 프로덕션에 어느 버전이 적용되었는지 불명확합니다.

| 테이블 | schema.sql | fix-hr.sql |
|--------|-----------|------------|
| employees | `phone`, `email`, `address`, `memo`, `status`, `annual_leave_total`/`annual_leave_used` 있음 | 없음. 대신 `allowances JSONB` 있음 |
| payrolls | `base`, `gross` | `base_salary`, `gross_pay` |
| payrolls | `other_deduct JSONB` | `deductions JSONB` + `other_deduct JSONB` (중복) |
| leaves | start_date/end_date nullable | NOT NULL |
| salary_items | `taxable`, `active` | `is_taxable`, `is_active`, `formula` |

권고: `schema.sql`을 단일 소스로 통합하고 fix-hr.sql의 개선 사항을 병합합니다.

**[2] team_workspaces — id·owner_id가 TEXT (UUID 타입 불일치)**

```sql
-- 현재 (문제)
id TEXT PRIMARY KEY
owner_id TEXT NOT NULL

-- 수정 필요
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
```

현재 구조는 `auth.uid()::text = owner_id` 비교로 우회하고 있으나, 조인 성능과 FK 무결성이 손상됩니다.

**[3] team_workspaces.members — JSONB 비정규화로 동시성 문제**

members JSONB 배열에 멤버 정보 전체를 저장합니다. RPC(workspace_add_member 등)로 원자성을 확보했으나, 멤버 수 증가 시 JSONB 전체 재기록이 발생하고 멤버 개별 쿼리(특정 멤버 상태 조회)가 비효율적입니다.

```sql
-- 권장 구조: workspace_members 별도 테이블
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('viewer','staff','manager','admin')),
  status TEXT NOT NULL DEFAULT '초대중' CHECK (status IN ('초대중','active','rejected')),
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  UNIQUE(workspace_id, member_id)
);
```

**[4] purchase_orders.items — JSONB 발주 라인**

발주 라인이 JSONB 배열로 저장되어 다음이 불가합니다.
- 특정 품목의 발주 이력 조회 (`WHERE items @> ...` GIN 인덱스 없이 불가)
- 발주서↔입고 트랜잭션 연결 (어느 입고가 어느 발주에서 왔는지 추적 불가)

```sql
-- 권장: 발주 라인 정규화
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  received_qty NUMERIC DEFAULT 0,  -- 실제 입고 수량 (발주 대비 입고 추적)
  note TEXT
);
CREATE INDEX idx_poi_order ON purchase_order_items(order_id);
CREATE INDEX idx_poi_item ON purchase_order_items(item_id);
```

**[5] stocktakes.details — JSONB 실사 라인**

```sql
-- 권장: 실사 라인 정규화
CREATE TABLE stocktake_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  system_qty NUMERIC DEFAULT 0,   -- 시스템 재고
  actual_qty NUMERIC DEFAULT 0,   -- 실사 수량
  diff_qty NUMERIC GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
  note TEXT
);
```

**[6] 날짜 컬럼 TEXT 타입 다수**

| 테이블 | 컬럼 | 현재 타입 | 문제 |
|--------|------|---------|------|
| transactions | date | TEXT | 날짜 범위 쿼리 문자열 비교 → 인덱스 비효율 |
| transfers | date | TEXT | 동상 |
| account_entries | due_date, paid_date | TEXT | 만기일 계산, 연체 조회 불가 |
| purchase_orders | order_date, expected_date | TEXT | 납기 계산 불가 |
| items | expiry_date | TEXT | 유통기한 임박 알림 날짜 비교 불가 |
| pos_sales | sale_date | TEXT | 날짜 집계 비효율 |

```sql
-- 권장 마이그레이션 예시 (transactions)
ALTER TABLE transactions
  ADD COLUMN txn_date DATE;
UPDATE transactions
  SET txn_date = txn_date::DATE
  WHERE date ~ '^\d{4}-\d{2}-\d{2}$';
-- 데이터 확인 후 date 컬럼 삭제 및 txn_date → date 리네임
```

**[7] payrolls.confirmed_by / leaves.approved_by — FK 없는 UUID 참조**

```sql
-- 현재 (무결성 없음)
confirmed_by UUID
approved_by UUID

-- 수정
confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL
approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL
```

---

### 권장 개선 (데이터 품질·성능)

**[8] items/transactions의 vendor, warehouse — 문자열 FK**

현재 품목과 거래처가 이름 문자열로만 연결됩니다. 거래처 이름 변경 시 연결이 끊어집니다.

```sql
-- items 테이블에 FK 추가
ALTER TABLE items ADD COLUMN vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
-- 기존 데이터 마이그레이션
UPDATE items i SET vendor_id = v.id FROM vendors v WHERE v.user_id = i.user_id AND v.name = i.vendor;
```

창고의 경우 warehouses 마스터 테이블이 없습니다 (아래 누락 엔티티 참조).

**[9] transactions.item_id nullable FK — 일관성 없는 연결**

일부 트랜잭션은 item_id가 있고 일부는 없습니다. `ON DELETE SET NULL` 처리로 품목 삭제 시 이력의 item_id가 NULL이 되어 집계 쿼리에서 LEFT JOIN이 필요합니다. item_name으로 보완하고 있으나 이름 변경 시 조인 불가입니다.

**[10] profiles의 구독/결제 JSONB**

```sql
-- 현재
subscription JSONB DEFAULT '{}'
payment_history JSONB DEFAULT '[]'

-- 권장: 별도 테이블로 분리 (결제 이력 조회·집계 가능)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('free','pro','enterprise')),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id)
);
CREATE TABLE payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,0) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL,
  paid_at TIMESTAMPTZ,
  pg_tx_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**[11] employees의 annual_leave — 두 파일 간 컬럼 불일치**

schema.sql: `annual_leave_total NUMERIC(4,1)`, `annual_leave_used NUMERIC(4,1)`
fix-hr.sql: `annual_leave_days NUMERIC(5,1)`, `annual_leave_used NUMERIC(5,1)`

통일 필요. 또한 연차 부여·사용 이력이 없으므로 감사 추적 불가합니다.

```sql
-- 권장: 연차 이력 테이블
CREATE TABLE leave_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  accrual_year INTEGER NOT NULL,
  total_days NUMERIC(5,1) NOT NULL DEFAULT 15,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, employee_id, accrual_year)
);
```

**[12] employees의 부서 — TEXT 컬럼, 마스터 없음**

```sql
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE employees ADD COLUMN dept_id UUID REFERENCES departments(id) ON DELETE SET NULL;
```

**[13] account_entries.vendor — TEXT, vendors 테이블 미연결**

```sql
ALTER TABLE account_entries ADD COLUMN vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
```

**[14] purchase_orders.vendor — TEXT, vendors 테이블 미연결**

```sql
ALTER TABLE purchase_orders ADD COLUMN vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
```

**[15] items 금액 파생 컬럼 관리**

`supply_value`, `vat`, `total_price`가 모두 별도 컬럼으로 존재합니다. `total_price = supply_value + vat`인 경우 Generated Column으로 관리하거나 트리거로 자동 계산할 수 있습니다. 현재는 애플리케이션에서 수동으로 세 컬럼을 동기화해야 합니다.

---

### 양호 (유지)

**[A] audit_logs RLS — INSERT/SELECT 분리**

UPDATE/DELETE 차단으로 감사 로그 변조를 방지한 설계는 우수합니다.

**[B] employees.rrn_enc — BYTEA + RPC 암호화**

주민번호를 BYTEA로 저장하고 클라이언트에 AES 키를 노출하지 않는 RPC 패턴은 적절합니다. decrypt_rrn() 함수가 audit_log를 자동으로 기록하는 점도 우수합니다.

**[C] attendance UNIQUE(user_id, employee_id, work_date)**

하루 한 건 제약으로 중복 근태 입력을 DB 레벨에서 차단합니다.

**[D] payrolls UNIQUE(user_id, pay_year, pay_month, employee_id)**

월별 급여 중복 확정 방지 제약입니다.

**[E] update_updated_at() 트리거**

FOREACH ARRAY 패턴으로 여러 테이블에 updated_at 트리거를 일괄 적용한 것은 유지보수성이 높습니다.

**[F] handle_new_user() SECURITY DEFINER + search_path 고정**

schema injection 방어가 적용되어 있습니다.

**[G] transactions 복합 인덱스 idx_tx_composite(user_id, date DESC, type)**

출고/입고 탭별 필터링 쿼리에 최적화된 인덱스입니다.

---

## 누락 엔티티 및 추가 권장 DDL

### 창고 마스터 테이블 (높은 우선순위)

현재 창고 이름이 items, transactions, transfers 세 테이블에 TEXT로 분산 저장됩니다. 창고 이름 변경 시 세 테이블 전체를 UPDATE해야 합니다.

```sql
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  manager TEXT,
  phone TEXT,
  is_default BOOLEAN DEFAULT false,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_all" ON warehouses FOR ALL USING (auth.uid() = user_id);

-- 기존 items에 FK 컬럼 추가 (마이그레이션)
ALTER TABLE items ADD COLUMN warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE transfers ADD COLUMN from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE transfers ADD COLUMN to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;
```

### 발주서↔입고 연결 테이블 (높은 우선순위)

현재 발주서(purchase_orders)와 입고(transactions type='in')가 연결되지 않아 발주 대비 입고 현황 추적이 불가합니다.

```sql
-- transactions에 발주서 참조 추가
ALTER TABLE transactions ADD COLUMN order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;
CREATE INDEX idx_tx_order ON transactions(order_id) WHERE order_id IS NOT NULL;
```

### 구독/결제 이력 (중간 우선순위)

위 [10]번 항목 DDL 참조.

### 부서 마스터 (중간 우선순위)

위 [12]번 항목 DDL 참조.

### 연차 부여 이력 (중간 우선순위)

위 [11]번 항목 DDL 참조.

### 팀 워크스페이스 멤버 정규화 (높은 우선순위)

위 [3]번 항목 DDL 참조.

---

## JSONB 컬럼 사용 평가

| 테이블 | 컬럼 | 평가 | 근거 |
|--------|------|------|------|
| profiles | currency | 적절 | 코드+심볼+환율 3개 값이 항상 함께 사용됨 |
| profiles | subscription | 부적절 | 구독 상태/만료일 조회가 필요 → 별도 테이블 |
| profiles | payment_history | 부적절 | 결제 이력 조회·집계 필요 → 별도 테이블 |
| items | extra | 적절 | 커스텀 필드 값 저장 목적, 구조가 사용자마다 다름 |
| stocktakes | details | 부적절 | 실사 라인 수 제한 없음, 개별 조회/집계 필요 → 별도 테이블 |
| purchase_orders | items | 부적절 | 발주 라인 조회·집계·FK 연결 필요 → 별도 테이블 |
| employees | insurance_flags | 적절 | 4개 불리언 플래그, 4대보험 각각 독립 컬럼으로도 가능하나 확장성 고려 시 JSONB 허용 |
| payrolls | allowances | 조건부 적절 | salary_items 마스터와 연결된 수당 코드+금액 저장. GIN 인덱스 미적용 시 쿼리 비효율 |
| payrolls | other_deduct | 조건부 적절 | 비정형 공제 항목 저장. fix-hr.sql에서 deductions와 중복 존재 → 통합 필요 |
| team_workspaces | members | 부적절 | 멤버 개별 상태 변경, 역할 조회, 수 집계 필요 → 별도 테이블 |

---

## 관계 매트릭스

| 소스 | 대상 | 현재 관계 | FK 위치 | ON DELETE | 문제 |
|------|------|---------|--------|----------|------|
| auth.users | profiles | 1:1 | profiles.id | CASCADE | 정상 |
| profiles | items | 1:N | items.user_id | CASCADE | 정상 |
| profiles | transactions | 1:N | transactions.user_id | CASCADE | 정상 |
| profiles | vendors | 1:N | vendors.user_id | CASCADE | 정상 |
| items | transactions | 1:N (nullable) | transactions.item_id | SET NULL | item_id nullable로 일관성 없음 |
| profiles | purchase_orders | 1:N | purchase_orders.user_id | CASCADE | vendor TEXT, FK 없음 |
| purchase_orders | transactions | 연결 없음 | — | — | 발주↔입고 추적 불가 |
| profiles | employees | 1:N | employees.user_id | CASCADE | 정상 |
| employees | attendance | 1:N | attendance.employee_id | CASCADE | 정상 |
| employees | payrolls | 1:N | payrolls.employee_id | CASCADE | confirmed_by FK 없음 |
| employees | leaves | 1:N | leaves.employee_id | CASCADE | approved_by FK 없음 |
| profiles | team_workspaces | 1:1 | team_workspaces.owner_id (TEXT) | 없음 | UUID 아닌 TEXT, FK 없음 |
| items | transfers | 연결 없음 | — | — | item_name TEXT만, 품목 FK 없음 |
| vendors | account_entries | 연결 없음 | — | — | vendor TEXT만, FK 없음 |

---

## 비정규화 결정 평가

| 위치 | 비정규화 내용 | 정당성 | 동기화 방법 | 평가 |
|------|-------------|-------|-----------|------|
| transactions.item_name | 품목명 복사 | 이력 데이터 불변성 유지 (품목 삭제 후에도 이력 보존) | 없음 (의도적) | 정당 |
| transactions.vendor | 거래처명 복사 | 동상 | 없음 (의도적) | 정당 |
| transactions.warehouse | 창고명 복사 | 동상 | 없음 (의도적) | 정당 |
| items.warehouse TEXT | 창고명 비정규화 | 창고 마스터 미구축 | 창고 이름 변경 시 대량 UPDATE 필요 | 부적절 — 창고 마스터 구축 필요 |
| items.vendor TEXT | 거래처명 비정규화 | 빠른 개발 | 거래처 이름 변경 시 연결 끊어짐 | 개선 필요 |
| payrolls.allowances JSONB | 수당 상세 비정규화 | 급여 확정 시점 스냅샷 보존 | salary_items 변경해도 과거 급여에 영향 없음 | 정당 (스냅샷 목적) |
| team_workspaces.members JSONB | 멤버 목록 비정규화 | 단일 문서 조회 최적화 | RPC 3개로 원자적 수정 | 부적절 — 규모 증가 시 문제 |

---

## 향후 확장 영향도 분석

### 고급 회계 (복식부기) 모듈

chart_of_accounts(계정과목)와 journal_entries(분개장) 추가 시:

- **영향 없음**: 기존 테이블 변경 불필요
- **연결 필요**: account_entries → journal_entries 연결 (account_entries가 단식 장부이므로 복식 전환 시 데이터 마이그레이션 필요)
- **권장 추가 컬럼**: `account_entries`에 `account_code TEXT REFERENCES chart_of_accounts(code)` 추가

```sql
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, code)
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  description TEXT,
  ref_type TEXT,  -- 'transaction'|'account_entry'|'payroll'|'manual'
  ref_id UUID,    -- 연결 원본 ID
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit NUMERIC(15,2) DEFAULT 0,
  credit NUMERIC(15,2) DEFAULT 0,
  memo TEXT,
  CONSTRAINT debit_or_credit CHECK (debit = 0 OR credit = 0)
);
```

### CRM 모듈

- **vendors 테이블 확장**: `type` 컬럼에 'customer' 값이 이미 있어 기반 존재
- 그러나 customers 엔티티가 vendors와 혼용되면 비즈니스 의미가 불분명해짐
- 권장: vendors를 공급자 전용으로 유지하고 `customers` 별도 테이블 생성, 또는 `parties` 통합 테이블로 리팩토링

```sql
CREATE TABLE crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL CHECK (party_type IN ('customer','lead','partner')),
  company_name TEXT,
  contact_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  stage TEXT DEFAULT 'lead',  -- lead/qualified/proposal/closed_won/closed_lost
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 프로젝트 관리 모듈

- **영향 없음**: 기존 테이블 변경 불필요
- employees 테이블과 연결하여 담당자 지정 가능

---

## 마이그레이션 관리자 전달 사항

1. schema.sql과 fix-profiles-rls-hr.sql의 HR 테이블 정의 충돌을 해결하는 단일 마이그레이션 파일을 작성하세요. 특히 payrolls 테이블의 `base` vs `base_salary`, `other_deduct` 중복 컬럼을 처리해야 합니다.
2. TEXT 타입 날짜 컬럼(transactions.date, account_entries.due_date 등) 6개의 DATE 타입 전환 마이그레이션은 데이터 형식 검증(`date ~ '^\d{4}-\d{2}-\d{2}$'`) 후 단계적으로 실행하세요.
3. team_workspaces.id와 owner_id를 UUID 타입으로 전환할 때 기존 워크스페이스 RPC 3개(workspace_add_member 등)도 함께 수정이 필요합니다.
4. purchase_order_items 테이블 추가 후 기존 purchase_orders.items JSONB 데이터를 행으로 분해하는 마이그레이션 스크립트가 필요합니다.
5. warehouses 마스터 테이블 생성 후 items.warehouse, transfers.from_warehouse/to_warehouse의 기존 TEXT 값을 참조 ID로 변환하는 마이그레이션이 필요합니다.

## 성능 분석가 전달 사항

1. `payrolls.allowances`와 `payrolls.other_deduct` JSONB에 GIN 인덱스가 없습니다. 특정 수당 코드 집계 쿼리(`allowances->>'식대'`) 빈도가 높다면 GIN 인덱스 추가를 검토하세요.
2. `transactions.date`가 TEXT이므로 현재 `idx_tx_date ON transactions(user_id, date DESC)` 인덱스가 날짜 범위 쿼리(`WHERE date BETWEEN '2026-01-01' AND '2026-03-31'`)에서 문자열 정렬로 동작합니다. DATE 타입 전환 전까지 쿼리에서 ISO-8601 형식(`YYYY-MM-DD`) 준수를 보장하세요.
3. attendance 테이블에 `idx_att_month(user_id, work_date)`, `idx_att_emp(employee_id, work_date DESC)`, `idx_att_emp_month(user_id, employee_id, work_date)` 세 인덱스가 중복됩니다. `idx_att_emp_month`가 나머지 두 인덱스를 커버하므로 `idx_att_month`와 `idx_att_emp` 제거를 검토하세요.
4. `items` 테이블의 `idx_items_low_stock`은 partial index(`WHERE quantity <= min_stock`)입니다. `min_stock`이 NULL인 품목은 이 인덱스에 포함되지 않으므로 안전재고 알림 쿼리에서 NULL 처리를 확인하세요.

## 보안 감사자 전달 사항

1. `employees.rrn_enc`: AES 키가 `current_setting('app.rrn_key', true)`에서 읽힙니다. Supabase Vault 미사용 시 이 설정값의 저장 위치와 접근 권한을 감사하세요.
2. `profiles_select_for_invite` 정책이 인증된 사용자 전체에게 모든 프로필을 SELECT 허용합니다 (`USING (auth.uid() IS NOT NULL)`). 이는 이메일/이름 정보 대량 열람 경로가 됩니다. 초대 시 필요한 컬럼만 노출하는 RPC 또는 컬럼 레벨 정책으로 범위를 축소하세요.
3. `payrolls`, `leaves`의 `confirmed_by`/`approved_by`가 FK 없는 UUID입니다. 존재하지 않는 사용자 UUID를 삽입할 수 있어 승인 추적이 신뢰성을 잃습니다.
4. `team_workspaces` RLS `tw_select`는 인증된 모든 사용자가 모든 워크스페이스를 READ할 수 있습니다(`USING (true)`). members JSONB 안의 개인정보(이름, 이메일)가 노출될 수 있습니다.
5. `handle_new_user()` 함수에서 관리자 이메일이 하드코딩되어 있습니다. 소스 코드 접근자가 관리자 이메일을 파악할 수 있으며, 이메일 변경 시 DB 함수도 수동 갱신해야 합니다. DB 설정 테이블로 외부화를 검토하세요.
