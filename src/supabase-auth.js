/**
 * supabase-auth.js - Supabase 인증 모듈
 *
 * 왜 Firebase Auth를 교체?
 * → Supabase Auth는 DB와 동일 플랫폼이라 RLS와 자동 연동
 * → Google + 이메일/비밀번호 + 카카오 로그인 모두 지원
 * → 별도 설정 없이 auth.uid()가 RLS 정책과 즉시 연결
 */

import { supabase, isSupabaseConfigured } from './supabase-client.js';
import { showToast } from './toast.js';

let _currentUser = null;
let _userProfile = null;
let _authListeners = [];

/**
 * 인증 상태 변화 감지 시작
 * 앱 초기화 시 1회 호출 — 로그인/로그아웃 이벤트 자동 처리
 */
export function initAuth(onAuthChange) {
  if (!isSupabaseConfigured) {
    console.warn('[Auth] Supabase가 설정되지 않았습니다.');
    return;
  }

  // 인증 상태 변화 리스너
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      _currentUser = session.user;
      // 프로필 조회 (profiles 테이블)
      await loadProfile();
    } else {
      _currentUser = null;
      _userProfile = null;
    }
    // 상위 앱에 인증 변화 알림
    onAuthChange?.(_currentUser, _userProfile);
    _authListeners.forEach(fn => fn(_currentUser, _userProfile));
  });
}

/**
 * 프로필 조회 또는 자동 생성
 */
async function loadProfile() {
  if (!_currentUser) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', _currentUser.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // 프로필이 없으면 (트리거 실패 시) 수동 생성
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          id: _currentUser.id,
          name: _currentUser.user_metadata?.full_name || '사용자',
          email: _currentUser.email,
          photo_url: _currentUser.user_metadata?.avatar_url,
        })
        .select()
        .single();
      _userProfile = newProfile;
    } else {
      _userProfile = data;
    }
  } catch (err) {
    console.error('[Auth] 프로필 로딩 실패:', err.message);
  }
}

/**
 * Google 로그인
 */
export async function loginWithGoogle() {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return;
  }
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  } catch (err) {
    showToast('Google 로그인 실패: ' + err.message, 'error');
  }
}

/**
 * 이메일/비밀번호 회원가입
 */
export async function signUpWithEmail(email, password, name) {
  if (!isSupabaseConfigured) return { error: 'Supabase 미설정' };
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name || '사용자' },
      },
    });
    if (error) throw error;
    showToast('인증 메일을 보냈습니다. 확인 후 로그인해주세요.', 'success');
    return { data };
  } catch (err) {
    showToast('회원가입 실패: ' + err.message, 'error');
    return { error: err.message };
  }
}

/**
 * 이메일/비밀번호 로그인
 */
export async function loginWithEmail(email, password) {
  if (!isSupabaseConfigured) return { error: 'Supabase 미설정' };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return { data };
  } catch (err) {
    showToast('로그인 실패: ' + err.message, 'error');
    return { error: err.message };
  }
}

/**
 * 로그아웃
 */
export async function logout() {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.auth.signOut();
    _currentUser = null;
    _userProfile = null;
    showToast('로그아웃되었습니다.', 'info');
  } catch (err) {
    console.error('[Auth] 로그아웃 실패:', err.message);
  }
}

/**
 * 현재 사용자 반환
 */
export function getCurrentUser() {
  return _currentUser;
}

/**
 * 현재 프로필 반환
 */
export function getUserProfile() {
  return _userProfile;
}

/**
 * 프로필 업데이트
 */
export async function updateProfile(updates) {
  if (!_currentUser || !isSupabaseConfigured) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', _currentUser.id)
      .select()
      .single();

    if (error) throw error;
    _userProfile = data;
    return data;
  } catch (err) {
    console.error('[Auth] 프로필 업데이트 실패:', err.message);
  }
}

/**
 * 인증 리스너 등록 (외부 모듈용)
 */
export function onAuthStateChange(callback) {
  _authListeners.push(callback);
  // 현재 상태 즉시 전달
  if (_currentUser) callback(_currentUser, _userProfile);
  // 해제 함수 반환
  return () => {
    _authListeners = _authListeners.filter(fn => fn !== callback);
  };
}
