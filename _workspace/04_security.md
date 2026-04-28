# DB 보안 검증 보고서 — INVEX ERP-Lite

분석 기준일: 2026-04-28
분석 대상: `supabase/schema.sql`, `fix-profiles-rls.sql`, `fix-profiles-rls-hr.sql`, `_workspace/02_migration.sql`
대상 DBMS: PostgreSQL (Supabase 호스팅)
테이블 수: 18개 (+ 마이그레이션 추가 예정 2개)

---

## 보안 개요

| 항목 | 현황 |
|------|------|
| **데이터 분류** | 공개 / 내부 / 기밀 (PII 다수) / 극비 (주민번호 · 급여) |
| **규정 준수 대상** | 개인정보보호법(PIPA) · GDPR |
| **암호화 수준** | 주민번호: pgcrypto AES-256, 나머지 PII: 평문 |
| **인증** | Supabase Auth (JWT) — Google OAuth + 이메일/비밀번호 |
| **접근 제어** | RLS 전 테이블 활성화 |
| **감사 로깅** | audit_logs 테이블, decrypt_rrn() 호출 시 자동 기록 |

---

## RLS 정책 현황표

| 테이블 | RLS | SELECT | INSERT | UPDATE | DELETE | 비고 |
|--------|-----|--------|--------|--------|--------|------|
| profiles | ✅ | 자신 + 관리자 + **전체 인증 사용자(invite)** | 자신 | 자신(role 에스컬레이션 방지) | ❌ 없음 | profiles_select_for_invite 위험 |
| items | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| transactions | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| vendors | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| transfers | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| stocktakes | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| audit_logs | ✅ | user_id 일치 | user_id 일치 | **❌ 차단** | **❌ 차단** | 양호 — INSERT/SELECT 분리 |
| account_entries | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| purchase_orders | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| pos_sales | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| custom_fields | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| user_settings | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| employees | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| attendance | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| payrolls | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| leaves | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| salary_items | ✅ | user_id 일치 | user_id 일치 | user_id 일치 | user_id 일치 | FOR ALL |
| team_workspaces | ✅ | **전체 인증 사용자** | owner_id | owner_id | owner_id | tw_select USING(true) 위험 |

---

## 🔴 보안 취약점 (즉시 수정 필요)

### [CRIT-01] profiles_select_for_invite — 전체 사용자 프로필 무제한 열람
- **분류**: CWE-359, OWASP A01:2021 Broken Access Control
- **위치**: `schema.sql:342`
- **위험**: 인증된 모든 사용자가 전체 사용자의 email, name, photo_url, role, plan, subscription, payment_history를 SELECT 가능

```sql
-- 즉시 적용
DROP POLICY IF EXISTS "profiles_select_for_invite" ON profiles;

-- 초대 전용 RPC (이메일로 단일 프로필만 조회)
CREATE OR REPLACE FUNCTION get_profile_by_email(lookup_email TEXT)
RETURNS TABLE(id UUID, name TEXT, email TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '인증 필요'; END IF;
  RETURN QUERY
    SELECT p.id, p.name, p.email FROM profiles p
    WHERE p.email = lookup_email LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION get_profile_by_email(TEXT) TO authenticated;
```

---

### [CRIT-02] team_workspaces.tw_select — 전체 워크스페이스 무제한 열람
- **분류**: CWE-359, OWASP A01:2021
- **위치**: `schema.sql:661`
- **위험**: members JSONB에 저장된 타 기업 임직원 이름·이메일·역할을 전체 조회 가능

```sql
-- V002 완료 직후 임시 제한 (단계 1)
DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
CREATE POLICY "tw_select" ON team_workspaces
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- V003(workspace_members) 완료 후 확장 (단계 2)
DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
CREATE POLICY "tw_select" ON team_workspaces
  FOR SELECT USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = team_workspaces.id
        AND wm.member_id = auth.uid()
        AND wm.status = 'active'
    )
  );
```

---

### [CRIT-03] 관리자 이메일 하드코딩
- **분류**: CWE-798 (Hard-coded Credentials), CWE-269 (Privilege Management)
- **위치**: `schema.sql:71`, `fix-profiles-rls.sql:21`, `fix-profiles-rls-hr.sql:27`

```sql
-- system_config 테이블로 외부화
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO system_config (key, value)
VALUES ('admin_emails', '["sinbi0214@naver.com","sinbi850403@gmail.com","admin@invex.io.kr"]')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_config_no_access" ON system_config FOR SELECT USING (false);

-- handle_new_user() 함수 재작성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE admin_emails JSONB;
BEGIN
  SELECT value INTO admin_emails FROM system_config WHERE key = 'admin_emails';
  INSERT INTO public.profiles (id, name, email, photo_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '사용자'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN admin_emails @> to_jsonb(lower(COALESCE(NEW.email, ''))) THEN 'admin'
      ELSE 'viewer'
    END
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
```

---

### [CRIT-04] app.rrn_key — NULL 키 방어 미흡
- **분류**: CWE-321, CWE-312
- **위험**: 키 미설정 시 NULL로 암호화 호출되어 취약한 암호문 생성 가능

```sql
CREATE OR REPLACE FUNCTION encrypt_rrn(plain TEXT)
RETURNS BYTEA AS $$
DECLARE rrn_key TEXT;
BEGIN
  rrn_key := current_setting('app.rrn_key', true);
  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    RAISE EXCEPTION 'app.rrn_key 미설정 또는 길이 부족 (최소 32자)';
  END IF;
  RETURN pgp_sym_encrypt(plain, rrn_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
-- 장기: Supabase Vault vault.decrypted_secrets 참조로 전환
```

---

### [CRIT-05] fix 파일 SECURITY DEFINER 함수 search_path 불완전
- **분류**: CWE-427
- **위치**: `fix-profiles-rls.sql:71`, `fix-profiles-rls-hr.sql:78`
- **위험**: `pg_catalog, pg_temp` 누락으로 schema injection 공격 가능

```sql
-- fix 파일의 모든 SECURITY DEFINER 함수를 재생성
-- $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
-- pg_catalog, pg_temp 반드시 포함
```

---

### [CRIT-06] employees.account_no / bank — 평문 저장
- **분류**: CWE-312, 개인정보보호법 제24조
- **위험**: 계좌번호 평문 — DB 백업/DBA 직접 접근 시 금융 정보 노출

```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS account_no_enc BYTEA,
  ADD COLUMN IF NOT EXISTS account_no_mask TEXT;

CREATE OR REPLACE FUNCTION set_employee_account(emp_id UUID, plain_account TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE employees
  SET account_no_enc  = pgp_sym_encrypt(plain_account, current_setting('app.rrn_key', true)),
      account_no_mask = overlay(plain_account PLACING repeat('*', length(plain_account)-4) FROM 1 FOR length(plain_account)-4)
  WHERE id = emp_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
```

---

## 🟡 권장 보안 개선

### [HIGH-01] profiles Realtime에서 결제 정보 브로드캐스트 차단

```sql
ALTER PUBLICATION supabase_realtime DROP TABLE profiles;
```

### [HIGH-02] payrolls 정책 작업별 분리 (확정 후 수정 불가)

```sql
DROP POLICY IF EXISTS "payrolls_all" ON payrolls;

CREATE POLICY "payrolls_select" ON payrolls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "payrolls_insert" ON payrolls FOR INSERT WITH CHECK (
  auth.uid() = user_id AND confirmed_by IS NULL AND status = '초안'
);
CREATE POLICY "payrolls_update" ON payrolls FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (OLD.status != '확정' OR NEW.status = OLD.status));
CREATE POLICY "payrolls_delete" ON payrolls FOR DELETE
  USING (auth.uid() = user_id AND status = '초안');
```

### [HIGH-03] 감사 이벤트 누락 — 트리거 추가

현재 자동 감사 기록은 decrypt_rrn() 1건뿐. 추가 필요:

```sql
-- 급여 상태 변경 감사
CREATE OR REPLACE FUNCTION audit_payroll_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (auth.uid(), 'payroll.statusChange', NEW.id::text,
            format('급여 상태: %s → %s (%s년 %s월)', OLD.status, NEW.status, NEW.pay_year, NEW.pay_month),
            (SELECT email FROM profiles WHERE id = auth.uid()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_payroll ON payrolls;
CREATE TRIGGER trg_audit_payroll AFTER UPDATE ON payrolls
  FOR EACH ROW EXECUTE FUNCTION audit_payroll_status_change();

-- 직원 삭제 감사
CREATE OR REPLACE FUNCTION audit_employee_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs(user_id, action, target, detail, user_email)
  VALUES (auth.uid(), 'employee.delete', OLD.id::text,
          format('직원 삭제: %s (사번: %s)', OLD.name, OLD.emp_no),
          (SELECT email FROM profiles WHERE id = auth.uid()));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_employee_delete ON employees;
CREATE TRIGGER trg_audit_employee_delete BEFORE DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION audit_employee_delete();

-- role 변경 감사
CREATE OR REPLACE FUNCTION audit_profile_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (auth.uid(), 'profile.roleChange', NEW.id::text,
            format('역할: %s → %s (%s)', OLD.role, NEW.role, NEW.email),
            (SELECT email FROM profiles WHERE id = auth.uid()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_profile_role ON profiles;
CREATE TRIGGER trg_audit_profile_role AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_profile_role_change();
```

### [MED-01] audit_logs ON DELETE CASCADE → SET NULL (감사 로그 보존)

```sql
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
```

### [MED-02] SECURITY DEFINER 함수 EXECUTE 권한 일관성

```sql
REVOKE EXECUTE ON FUNCTION encrypt_rrn(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION encrypt_rrn(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_employee_rrn(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_rrn(UUID) TO authenticated;
```

---

## 🟢 양호한 보안 설계

- **[GOOD-01]** audit_logs INSERT/SELECT만 허용, UPDATE/DELETE 차단 — 감사 로그 변조 방지
- **[GOOD-02]** schema.sql의 SECURITY DEFINER 함수 search_path 고정 (pg_catalog, pg_temp 포함)
- **[GOOD-03]** decrypt_rrn() — 주민번호 평문 조회 시 감사 로그 자동 기록
- **[GOOD-04]** profiles.role 자가 에스컬레이션 방지 (WITH CHECK으로 role 변경 차단)
- **[GOOD-05]** 18개 테이블 전체 RLS 활성화 + user_id = auth.uid() 패턴
- **[GOOD-06]** 주민번호 암호화를 서버 사이드 RPC로만 수행 (클라이언트 키 비노출)

---

## 민감 데이터 보호 현황

| 테이블 | 컬럼 | 분류 | 암호화 | 현황 |
|--------|------|------|--------|------|
| profiles | email, name | PII | 없음 | 취약 |
| profiles | payment_history | 기밀 | 없음 | **위험** |
| employees | rrn_enc | 극비 | AES-256 | 양호 |
| employees | account_no, bank | 기밀(금융) | 없음 | **위험** |
| employees | name, phone, address | PII | 없음 | 취약 |
| payrolls | gross, net 등 | 기밀 | 없음 | 주의 |
| vendors | bank_info | 기밀 | 없음 | 취약 |

---

## 개인정보 보호 체크리스트 (한국 PIPA)

- [x] 주민번호 암호화 저장 (제24조) — pgcrypto AES 적용
- [ ] **계좌번호 암호화** — 평문 저장 위험 (CRIT-06)
- [ ] **전체 프로필 접근 제한** — profiles_select_for_invite 삭제 (CRIT-01)
- [ ] **역할 기반 접근 제어** — viewer/staff/manager DB 레벨 미구현
- [x] 접근 기록 보관 (제29조) — audit_logs 존재
- [ ] **접근 기록 보존 기간** — 6개월~2년 정책 미정의
- [ ] **개인정보 파기 익명화** — 탈퇴 시 CASCADE 삭제만, 익명화 없음
- [ ] **급여 데이터 5년 보존** (소득세법 제70조) — 자동 파기 정책 없음
- [ ] **수탁사 관리** — Supabase(미국) 개인정보 처리 위탁 계약 필요

---

## 우선순위 요약

| 순위 | ID | 항목 | 예상 공수 |
|------|-----|------|---------|
| 1 | CRIT-01 | profiles_select_for_invite 삭제 + RPC 대체 | 1시간 |
| 2 | CRIT-02 | tw_select 정책 제한 (2단계) | 1시간 |
| 3 | CRIT-04 | app.rrn_key NULL 방어 + Vault 이전 계획 | 2시간 |
| 4 | CRIT-05 | fix 파일 search_path 재고정 | 30분 |
| 5 | CRIT-03 | 관리자 이메일 system_config 외부화 | 2시간 |
| 6 | CRIT-06 | account_no 암호화 | 3시간 |
| 7 | HIGH-02 | payrolls 정책 작업별 분리 | 2시간 |
| 8 | HIGH-03 | 감사 트리거 3개 추가 | 3시간 |
| 9 | MED-01 | audit_logs ON DELETE SET NULL | 30분 |
| 10 | MED-02 | profiles Realtime publication 제거 | 30분 |
