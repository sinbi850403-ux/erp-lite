/**
 * Session guard helpers for auth hydration and profile bootstrap flows.
 */

export function hasSessionAccessToken(session) {
  return Boolean(String(session?.access_token || '').trim());
}

export function shouldAttemptProfileLoad(user, session) {
  return Boolean(user?.uid) && hasSessionAccessToken(session);
}

