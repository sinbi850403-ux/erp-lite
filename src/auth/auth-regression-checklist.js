/**
 * 로그인 회귀 체크리스트 (고정 운영용)
 * - 코드 테스트와 수동 검증 포인트를 함께 유지한다.
 */
export const AUTH_REGRESSION_CHECKLIST = [
  {
    id: 'AUTH-001',
    title: '하드 리프레시(Ctrl+F5) 직후 첫 로그인',
    expected: 'access_token 없으면 profile bootstrap을 건너뛰고, 재로그인 시 정상 진입',
    automated: true,
  },
  {
    id: 'AUTH-002',
    title: '잘못된/빈 세션 토큰',
    expected: '프로필 로딩 시도를 하지 않고 에러 루프 없이 안전하게 대기',
    automated: true,
  },
  {
    id: 'AUTH-003',
    title: 'Google 세션 복구',
    expected: '유효한 토큰 + uid면 profile bootstrap 허용',
    automated: true,
  },
  {
    id: 'AUTH-004',
    title: '로그아웃 후 즉시 재로그인',
    expected: '이전 세션 찌꺼기(lock/race) 없이 정상 진입',
    automated: false,
  },
  {
    id: 'AUTH-005',
    title: '느린 네트워크',
    expected: '타임아웃/재시도 흐름에서 UI가 멈추지 않고 재로그인 가능',
    automated: false,
  },
];
