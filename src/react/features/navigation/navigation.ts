export const navigationItems = [
  {
    to: '/',
    label: '홈',
    hint: '대시보드 및 재고 현황 요약',
    title: '홈 대시보드',
    eyebrow: '대시보드',
  },
  {
    to: '/inventory',
    label: '재고',
    hint: '재고 목록, 요약, 필터, 부족 재고 확인',
    title: '재고 현황',
    eyebrow: '재고',
  },
  {
    to: '/inout',
    label: '입출고',
    hint: '입고/출고 등록, 현황판, 최근 거래 내역',
    title: '입출고 관리',
    eyebrow: '입출고',
  },
  {
    to: '/auth',
    label: '인증',
    hint: '세션, 권한, 로그인 관리',
    title: '인증',
    eyebrow: '인증',
  },
];

export function getNavigationMeta(pathname: string) {
  const item =
    navigationItems.find((entry) => entry.to === pathname) ||
    navigationItems.find((entry) => entry.to !== '/' && pathname.startsWith(entry.to));

  return item || navigationItems[0];
}
