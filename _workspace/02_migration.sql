-- ============================================================
-- INVEX ERP-Lite — 통합 마이그레이션 스크립트
-- 생성일: 2026-04-28
-- 대상 DBMS: PostgreSQL (Supabase 호스팅)
-- 실행 방법: Supabase SQL Editor에서 각 버전을 순서대로 실행
--
-- 주의사항:
--   1. 각 버전(V00X)은 독립적으로 실행 가능하나, 의존 관계를 반드시 준수
--   2. V002는 기존 team_workspaces 데이터가 있을 경우 UUID 변환 실패 가능
--      → 사전에 데이터 확인 필요 (아래 전처리 쿼리 참조)
--   3. V004 날짜 변환은 잘못된 형식 데이터를 NULL로 처리 (데이터 손실 없음)
--   4. Supabase 환경에서는 CONCURRENTLY 인덱스 생성 권장
-- ============================================================


-- ============================================================
-- === V001: payrolls 스키마 충돌 해소 (schema.sql ↔ fix-hr.sql) ===
-- 문제: schema.sql의 payrolls.base vs fix-hr.sql의 base_salary,
--       gross vs gross_pay, other_deduct 중복 등
-- 전략: schema.sql의 컬럼명(base, gross)을 표준으로 유지하되
--       fix-hr.sql 개선사항(salary_items.is_taxable 등) 병합
-- 의존: 없음
-- 예상 시간: 1초 미만 (DDL only, 데이터 없을 경우)
-- 위험도: LOW (ADD COLUMN IF NOT EXISTS — 멱등성 보장)
-- ============================================================

-- V001 UP: payrolls 및 salary_items 컬럼 통합 정규화

-- [V001-1] salary_items: fix-hr.sql의 개선된 컬럼명(is_taxable, is_active, formula) 추가
--   schema.sql에는 taxable, active 가 있으므로 신규 컬럼을 추가한 뒤
--   애플리케이션 코드가 새 컬럼을 사용하도록 전환 완료 후 구 컬럼 삭제 예정
ALTER TABLE salary_items
  ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN,
  ADD COLUMN IF NOT EXISTS formula    TEXT;

-- 기존 데이터를 새 컬럼으로 복사 (신규 컬럼이 NULL인 행만 대상)
UPDATE salary_items
SET
  is_taxable = taxable,
  is_active  = active
WHERE is_taxable IS NULL OR is_active IS NULL;

-- 새 행 삽입 시 기본값 설정
ALTER TABLE salary_items
  ALTER COLUMN is_taxable SET DEFAULT true,
  ALTER COLUMN is_active  SET DEFAULT true;

-- [V001-2] payrolls: fix-hr.sql에서 base_salary, gross_pay, deductions 컬럼이
--   별도 정의된 경우를 대비해 기존 컬럼(base, gross)의 별칭 컬럼을 뷰 형태로 제공
--   (실제 프로덕션 DB에 fix-hr.sql이 적용되었을 경우 아래 컬럼 추가가 필요)
ALTER TABLE payrolls
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,0),
  ADD COLUMN IF NOT EXISTS gross_pay   NUMERIC(12,0),
  ADD COLUMN IF NOT EXISTS deductions  JSONB DEFAULT '{}';

-- 기존 base → base_salary, gross → gross_pay 데이터 복사
UPDATE payrolls
SET
  base_salary = base,
  gross_pay   = gross
WHERE base_salary IS NULL OR gross_pay IS NULL;

-- deductions가 비어있고 other_deduct에 데이터가 있으면 병합
UPDATE payrolls
SET deductions = other_deduct
WHERE (deductions = '{}' OR deductions IS NULL)
  AND other_deduct IS NOT NULL
  AND other_deduct != '{}';

COMMENT ON COLUMN payrolls.base        IS '[DEPRECATED] base_salary로 이전 예정. 이전 완료 후 삭제';
COMMENT ON COLUMN payrolls.gross       IS '[DEPRECATED] gross_pay로 이전 예정. 이전 완료 후 삭제';
COMMENT ON COLUMN payrolls.other_deduct IS '[DEPRECATED] deductions로 통합 예정. 이전 완료 후 삭제';
COMMENT ON COLUMN payrolls.base_salary IS 'V001: base 컬럼의 표준화된 대체 컬럼';
COMMENT ON COLUMN payrolls.gross_pay   IS 'V001: gross 컬럼의 표준화된 대체 컬럼';
COMMENT ON COLUMN payrolls.deductions  IS 'V001: other_deduct 통합. {항목코드: 금액} 형태';

-- V001 DOWN: payrolls 및 salary_items 추가 컬럼 제거
-- (주의: 이 롤백 실행 전 애플리케이션이 신규 컬럼을 사용하지 않는지 확인 필요)
-- ALTER TABLE salary_items
--   DROP COLUMN IF EXISTS is_taxable,
--   DROP COLUMN IF EXISTS is_active,
--   DROP COLUMN IF EXISTS formula;
-- ALTER TABLE payrolls
--   DROP COLUMN IF EXISTS base_salary,
--   DROP COLUMN IF EXISTS gross_pay,
--   DROP COLUMN IF EXISTS deductions;


-- ============================================================
-- === V002: team_workspaces.id / owner_id TEXT → UUID 변환 ===
-- 문제: TEXT PRIMARY KEY와 TEXT FK로 인한 UUID 조인 불일치,
--       RLS 정책에서 auth.uid()::text 우회 필요
-- 전략: 기존 값이 유효한 UUID 형식인지 검증 후 타입 변환
--       유효하지 않은 값은 사전 정리 필요 (아래 진단 쿼리 참조)
-- 의존: 없음 (team_workspaces는 독립 테이블)
-- 예상 시간: 데이터 건수에 비례 (일반적으로 1초 미만)
-- 위험도: HIGH — 기존 RPC 함수 3개도 동시 갱신 필요
--
-- 사전 확인 쿼리 (실행 전 반드시 검토):
--   SELECT id, owner_id
--   FROM team_workspaces
--   WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--      OR owner_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--   → 위 쿼리 결과가 0건이어야 V002 안전 실행 가능
-- ============================================================

-- V002 UP: TEXT → UUID 타입 변환 + FK 제약 + RLS 정책 재작성

-- [V002-1] 비UUID 형식 데이터 안전 처리
--   UUID 형식이 아닌 행은 변환 불가이므로 사전 삭제 또는 별도 보관
--   (운영 데이터 보호를 위해 삭제 전 백업 테이블 생성)
CREATE TABLE IF NOT EXISTS _migration_backup_team_workspaces AS
  SELECT * FROM team_workspaces
  WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR owner_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 비UUID 행 삭제 (UUID 형식이 아닌 레거시 데이터)
DELETE FROM team_workspaces
WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR owner_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- [V002-2] 기존 RLS 정책 삭제 (TEXT 타입 기준으로 작성된 정책)
DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
DROP POLICY IF EXISTS "tw_insert" ON team_workspaces;
DROP POLICY IF EXISTS "tw_update" ON team_workspaces;
DROP POLICY IF EXISTS "tw_delete" ON team_workspaces;

-- [V002-3] 기존 RPC 함수 삭제 (TEXT 파라미터 버전)
DROP FUNCTION IF EXISTS workspace_add_member(TEXT, JSONB);
DROP FUNCTION IF EXISTS workspace_remove_member(TEXT, TEXT);
DROP FUNCTION IF EXISTS workspace_set_member_status(TEXT, TEXT, TEXT);

-- [V002-4] 컬럼 타입을 TEXT에서 UUID로 변환
--   USING 절: 기존 TEXT 값을 UUID로 CAST
ALTER TABLE team_workspaces
  ALTER COLUMN id       TYPE UUID USING id::UUID,
  ALTER COLUMN owner_id TYPE UUID USING owner_id::UUID;

-- [V002-5] PRIMARY KEY 및 DEFAULT 재설정
--   새 레코드는 gen_random_uuid() 자동 생성
ALTER TABLE team_workspaces
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- [V002-6] owner_id FK 제약 추가
ALTER TABLE team_workspaces
  ADD CONSTRAINT team_workspaces_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- [V002-7] UUID 타입 기준으로 RLS 정책 재작성
CREATE POLICY "tw_select" ON team_workspaces
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tw_insert" ON team_workspaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "tw_update" ON team_workspaces
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "tw_delete" ON team_workspaces
  FOR DELETE USING (auth.uid() = owner_id);

-- [V002-8] RPC 함수 재작성 (UUID 파라미터 버전)
CREATE OR REPLACE FUNCTION workspace_add_member(ws_id UUID, new_member JSONB)
RETURNS VOID AS $$
DECLARE
  ws_owner UUID;
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION '워크스페이스를 찾을 수 없습니다.'; END IF;
  IF ws_owner != auth.uid() THEN RAISE EXCEPTION '팀장만 멤버를 초대할 수 있습니다.'; END IF;
  UPDATE team_workspaces
    SET members    = members || jsonb_build_array(new_member),
        updated_at = now()
    WHERE id = ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_add_member(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION workspace_remove_member(ws_id UUID, member_uid UUID)
RETURNS VOID AS $$
DECLARE
  ws_owner UUID;
  caller   UUID := auth.uid();
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION '워크스페이스를 찾을 수 없습니다.'; END IF;
  IF caller != ws_owner AND caller != member_uid THEN RAISE EXCEPTION '권한이 없습니다.'; END IF;
  IF member_uid = ws_owner THEN RAISE EXCEPTION '팀장은 제거할 수 없습니다.'; END IF;
  UPDATE team_workspaces
    SET members    = COALESCE((
          SELECT jsonb_agg(m)
          FROM jsonb_array_elements(members) m
          WHERE (m->>'uid')::UUID != member_uid
        ), '[]'::jsonb),
        updated_at = now()
    WHERE id = ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_remove_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION workspace_set_member_status(ws_id UUID, member_uid UUID, new_status TEXT)
RETURNS VOID AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  IF caller != member_uid THEN RAISE EXCEPTION '본인의 초대 상태만 변경할 수 있습니다.'; END IF;
  IF new_status NOT IN ('active', 'rejected') THEN RAISE EXCEPTION '유효하지 않은 상태값입니다.'; END IF;
  UPDATE team_workspaces
    SET members    = (
          SELECT jsonb_agg(
            CASE WHEN (m->>'uid')::UUID = member_uid
              THEN m || jsonb_build_object('status', new_status)
              ELSE m
            END
          )
          FROM jsonb_array_elements(members) m
        ),
        updated_at = now()
    WHERE id = ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_set_member_status(UUID, UUID, TEXT) TO authenticated;

-- V002 DOWN: UUID → TEXT 롤백
-- (주의: FK 제약, RLS 정책, RPC를 순서대로 되돌려야 함)
-- ALTER TABLE team_workspaces DROP CONSTRAINT IF EXISTS team_workspaces_owner_id_fkey;
-- DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
-- DROP POLICY IF EXISTS "tw_insert" ON team_workspaces;
-- DROP POLICY IF EXISTS "tw_update" ON team_workspaces;
-- DROP POLICY IF EXISTS "tw_delete" ON team_workspaces;
-- DROP FUNCTION IF EXISTS workspace_add_member(UUID, JSONB);
-- DROP FUNCTION IF EXISTS workspace_remove_member(UUID, UUID);
-- DROP FUNCTION IF EXISTS workspace_set_member_status(UUID, UUID, TEXT);
-- ALTER TABLE team_workspaces ALTER COLUMN id TYPE TEXT USING id::TEXT;
-- ALTER TABLE team_workspaces ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;
-- ALTER TABLE team_workspaces ALTER COLUMN id DROP DEFAULT;
-- CREATE POLICY "tw_select" ON team_workspaces FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "tw_insert" ON team_workspaces FOR INSERT WITH CHECK (auth.uid()::text = owner_id);
-- CREATE POLICY "tw_update" ON team_workspaces FOR UPDATE USING (auth.uid()::text = owner_id);
-- CREATE POLICY "tw_delete" ON team_workspaces FOR DELETE USING (auth.uid()::text = owner_id);
-- (이후 원본 TEXT 파라미터 버전 RPC 함수 재생성 필요)


-- ============================================================
-- === V003: workspace_members 테이블 생성 (team_workspaces.members JSONB 정규화) ===
-- 문제: members JSONB 배열로 인한 동시성 문제, 개별 멤버 쿼리 비효율
-- 전략: workspace_members 정규화 테이블 생성 후 JSONB 데이터 행으로 분해
--       team_workspaces.members JSONB는 하위 호환성을 위해 즉시 삭제하지 않음
-- 의존: V002 (team_workspaces.id가 UUID여야 FK 참조 가능)
-- 예상 시간: 1초 미만 (DDL) + 데이터 이전 시간 (건수 비례)
-- 위험도: MEDIUM — 기존 members JSONB를 읽는 애플리케이션 코드 별도 수정 필요
-- ============================================================

-- V003 UP: workspace_members 정규화 테이블 생성 + 기존 JSONB 데이터 이전

-- [V003-1] 정규화 멤버 테이블 생성
CREATE TABLE IF NOT EXISTS workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'staff'
                 CHECK (role IN ('viewer', 'staff', 'manager', 'admin')),
  status       TEXT NOT NULL DEFAULT '초대중'
                 CHECK (status IN ('초대중', 'active', 'rejected')),
  invited_at   TIMESTAMPTZ DEFAULT now(),
  joined_at    TIMESTAMPTZ,
  UNIQUE(workspace_id, member_id)
);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- 워크스페이스 소유자만 멤버 목록 조회 가능 (본인 멤버십도 조회 가능)
CREATE POLICY "wm_select" ON workspace_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_workspaces tw
      WHERE tw.id = workspace_id
        AND tw.owner_id = auth.uid()
    )
    OR member_id = auth.uid()
  );

-- 워크스페이스 소유자만 멤버 추가 가능
CREATE POLICY "wm_insert" ON workspace_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_workspaces tw
      WHERE tw.id = workspace_id
        AND tw.owner_id = auth.uid()
    )
  );

-- 소유자: 멤버 역할/상태 수정 가능, 멤버 본인: 본인 상태만 수정 가능
CREATE POLICY "wm_update" ON workspace_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM team_workspaces tw
      WHERE tw.id = workspace_id
        AND tw.owner_id = auth.uid()
    )
    OR member_id = auth.uid()
  );

-- 소유자 또는 본인만 멤버십 삭제 가능
CREATE POLICY "wm_delete" ON workspace_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM team_workspaces tw
      WHERE tw.id = workspace_id
        AND tw.owner_id = auth.uid()
    )
    OR member_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_member    ON workspace_members(member_id);

-- [V003-2] 기존 team_workspaces.members JSONB 데이터를 workspace_members 행으로 이전
--   members 배열 원소 구조: {uid, email, name, role, status, joinedAt}
--   uid 값이 유효한 UUID이고 profiles 테이블에 존재하는 경우만 이전
INSERT INTO workspace_members (workspace_id, member_id, role, status, invited_at, joined_at)
SELECT
  tw.id                                              AS workspace_id,
  (m->>'uid')::UUID                                  AS member_id,
  COALESCE(
    CASE WHEN m->>'role' IN ('viewer','staff','manager','admin') THEN m->>'role' END,
    'staff'
  )                                                  AS role,
  COALESCE(
    CASE WHEN m->>'status' IN ('초대중','active','rejected') THEN m->>'status' END,
    '초대중'
  )                                                  AS status,
  now()                                              AS invited_at,
  CASE WHEN m->>'joinedAt' IS NOT NULL
    THEN (m->>'joinedAt')::TIMESTAMPTZ
  END                                                AS joined_at
FROM team_workspaces tw,
     jsonb_array_elements(tw.members) AS m
WHERE tw.members != '[]'::jsonb
  AND tw.members IS NOT NULL
  AND (m->>'uid') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = (m->>'uid')::UUID
  )
ON CONFLICT (workspace_id, member_id) DO NOTHING;

-- [V003-3] 이전 완료 후 members JSONB 컬럼을 DEPRECATED 처리
--   즉시 삭제하지 않고 애플리케이션 코드 전환 후 별도 V00X에서 삭제 예정
COMMENT ON COLUMN team_workspaces.members
  IS '[DEPRECATED] workspace_members 테이블로 이전 완료. 다음 배포 사이클에 삭제 예정';

-- V003 DOWN: workspace_members 테이블 삭제 (데이터는 team_workspaces.members에 유지)
-- DROP TABLE IF EXISTS workspace_members;
-- COMMENT ON COLUMN team_workspaces.members IS NULL;


-- ============================================================
-- === V004: 날짜 컬럼 TEXT → DATE 변환 ===
-- 대상: transactions.date, account_entries.due_date, account_entries.paid_date
-- (purchase_orders.order_date/expected_date, transfers.date 는 Phase 2에서 처리)
-- 문제: 날짜 범위 쿼리 인덱스 비효율, 연체/만기 계산 불가
-- 전략: 새 DATE 컬럼 추가 → ISO-8601 형식 데이터만 변환 → 검증 후 OLD 컬럼 삭제
--       잘못된 형식 데이터는 NULL로 처리 (데이터 손실 없음, COMMENT로 추적)
-- 의존: 없음
-- 예상 시간: 데이터 건수 비례 (10만 건 기준 약 3~5초)
-- 위험도: MEDIUM — 인덱스 재생성 필요, 애플리케이션 컬럼명 변경 주의
-- ============================================================

-- V004 UP: 날짜 컬럼 TEXT → DATE 변환

-- [V004-1] transactions: date TEXT → txn_date DATE (신규 컬럼 추가)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS txn_date DATE;

-- ISO-8601(YYYY-MM-DD) 형식인 행만 변환
UPDATE transactions
SET txn_date = date::DATE
WHERE date ~ '^\d{4}-\d{2}-\d{2}$'
  AND txn_date IS NULL;

-- 변환 실패 케이스 로깅 (잘못된 형식 데이터 수 확인용)
-- SELECT COUNT(*) FROM transactions WHERE date IS NOT NULL AND txn_date IS NULL;
-- → 위 결과가 0이 아닌 경우 해당 행 데이터를 수동 검토 후 처리

-- 새 컬럼 NOT NULL 제약은 데이터 정리 후 별도 마이그레이션으로 추가
COMMENT ON COLUMN transactions.txn_date
  IS 'V004: date(TEXT) 컬럼의 DATE 타입 대체. date 컬럼 삭제 전까지 병행 운영';
COMMENT ON COLUMN transactions.date
  IS '[DEPRECATED] txn_date(DATE)로 이전 예정. 이전 완료 후 삭제';

-- txn_date 기반 새 인덱스 생성 (기존 TEXT 기반 인덱스와 병행)
CREATE INDEX IF NOT EXISTS idx_tx_txn_date
  ON transactions(user_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_tx_composite_date
  ON transactions(user_id, txn_date DESC, type);

-- [V004-2] account_entries: due_date TEXT → due_date_d DATE (신규 컬럼 추가)
ALTER TABLE account_entries
  ADD COLUMN IF NOT EXISTS due_date_d  DATE,
  ADD COLUMN IF NOT EXISTS paid_date_d DATE;

UPDATE account_entries
SET due_date_d = due_date::DATE
WHERE due_date ~ '^\d{4}-\d{2}-\d{2}$'
  AND due_date_d IS NULL;

UPDATE account_entries
SET paid_date_d = paid_date::DATE
WHERE paid_date ~ '^\d{4}-\d{2}-\d{2}$'
  AND paid_date_d IS NULL;

COMMENT ON COLUMN account_entries.due_date_d
  IS 'V004: due_date(TEXT) 컬럼의 DATE 타입 대체';
COMMENT ON COLUMN account_entries.paid_date_d
  IS 'V004: paid_date(TEXT) 컬럼의 DATE 타입 대체';
COMMENT ON COLUMN account_entries.due_date
  IS '[DEPRECATED] due_date_d(DATE)로 이전 예정. 이전 완료 후 삭제';
COMMENT ON COLUMN account_entries.paid_date
  IS '[DEPRECATED] paid_date_d(DATE)로 이전 예정. 이전 완료 후 삭제';

-- 연체 조회 최적화 인덱스 (만기일 기준)
CREATE INDEX IF NOT EXISTS idx_accounts_due_date
  ON account_entries(user_id, due_date_d)
  WHERE status = 'pending';

-- V004 DOWN: 추가 컬럼 및 인덱스 삭제
-- DROP INDEX IF EXISTS idx_tx_txn_date;
-- DROP INDEX IF EXISTS idx_tx_composite_date;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS txn_date;
-- DROP INDEX IF EXISTS idx_accounts_due_date;
-- ALTER TABLE account_entries
--   DROP COLUMN IF EXISTS due_date_d,
--   DROP COLUMN IF EXISTS paid_date_d;


-- ============================================================
-- === V005: FK 제약 추가 (payrolls.confirmed_by, leaves.approved_by → profiles.id) ===
-- 문제: UUID 컬럼이 profiles 테이블을 참조하지 않아 존재하지 않는
--       사용자 UUID가 삽입될 수 있어 승인 추적 신뢰성 손상
-- 전략: 고아 UUID(profiles에 없는 값) 정리 후 FK 제약 추가
-- 의존: 없음 (profiles 테이블은 schema.sql 기준 존재)
-- 예상 시간: 1초 미만
-- 위험도: LOW
-- ============================================================

-- V005 UP: FK 제약 추가

-- [V005-1] 고아 UUID 탐지 및 NULL 처리
--   profiles에 존재하지 않는 confirmed_by 값 → NULL로 초기화
UPDATE payrolls
SET confirmed_by = NULL
WHERE confirmed_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = payrolls.confirmed_by
  );

UPDATE leaves
SET approved_by = NULL
WHERE approved_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = leaves.approved_by
  );

-- [V005-2] FK 제약 추가
--   ON DELETE SET NULL: 관리자 계정 삭제 시 승인 정보 유지(행 삭제 없음)
ALTER TABLE payrolls
  ADD CONSTRAINT payrolls_confirmed_by_fkey
  FOREIGN KEY (confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE leaves
  ADD CONSTRAINT leaves_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- V005 DOWN: FK 제약 삭제
-- ALTER TABLE payrolls DROP CONSTRAINT IF EXISTS payrolls_confirmed_by_fkey;
-- ALTER TABLE leaves   DROP CONSTRAINT IF EXISTS leaves_approved_by_fkey;


-- ============================================================
-- === V006: warehouses 마스터 테이블 신규 생성 ===
-- 문제: 창고 이름이 items, transactions, transfers 세 테이블에
--       TEXT로 분산 저장되어 이름 변경 시 3개 테이블 전체 UPDATE 필요
-- 전략: warehouses 테이블 생성 → 기존 TEXT 값에서 고유 창고명 추출하여 시드 삽입
--       items/transfers에 warehouse_id FK 컬럼 추가 (TEXT 컬럼은 하위 호환 유지)
-- 의존: 없음
-- 예상 시간: DDL 1초 미만 + 데이터 이전 건수 비례
-- 위험도: LOW (기존 컬럼 유지, 신규 컬럼 추가만)
-- ============================================================

-- V006 UP: warehouses 마스터 테이블 생성 + FK 컬럼 추가

-- [V006-1] warehouses 마스터 테이블 생성
CREATE TABLE IF NOT EXISTS warehouses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  address    TEXT,
  manager    TEXT,
  phone      TEXT,
  is_default BOOLEAN DEFAULT false,
  memo       TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouses_all" ON warehouses
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_warehouses_user
  ON warehouses(user_id);

-- updated_at 트리거 연결
DO $$
BEGIN
  DROP TRIGGER IF EXISTS set_updated_at ON warehouses;
  CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
END $$;

-- [V006-2] 기존 items.warehouse, transfers.from_warehouse, transfers.to_warehouse
--   에서 고유 창고명을 추출하여 warehouses 테이블에 시드 삽입
--   (user_id별로 창고명이 중복 없이 삽입됨)
INSERT INTO warehouses (user_id, name, is_default)
SELECT DISTINCT user_id, warehouse, false
FROM items
WHERE warehouse IS NOT NULL AND warehouse != ''
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO warehouses (user_id, name, is_default)
SELECT DISTINCT user_id, from_warehouse, false
FROM transfers
WHERE from_warehouse IS NOT NULL AND from_warehouse != ''
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO warehouses (user_id, name, is_default)
SELECT DISTINCT user_id, to_warehouse, false
FROM transfers
WHERE to_warehouse IS NOT NULL AND to_warehouse != ''
ON CONFLICT (user_id, name) DO NOTHING;

-- transactions.warehouse도 추출 (items/transfers와 중복 가능하므로 ON CONFLICT 처리)
INSERT INTO warehouses (user_id, name, is_default)
SELECT DISTINCT user_id, warehouse, false
FROM transactions
WHERE warehouse IS NOT NULL AND warehouse != ''
ON CONFLICT (user_id, name) DO NOTHING;

-- [V006-3] items 테이블에 warehouse_id FK 컬럼 추가
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 기존 warehouse TEXT 값으로 warehouse_id 채우기
UPDATE items i
SET warehouse_id = w.id
FROM warehouses w
WHERE w.user_id = i.user_id
  AND w.name    = i.warehouse
  AND i.warehouse_id IS NULL;

COMMENT ON COLUMN items.warehouse_id
  IS 'V006: warehouse(TEXT) 컬럼의 FK 버전. 마이그레이션 완료 후 warehouse 컬럼 삭제 예정';
COMMENT ON COLUMN items.warehouse
  IS '[DEPRECATED] warehouse_id(UUID FK)로 이전 예정. 이전 완료 후 삭제';

-- [V006-4] transfers 테이블에 warehouse FK 컬럼 추가
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_warehouse_id   UUID REFERENCES warehouses(id) ON DELETE SET NULL;

UPDATE transfers t
SET from_warehouse_id = w.id
FROM warehouses w
WHERE w.user_id = t.user_id
  AND w.name    = t.from_warehouse
  AND t.from_warehouse_id IS NULL;

UPDATE transfers t
SET to_warehouse_id = w.id
FROM warehouses w
WHERE w.user_id = t.user_id
  AND w.name    = t.to_warehouse
  AND t.to_warehouse_id IS NULL;

COMMENT ON COLUMN transfers.from_warehouse_id
  IS 'V006: from_warehouse(TEXT)의 FK 버전';
COMMENT ON COLUMN transfers.to_warehouse_id
  IS 'V006: to_warehouse(TEXT)의 FK 버전';
COMMENT ON COLUMN transfers.from_warehouse
  IS '[DEPRECATED] from_warehouse_id로 이전 예정';
COMMENT ON COLUMN transfers.to_warehouse
  IS '[DEPRECATED] to_warehouse_id로 이전 예정';

-- [V006-5] warehouses 인덱스 추가 (items 창고별 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_items_warehouse_id
  ON items(user_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_transfers_from_wh
  ON transfers(user_id, from_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_transfers_to_wh
  ON transfers(user_id, to_warehouse_id);

-- Realtime 활성화
ALTER TABLE warehouses REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE warehouses;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- V006 DOWN: warehouses 테이블 및 FK 컬럼 삭제
-- ALTER TABLE items     DROP COLUMN IF EXISTS warehouse_id;
-- ALTER TABLE transfers DROP COLUMN IF EXISTS from_warehouse_id, DROP COLUMN IF EXISTS to_warehouse_id;
-- DROP INDEX  IF EXISTS idx_items_warehouse_id;
-- DROP INDEX  IF EXISTS idx_transfers_from_wh;
-- DROP INDEX  IF EXISTS idx_transfers_to_wh;
-- DROP TABLE  IF EXISTS warehouses;


-- ============================================================
-- 마이그레이션 완료 확인 쿼리
-- 실행 후 아래 SELECT 문으로 적용 결과 검증
-- ============================================================

-- V001 검증
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'payrolls' AND column_name IN ('base','gross','base_salary','gross_pay','deductions','other_deduct');
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'salary_items' AND column_name IN ('taxable','active','is_taxable','is_active','formula');

-- V002 검증
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'team_workspaces' AND column_name IN ('id','owner_id');
-- SELECT COUNT(*) FROM pg_constraint WHERE conname = 'team_workspaces_owner_id_fkey';

-- V003 검증
-- SELECT COUNT(*) FROM workspace_members;
-- SELECT COUNT(*) FROM team_workspaces WHERE jsonb_array_length(members) > 0;

-- V004 검증
-- SELECT COUNT(*) FROM transactions WHERE date IS NOT NULL AND txn_date IS NULL;
-- SELECT COUNT(*) FROM account_entries WHERE due_date IS NOT NULL AND due_date_d IS NULL;

-- V005 검증
-- SELECT COUNT(*) FROM pg_constraint WHERE conname IN ('payrolls_confirmed_by_fkey','leaves_approved_by_fkey');

-- V006 검증
-- SELECT COUNT(*) FROM warehouses;
-- SELECT COUNT(*) FROM items WHERE warehouse IS NOT NULL AND warehouse_id IS NULL;
