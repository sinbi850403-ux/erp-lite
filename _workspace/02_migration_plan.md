# 마이그레이션 계획서 — INVEX ERP-Lite

> 작성일: 2026-04-28
> 대상: Supabase PostgreSQL (schema.sql 762줄, 18개 테이블)
> 기준: data-modeler 분석 보고서(01_data_model.md) 필수 수정 항목

---

## 마이그레이션 개요

- **도구**: Supabase SQL Editor (단일 파일 실행) / 향후 Flyway 또는 Supabase CLI Migrations로 전환 권장
- **총 마이그레이션 수**: 6개 (V001~V006)
- **예상 총 실행 시간**: 10초 미만 (현재 데이터 건수 기준, 대규모 데이터 시 V004/V006 증가)
- **무중단 필요 여부**: V002, V004 실행 시 주의 필요 (서비스 점검 시간 권장)

---

## 마이그레이션 버전 관리 체계

### 현재 상태 (단일 파일)

현재 스키마 관리는 `supabase/schema.sql` 단일 파일과 `supabase/fix-profiles-rls-hr.sql` 패치 파일로 이루어져 있습니다. 이 구조는 다음 문제를 야기합니다.

- 두 파일 간 동일 테이블 정의 충돌 (payrolls, employees, salary_items)
- 어느 버전이 프로덕션에 적용되었는지 추적 불가
- 롤백 절차 없음

### 권장 체계 (Supabase CLI Migrations)

```
supabase/
  migrations/
    20260101000000_initial_schema.sql      ← 현재 schema.sql 내용
    20260428000001_v001_payrolls_schema.sql
    20260428000002_v002_team_workspaces_uuid.sql
    20260428000003_v003_workspace_members.sql
    20260428000004_v004_date_columns.sql
    20260428000005_v005_fk_constraints.sql
    20260428000006_v006_warehouses.sql
```

Supabase CLI 사용 시: `supabase db push` 명령으로 미적용 마이그레이션만 순차 실행됩니다.

---

## 마이그레이션 순서

| 순서 | 버전 | 내용 | 의존 | 예상 시간 | 위험도 | 롤백 가능 |
|------|------|------|------|----------|--------|----------|
| 1 | V001 | payrolls/salary_items 컬럼 충돌 해소 | 없음 | <1초 | LOW | YES |
| 2 | V002 | team_workspaces TEXT→UUID 변환 + RPC 재작성 | 없음 | <1초 | HIGH | YES |
| 3 | V003 | workspace_members 정규화 테이블 생성 | V002 | <1초 + 데이터 이전 | MEDIUM | YES |
| 4 | V004 | 날짜 컬럼 TEXT→DATE 변환 (transactions, account_entries) | 없음 | 데이터 비례 | MEDIUM | YES |
| 5 | V005 | FK 제약 추가 (payrolls.confirmed_by, leaves.approved_by) | 없음 | <1초 | LOW | YES |
| 6 | V006 | warehouses 테이블 신규 생성 + FK 컬럼 추가 | 없음 | <1초 + 데이터 이전 | LOW | YES |

---

## 각 마이그레이션 상세

### V001 — payrolls/salary_items 스키마 충돌 해소

**전제조건**: 없음

**변경 내용**:
- `salary_items`: `taxable`/`active` 컬럼 유지하면서 `is_taxable`/`is_active`/`formula` 신규 추가, 기존 데이터 복사
- `payrolls`: `base`/`gross`/`other_deduct` 유지하면서 `base_salary`/`gross_pay`/`deductions` 신규 추가, 기존 데이터 복사

**결과**: 두 컬럼명이 공존하며 앱 코드를 새 컬럼명으로 점진 전환 가능. 구 컬럼은 DEPRECATED COMMENT 처리.

**롤백**: 신규 추가 컬럼만 DROP — 기존 데이터 영향 없음

**주의**: 프로덕션 DB에 fix-hr.sql이 이미 적용된 경우 `base_salary`, `gross_pay` 컬럼이 이미 존재할 수 있습니다. `ADD COLUMN IF NOT EXISTS`로 멱등성 보장.

---

### V002 — team_workspaces TEXT→UUID 타입 변환

**전제조건**:
1. 아래 쿼리로 비UUID 형식 데이터 없음을 확인:
   ```sql
   SELECT id, owner_id FROM team_workspaces
   WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR owner_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
   ```
2. 결과가 0건이어야 안전 실행 가능. 비UUID 행이 있으면 `_migration_backup_team_workspaces` 테이블로 백업 후 삭제.

**변경 내용**:
- `id`, `owner_id` 컬럼 타입 TEXT → UUID
- `owner_id`에 `REFERENCES profiles(id) ON DELETE CASCADE` FK 추가
- 기존 RLS 정책 3개 삭제 후 UUID 기준으로 재작성 (`auth.uid()::text` 제거)
- RPC 함수 3개(`workspace_add_member`, `workspace_remove_member`, `workspace_set_member_status`) 파라미터 타입 TEXT → UUID로 재작성

**클라이언트 코드 변경 필요**:
```javascript
// Before (기존)
supabase.rpc('workspace_add_member', { ws_id: 'text-uid-value', new_member: {...} })

// After (V002 적용 후 — UUID 그대로 사용, JS에서는 string이므로 동일)
supabase.rpc('workspace_add_member', { ws_id: uuid_value, new_member: {...} })
```

**비UUID 데이터 처리 절차**:
```
1. SELECT로 비UUID 행 탐지
2. _migration_backup_team_workspaces에 자동 백업
3. 비UUID 행 DELETE
4. ALTER COLUMN TYPE UUID USING id::UUID 실행
```

**롤백**: RPC 함수 삭제 → 정책 삭제 → ALTER COLUMN TYPE TEXT → 구 RPC/정책 재생성

---

### V003 — workspace_members 정규화 테이블 생성

**전제조건**: V002 완료 (team_workspaces.id가 UUID여야 FK 참조 가능)

**변경 내용**:
- `workspace_members` 신규 테이블 생성 (workspace_id UUID FK + member_id UUID FK)
- RLS 4개 정책 설정 (소유자/본인 기준)
- 기존 `team_workspaces.members` JSONB 배열을 행으로 분해하여 삽입
  - 유효 UUID 형식 + profiles 테이블 존재 확인 후에만 이전
  - `ON CONFLICT DO NOTHING`으로 멱등성 보장

**데이터 이전 로직**:
```sql
INSERT INTO workspace_members (workspace_id, member_id, role, status, joined_at)
SELECT tw.id, (m->>'uid')::UUID, role, status, joinedAt
FROM team_workspaces tw, jsonb_array_elements(tw.members) m
WHERE ... (UUID 형식 검증 + profiles 존재 확인)
ON CONFLICT DO NOTHING;
```

**team_workspaces.members 처리**: 즉시 삭제하지 않고 DEPRECATED COMMENT만 추가. 애플리케이션 코드가 workspace_members 테이블을 사용하도록 전환 완료 후 별도 마이그레이션(V00X)에서 컬럼 삭제.

**롤백**: `DROP TABLE workspace_members`

---

### V004 — 날짜 컬럼 TEXT→DATE 변환

**전제조건**: 없음 (독립 실행 가능)

**대상 컬럼 (이번 마이그레이션)**:
- `transactions.date` → `transactions.txn_date DATE`
- `account_entries.due_date` → `account_entries.due_date_d DATE`
- `account_entries.paid_date` → `account_entries.paid_date_d DATE`

**Phase 2에서 처리 예정** (이번 스코프 외):
- `transfers.date` → DATE
- `purchase_orders.order_date`, `purchase_orders.expected_date` → DATE
- `items.expiry_date`, `pos_sales.sale_date` → DATE

**잘못된 형식 데이터 처리 방안**:
```sql
-- 변환 전 형식 분포 확인
SELECT
  COUNT(*) FILTER (WHERE date ~ '^\d{4}-\d{2}-\d{2}$') AS valid_iso,
  COUNT(*) FILTER (WHERE date !~ '^\d{4}-\d{2}-\d{2}$' AND date IS NOT NULL) AS invalid,
  COUNT(*) FILTER (WHERE date IS NULL) AS null_count
FROM transactions;
```

잘못된 형식 행(`invalid` 카운트)은 `txn_date = NULL`로 처리됩니다. 운영 데이터에 날짜 형식이 혼재하는 경우 별도 정제 스크립트 실행 필요.

**기존 인덱스 처리**:
- `idx_tx_date ON transactions(user_id, date DESC)` — TEXT 기반 인덱스 유지 (하위 호환)
- `idx_tx_composite ON transactions(user_id, date DESC, type)` — TEXT 기반 유지
- 신규: `idx_tx_txn_date`, `idx_tx_composite_date` — DATE 기반 신규 추가

**컬럼 리네임 계획** (애플리케이션 전환 후 별도 마이그레이션):
```sql
-- txn_date → date 리네임 시
ALTER TABLE transactions DROP COLUMN date;
ALTER TABLE transactions RENAME COLUMN txn_date TO date;
DROP INDEX idx_tx_date;         -- TEXT 기반 구 인덱스 삭제
DROP INDEX idx_tx_composite;    -- TEXT 기반 구 인덱스 삭제
```

**롤백**: 신규 컬럼(txn_date, due_date_d, paid_date_d) 및 신규 인덱스 삭제

---

### V005 — FK 제약 추가

**전제조건**: 없음

**변경 내용**:
- `payrolls.confirmed_by UUID → REFERENCES profiles(id) ON DELETE SET NULL`
- `leaves.approved_by UUID → REFERENCES profiles(id) ON DELETE SET NULL`

**고아 UUID 처리**:
- FK 추가 전, profiles에 없는 UUID는 NULL로 업데이트
- 실제 고아 데이터 존재 시 승인자 이력이 유실되므로 사전 확인 권장:
  ```sql
  SELECT COUNT(*) FROM payrolls
  WHERE confirmed_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = payrolls.confirmed_by);
  ```

**ON DELETE SET NULL 선택 이유**: 관리자 계정이 삭제되더라도 급여 확정/휴가 승인 이력 행 자체는 보존되어야 하므로 CASCADE(행 삭제) 대신 SET NULL을 선택.

**롤백**: `ALTER TABLE payrolls DROP CONSTRAINT payrolls_confirmed_by_fkey`

---

### V006 — warehouses 마스터 테이블 신규 생성

**전제조건**: 없음

**변경 내용**:
1. `warehouses` 테이블 신규 생성 (user_id, name UNIQUE, is_default 등)
2. RLS 정책 1개: `auth.uid() = user_id`
3. `updated_at` 트리거 연결
4. Realtime 활성화
5. 기존 TEXT 창고명 추출 → warehouses 시드 삽입 (items, transactions, transfers에서 DISTINCT 수집)
6. `items.warehouse_id UUID FK` 컬럼 추가 + 기존 warehouse TEXT로 역참조 채우기
7. `transfers.from_warehouse_id`, `transfers.to_warehouse_id` UUID FK 컬럼 추가 + 채우기

**시드 데이터 이전 로직**:
```sql
-- items, transactions, transfers 세 테이블에서 창고명 수집 (ON CONFLICT DO NOTHING으로 중복 처리)
INSERT INTO warehouses (user_id, name, is_default)
SELECT DISTINCT user_id, warehouse, false FROM items WHERE warehouse IS NOT NULL
ON CONFLICT (user_id, name) DO NOTHING;
-- (transfers.from_warehouse, to_warehouse, transactions.warehouse 동일 처리)
```

**FK 컬럼 채우기**:
```sql
UPDATE items i SET warehouse_id = w.id
FROM warehouses w WHERE w.user_id = i.user_id AND w.name = i.warehouse;
```

**transactions.warehouse 처리**: transactions는 이력 데이터로 비정규화가 정당하므로 이번 마이그레이션에서 warehouse_id FK 컬럼 추가는 하지 않습니다. 창고 이름 변경 전파 문제가 없는 이력 데이터는 TEXT 보존이 적절합니다.

**롤백**: FK 컬럼 및 인덱스 DROP → warehouses 테이블 DROP

---

## 데이터 마이그레이션 절차

### team_workspaces.members JSONB → workspace_members 테이블

```
1. V002 실행 (TEXT → UUID 변환)
2. V003 실행 (workspace_members 생성)
3. 이전 결과 검증:
   SELECT wm.workspace_id, COUNT(*) AS member_count
   FROM workspace_members wm GROUP BY workspace_id;
   
   SELECT tw.id, jsonb_array_length(tw.members) AS jsonb_count
   FROM team_workspaces tw WHERE jsonb_array_length(tw.members) > 0;
   
   -- 두 쿼리의 workspace_id별 카운트가 일치해야 함
4. 애플리케이션 코드를 workspace_members 테이블 사용으로 전환
5. 전환 완료 후 team_workspaces.members 컬럼 삭제:
   ALTER TABLE team_workspaces DROP COLUMN members;
```

### 날짜 컬럼 단계적 전환

```
1. V004 실행 (신규 DATE 컬럼 추가, 기존 TEXT 컬럼 유지)
2. 잘못된 형식 데이터 수동 정제 (NULL인 txn_date 행 처리)
3. 애플리케이션 코드에서 신규 컬럼(txn_date, due_date_d 등)으로 전환
4. 기존 TEXT 컬럼 및 인덱스 삭제 (별도 마이그레이션):
   ALTER TABLE transactions DROP COLUMN date;
   ALTER TABLE transactions RENAME COLUMN txn_date TO date;
```

---

## 롤백 전략

### 전체 롤백 순서

의존 관계 역순으로 롤백합니다:

```
V006 롤백 → V005 롤백 → V004 롤백 → V003 롤백 → V002 롤백 → V001 롤백
```

각 버전의 롤백 SQL은 `02_migration.sql` 파일 내 각 버전 말미에 주석 처리된 상태로 포함되어 있습니다.

### 버전별 롤백 위험도

| 버전 | 롤백 난이도 | 데이터 손실 위험 | 주의사항 |
|------|-----------|----------------|----------|
| V001 | 쉬움 | 없음 | 신규 컬럼 DROP만 |
| V002 | 어려움 | 없음 | RLS/RPC 원복 필요 |
| V003 | 쉬움 | workspace_members 데이터 삭제 | 재이전 가능 |
| V004 | 쉬움 | 없음 | 신규 컬럼 DROP만 |
| V005 | 쉬움 | 없음 | 제약 DROP만 |
| V006 | 쉬움 | 없음 | 컬럼/테이블 DROP |

---

## Supabase 무중단 마이그레이션 체크리스트

| 항목 | 내용 | 해당 버전 |
|------|------|----------|
| CONCURRENTLY 인덱스 | 인덱스 생성 시 테이블 잠금 없이 생성 (대규모 데이터) | V004, V006 |
| ADD COLUMN IF NOT EXISTS | 컬럼 추가는 테이블 잠금 최소화 | V001, V003, V004, V006 |
| ALTER COLUMN TYPE | 타입 변환 시 테이블 REWRITE 발생 가능 — 점검 시간 권장 | V002 |
| RLS 정책 교체 | DROP → CREATE 사이 무정책 구간 최소화 (트랜잭션 내 실행) | V002 |
| 고아 데이터 사전 정리 | FK 추가 전 참조 무결성 위반 행 제거 | V005 |
| 백업 확인 | Supabase 자동 백업 또는 pg_dump 실행 후 진행 | 전체 |
| 사용자 통보 | 점검 시간 사전 공지 (V002 실행 시) | V002 |

### V002 실행 시 추가 체크리스트

```
[ ] team_workspaces 전체 행 수 확인
[ ] 비UUID 형식 행 0건 확인 (사전 쿼리 실행)
[ ] Supabase 대시보드 백업 스냅샷 생성
[ ] 클라이언트 코드 RPC 파라미터 타입 확인
[ ] 실행 후 RPC 3개 정상 동작 테스트
[ ] workspace.js 내 auth.uid()::text 참조 제거 확인
```

---

## 성능 분석가 전달 사항

1. **V004 완료 후 인덱스 재검토**: `idx_tx_date`(TEXT 기반)와 `idx_tx_txn_date`(DATE 기반)가 일시 공존합니다. 애플리케이션 전환 완료 후 TEXT 기반 인덱스 3개(`idx_tx_date`, `idx_tx_composite`) 삭제를 권장합니다.

2. **V006 완료 후 items 인덱스 재검토**: `idx_items_warehouse`(TEXT 기반)와 `idx_items_warehouse_id`(UUID FK 기반)가 공존합니다. `warehouse_id` 기반 조회로 전환 완료 후 `idx_items_warehouse` 삭제를 권장합니다.

3. **workspace_members 인덱스**: V003에서 `idx_wm_workspace`, `idx_wm_member` 두 인덱스를 추가했습니다. 멤버 수가 수백 건 이상이라면 `idx_wm_workspace` 인덱스가 특히 중요합니다.

4. **V004 DATE 컬럼 전환 후 기대 효과**: `transactions.txn_date` 기반 날짜 범위 쿼리(`BETWEEN`)가 인덱스 스캔으로 처리되어 TEXT 기반 대비 10배 이상 성능 향상이 예상됩니다.

---

## 보안 감사자 전달 사항

1. **V002 RLS 재작성**: 기존 `tw_insert`/`tw_update`/`tw_delete`에서 `auth.uid()::text = owner_id`(TEXT 비교)를 `auth.uid() = owner_id`(UUID 비교)로 교체합니다. TEXT 비교는 암묵적 캐스팅에 의존하므로 타입 안전성이 낮았습니다.

2. **V003 workspace_members RLS**: `tw_select USING (true)` 정책으로 모든 인증 사용자가 모든 워크스페이스를 조회할 수 있던 문제를 해결하지는 못했습니다 (team_workspaces 자체 정책 유지). workspace_members 테이블은 소유자 또는 본인만 조회 가능한 정책으로 신규 설계했습니다. 보안 감사자는 `tw_select USING (true)` 정책 범위 축소 여부를 별도 검토하세요.

3. **V005 FK 추가**: `payrolls.confirmed_by`, `leaves.approved_by`에 profiles FK를 추가함으로써 존재하지 않는 사용자 UUID 삽입이 방지됩니다. 승인 추적 신뢰성이 DB 레벨에서 보장됩니다.

4. **_migration_backup_team_workspaces 테이블**: V002에서 비UUID 행 백업용으로 생성됩니다. 마이그레이션 완료 후 해당 테이블에 RLS를 설정하거나 삭제하세요:
   ```sql
   -- 마이그레이션 완료 후 정리
   DROP TABLE IF EXISTS _migration_backup_team_workspaces;
   ```
