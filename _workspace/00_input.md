# INVEX ERP-Lite — DB 설계 분석 입력

## 프로젝트 개요
- **서비스명**: INVEX (인벡스) — 중소기업 맞춤 재고·경영 관리 SaaS
- **DBMS**: PostgreSQL (Supabase 호스팅)
- **인증**: Supabase Auth (auth.uid() 기반 RLS 적용 중)
- **규모**: SaaS 멀티테넌트 (사용자별 데이터 완전 격리), 중소기업 고객 수백~수천 명 예상

## 현재 DB 구성 (총 18개 테이블)

### 재고·거래 모듈 (12개 테이블)
| 테이블 | 역할 |
|--------|------|
| `profiles` | 사용자 프로필 (Supabase auth.users 확장) |
| `items` | 품목 마스터 (재고) |
| `transactions` | 입출고 이력 |
| `vendors` | 거래처 마스터 |
| `transfers` | 창고 간 이동 |
| `stocktakes` | 재고 실사 |
| `audit_logs` | 변경 감사 로그 |
| `account_entries` | 매출/매입 장부 |
| `purchase_orders` | 발주서 |
| `pos_sales` | POS 매출 데이터 |
| `custom_fields` | 사용자 정의 필드 |
| `user_settings` | K-V 사용자 설정 |

### HR·급여 모듈 (5개 테이블) — 최근 추가
| 테이블 | 역할 |
|--------|------|
| `employees` | 직원 마스터 (주민번호 AES 암호화) |
| `attendance` | 일별 근태 (출근/퇴근/연장/야간/휴일) |
| `payrolls` | 월별 급여 (4대보험 + 소득세 자동 계산) |
| `leaves` | 휴가 신청·승인 이력 |
| `salary_items` | 수당·공제 항목 마스터 |

### 팀 워크스페이스 (1개 테이블)
| 테이블 | 역할 |
|--------|------|
| `team_workspaces` | 멀티 워크스페이스 (팀 초대·멤버 관리, JSONB 배열) |

## 현재 스키마 파일
- `supabase/schema.sql` — 전체 스키마 (메인)
- `supabase/fix-profiles-rls.sql` — RLS 패치 (기존 DB 호환)
- `supabase/fix-profiles-rls-hr.sql` — HR 모듈 추가 + RLS
- `supabase/fix-team-rls.sql` — 팀 워크스페이스 RLS 패치
- `supabase/fix-vendors-upsert.sql` — vendors upsert 패치

## 현재 주요 설계 결정
1. **멀티테넌트 격리**: 모든 테이블에 `user_id UUID NOT NULL REFERENCES profiles(id)` + RLS `auth.uid() = user_id`
2. **주민번호 암호화**: `pgcrypto` AES 암호화, `app.rrn_key` 설정값 사용 (Supabase Vault 권장)
3. **감사 로그 변조 방지**: `audit_logs`는 INSERT+SELECT만 허용, UPDATE/DELETE 차단
4. **팀 워크스페이스 JSONB**: 멤버 배열을 JSONB로 관리 (`team_workspaces.members`)
5. **Realtime**: 주요 테이블에 `REPLICA IDENTITY FULL` + `supabase_realtime` publication

## 검토 요청 사항
1. **데이터 모델 품질**: 정규화 수준, 관계 설계, 누락 엔티티 확인
2. **마이그레이션 관리**: 현재 스키마가 단일 파일 + 여러 패치 파일로 분산 → 버전 관리 체계 제안
3. **성능**: 현재 인덱스 전략 평가, 누락 인덱스, 쿼리 최적화 기회
4. **보안**: RLS 정책 완전성, 암호화 전략, 감사 로그, 관리자 계정 하드코딩 이슈
5. **향후 확장**: HR Phase 완성 후 Phase 3(고급 회계), Phase 4(CRM), Phase 5(프로젝트 관리) 대비

## 주요 비즈니스 요구사항
- 한국 노동법 준수 (4대보험, 연차 15일, 간이세액표 기반 소득세)
- 부가세(VAT) 10% 자동 계산
- 다중 창고 지원 (warehouse TEXT 컬럼으로 관리 중)
- 발주서 → 입고 자동 연결 (현재 수동)
- 엑셀/CSV 대량 업로드 (수천 행)

## 기존 스키마 파일 경로
`supabase/schema.sql` 참조 (762줄)
