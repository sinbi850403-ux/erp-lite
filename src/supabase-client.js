/**
 * supabase-client.js - Supabase 클라이언트 초기화
 *
 * 왜 별도 파일? → 모든 모듈에서 동일한 클라이언트 인스턴스를 공유하기 위해
 * 환경변수: .env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 설정 필요
 */

import { createClient } from '@supabase/supabase-js';

// Vite 환경변수에서 Supabase 설정 로드
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Supabase 프로젝트가 설정되어 있는지 확인
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Supabase 클라이언트 싱글톤
 * persistSession: 로그인 세션을 localStorage에 유지
 * autoRefreshToken: 토큰 만료 시 자동 갱신
 */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // 기존 Firebase 키와 충돌 방지
        storageKey: 'invex-supabase-auth',
      },
    })
  : null;
