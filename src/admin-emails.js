export const SUPER_ADMIN_EMAILS = Object.freeze([
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'admin@invex.io.kr',
]);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isSuperAdminEmail(email) {
  return SUPER_ADMIN_EMAILS.includes(normalizeEmail(email));
}
