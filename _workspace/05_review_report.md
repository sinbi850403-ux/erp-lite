# DB 설계 통합 리뷰 보고서 — INVEX ERP-Lite

작성일: 2026-04-28
검토 범위: 5개 전문가 에이전트 산출물 교차 검증
상태: **수정 후 진행**

---

## 1. 종합 평가 요약

| 영역 | 점수 | 근거 |
|------|------|------|
| 데이터 모델 | B | 핵심 문제 진단 완료. 비정규화는 이력 데이터 기준 대체로 합리적 |
| 마이그레이션 DDL | B+ | V001~V006 DDL이 필수 수정 7건 중 5건 반영. 2건 미반영 |
| 성능 | B | 핵심 인덱스 존재, 중복 8개 제거 및 누락 8개 추가 필요 |
| 보안 | C | CRIT-01/02(전체 프로필·워크스페이스 노출) 마이그레이션 미포함 |
| 운영 준비 | B- | 롤백 스크립트 포함. RLS 무정책 구간, 백업 테이블 RLS 누락 등 운영 위험 존재 |

---

## 2. 교차 검증 매트릭스

### 데이터 모델 필수 수정 7건 vs 마이그레이션 반영

| # | 권고 항목 | 반영 여부 | 파일 |
|---|-----------|----------|------|
| [1] | payrolls 컬럼 충돌 해소 | ✅ V001 | 02_migration.sql |
| [2] | team_workspaces TEXT→UUID | ✅ V002 | 02_migration.sql |
| [3] | workspace_members 정규화 | ✅ V003 | 02_migration.sql |
| [4] | purchase_order_items 분리 | **❌ 미반영** | V007 추가 필요 |
| [5] | stocktake_items 분리 | **❌ 미반영** | V008 추가 필요 |
| [6] | 날짜 TEXT→DATE (일부) | ✅ V004 (부분) | transactions + account_entries만 |
| [7] | confirmed_by/approved_by FK | ✅ V005 | 02_migration.sql |

### 보안 취약점 vs 마이그레이션 반영

| ID | 취약점 | 마이그레이션 반영 |
|----|--------|----------------|
| CRIT-01 | profiles_select_for_invite 전체 노출 | **❌ 미반영** — 즉시 별도 패치 필요 |
| CRIT-02 | tw_select USING (true) 전체 노출 | **❌ V002에서 동일 취약 정책 재생성** |
| CRIT-04 | app.rrn_key NULL 방어 | ❌ 미반영 |
| CRIT-05 | fix 파일 search_path 불완전 | ❌ 미반영 |
| CRIT-03 | 관리자 이메일 하드코딩 | ❌ 미반영 (기능 동작하나 보안 위험) |
| CRIT-06 | account_no 평문 | ❌ 미반영 |
| V005 | confirmed_by FK 추가 | ✅ 반영 |

### 성능 ↔ 마이그레이션 정합성

- V004의 txn_date DATE 컬럼 전환 후 구버전 인덱스 삭제 DDL(V009) 미작성 — 기술 부채 발생 예정
- V006 후 idx_items_warehouse(TEXT) 삭제 DDL 누락
- Materialized View와 RLS 충돌 없음 (mv가 user_id별 행 포함)
- REPLICA IDENTITY FULL 제거(성능)와 Realtime 제거(보안)가 상호 보완적

---

## 3. 통합 실행 계획

### 🔴 즉시 적용 (V001 실행 전 필수)

**[즉시-1] CRIT-01: profiles_select_for_invite 삭제**

```sql
DROP POLICY IF EXISTS "profiles_select_for_invite" ON profiles;

CREATE OR REPLACE FUNCTION get_profile_by_email(lookup_email TEXT)
RETURNS TABLE(id UUID, name TEXT, email TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '인증 필요'; END IF;
  RETURN QUERY SELECT p.id, p.name, p.email FROM profiles p
    WHERE p.email = lookup_email LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION get_profile_by_email(TEXT) TO authenticated;
```

**[즉시-2] V002에 CRIT-02 보안 패치 추가**

V002 완료 직후 (workspace_members 생성 전 임시):
```sql
DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
CREATE POLICY "tw_select" ON team_workspaces
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
```

V003 완료 후 최종:
```sql
DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
CREATE POLICY "tw_select" ON team_workspaces
  FOR SELECT USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = team_workspaces.id
        AND wm.member_id = auth.uid() AND wm.status = 'active'
    )
  );
```

**[즉시-3] V002를 단일 트랜잭션으로 감싸기** (RLS 무정책 구간 방지)
```sql
BEGIN;
-- V002 전체 DDL
COMMIT;
```

**[즉시-4] _migration_backup_team_workspaces RLS 설정**
```sql
ALTER TABLE IF EXISTS _migration_backup_team_workspaces ENABLE ROW LEVEL SECURITY;
-- 마이그레이션 완료 확인 후 즉시 DROP
DROP TABLE IF EXISTS _migration_backup_team_workspaces;
```

---

### 단기 적용 (V001~V006 완료 후 1~2주)

**[단기-1] V007: purchase_order_items 테이블 생성**
```sql
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  received_qty NUMERIC DEFAULT 0,
  note TEXT
);
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_all" ON purchase_order_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_poi_order ON purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_poi_item ON purchase_order_items(item_id);

-- 기존 JSONB 데이터 이전
INSERT INTO purchase_order_items (user_id, order_id, item_name, quantity, unit_price)
SELECT po.user_id, po.id,
       (line->>'item_name')::TEXT,
       COALESCE((line->>'quantity')::NUMERIC, 0),
       COALESCE((line->>'unit_price')::NUMERIC, 0)
FROM purchase_orders po, jsonb_array_elements(po.items) AS line
WHERE po.items != '[]'::jsonb AND po.items IS NOT NULL
ON CONFLICT DO NOTHING;
```

**[단기-2] V008: stocktake_items 테이블 생성**
```sql
CREATE TABLE IF NOT EXISTS stocktake_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  system_qty NUMERIC DEFAULT 0,
  actual_qty NUMERIC DEFAULT 0,
  diff_qty NUMERIC GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
  note TEXT
);
ALTER TABLE stocktake_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sti_all" ON stocktake_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_sti_stocktake ON stocktake_items(stocktake_id);
```

**[단기-3] 성능 인덱스 즉시 추가**
→ 03_performance.md Phase 1 참조 (중복 8개 제거, 누락 8개 추가)

**[단기-4] CRIT-04: app.rrn_key NULL 방어**
→ 04_security.md CRIT-04 DDL 참조

---

### 중기 적용 (1~3개월)

- V009: TEXT 기반 인덱스 삭제 (V004 애플리케이션 전환 완료 후)
- V004 Phase 2: transfers.date, purchase_orders 날짜, items.expiry_date, pos_sales.sale_date → DATE
- CRIT-03: 관리자 이메일 system_config 외부화
- CRIT-06: account_no 암호화
- HIGH-02: payrolls 정책 작업별 분리
- HIGH-03: 감사 트리거 3개 추가 (급여 확정, 직원 삭제, role 변경)
- audit_logs ON DELETE CASCADE → SET NULL

### 장기 (3개월 이상)

- profiles.subscription/payment_history → 별도 테이블
- purchase_orders.vendor, account_entries.vendor → vendor_id FK
- Supabase Vault로 rrn_key 이전
- 팀 역할 기반 RLS 구현 (viewer/staff/manager DB 레벨 강제)
- Materialized View 생성 및 갱신 스케줄

---

## 4. 운영 준비성 체크리스트

### V002 실행 전
- [ ] team_workspaces 비UUID 형식 데이터 검증: `SELECT id FROM team_workspaces WHERE id !~ '^[0-9a-f-]{36}$'`
- [ ] Supabase 대시보드에서 수동 백업 생성
- [ ] [즉시-1] CRIT-01 패치 선적용 확인
- [ ] V002 전체를 BEGIN; ... COMMIT; 트랜잭션으로 실행

### V003 완료 후
- [ ] workspace_members 행 수 vs JSONB 배열 합계 일치 확인
- [ ] [즉시-2] CRIT-02 2단계 패치 (workspace_members 기반 정책) 적용

### V004 완료 후
- [ ] `SELECT COUNT(*) FROM transactions WHERE date IS NOT NULL AND txn_date IS NULL` = 0 확인
- [ ] 애플리케이션 코드가 txn_date 사용으로 전환된 후 V009 실행

### Lock 위험도

| 버전 | Lock 종류 | 예상 시간 | 점검 필요 |
|------|----------|---------|---------|
| V001 | AccessShareLock | <1초 | 불필요 |
| V002 | AccessExclusiveLock (ALTER TYPE) | 수초 | **권장** |
| V003 | 없음 (새 테이블) | <1초 | 불필요 |
| V004 | ADD COLUMN + UPDATE | 데이터 비례 | 대용량 시 권장 |
| V005 | ShareRowExclusiveLock | <1초 | 불필요 |
| V006 | 없음 (새 테이블 + ADD COLUMN) | <1초 | 불필요 |

---

## 5. 추가 발견 사항 (개별 에이전트 미지적)

### transactions.item_id nullable 의미 모호성
- item_id NULL = 품목 삭제 후 SET NULL인지, 처음부터 미연결인지 구분 불가
- 권고: `item_link_status TEXT DEFAULT 'unlinked' CHECK (...)`  컬럼 추가 또는 처리 규칙 명문화

### idx_tx_composite와 idx_tx_composite_date 공존 문제
- V004 후 두 인덱스가 유사 목적으로 공존 → V009에서 idx_tx_composite 삭제 필수

### purchase_orders.total_amount 자동 동기화 없음
- items JSONB 합계와 total_amount 불일치 가능
- V007(purchase_order_items) 완료 후 트리거 또는 Generated Column으로 자동 계산 권장

### items.UNIQUE(user_id, item_name)과 엑셀 업로드 충돌
- 엑셀 대량 업로드 시 중복 품목명 오류 발생 가능
- 애플리케이션에서 UPSERT `ON CONFLICT (user_id, item_name) DO UPDATE` 사용 여부 확인 필요

---

## 6. 향후 확장 대비 권고

### Phase 3 — 고급 회계 (복식부기)
- account_entries에 `account_code TEXT` 컬럼 사전 추가 권장
- `chart_of_accounts` + `journal_entries` + `journal_lines` 3개 테이블로 기존 변경 최소화
- journal_lines: `CONSTRAINT debit_or_credit CHECK (debit = 0 OR credit = 0)` 필수

### Phase 4 — CRM
- vendors.type에 'customer' 혼재 → `crm_contacts` 별도 테이블 권장
- `crm_contacts.assigned_to UUID REFERENCES profiles(id)` — RLS 정책 확장 필요

### Phase 5 — 프로젝트 관리
- 기존 스키마 충돌 없음, employees + project_members 조인으로 담당자 연결
- user_settings K-V 누적 방지를 위해 프로젝트 전용 설정 테이블 별도 생성 권장

### 공통
- 모든 신규 테이블: `user_id FK + RLS FOR ALL USING (auth.uid() = user_id)` 패턴 일관 적용
- `created_at`, `updated_at` + `update_updated_at()` 트리거 표준화
- structured audit 필드 추가 고려: `ref_type TEXT, ref_id UUID, changes JSONB`

---

## 최종 산출물 체크리스트

- [x] 01_data_model.md — 데이터 모델 (ERD, 정규화 평가, 누락 엔티티)
- [x] 02_migration.sql — 마이그레이션 V001~V006 (UP + 롤백 주석)
- [x] 02_migration_plan.md — 마이그레이션 계획서
- [x] 03_performance.md — 인덱스 전략 및 쿼리 최적화
- [x] 04_security.md — 보안 감사 (RLS, 암호화, 감사 로깅)
- [x] 05_review_report.md — 통합 리뷰 (이 파일)
- [ ] V007 — purchase_order_items 마이그레이션 (단기 추가 필요)
- [ ] V008 — stocktake_items 마이그레이션 (단기 추가 필요)
- [ ] V009 — TEXT 기반 인덱스 삭제 (V004 전환 후)
- [ ] CRIT-01/02 보안 패치 DDL — V001 실행 전 즉시 적용
