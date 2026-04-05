/**
 * firebase-auth.js - 사용자 인증 모듈
 * 역할: Google 로그인/로그아웃, 사용자 상태 관리, 권한 체크
 * 왜 필요? → 다중 사용자, 계정별 데이터 분리, 유료 구독 관리의 기초
 */

import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, isConfigured } from './firebase-config.js';
import { showToast } from './toast.js';

// 현재 로그인 사용자
let currentUser = null;
let userProfile = null;

// 인증 상태 변화 리스너 콜백
let authChangeCallbacks = [];

/**
 * 인증 상태 변화 감지 초기화
 */
export function initAuth(callback) {
  if (!isConfigured) {
    // Firebase 미설정 시 → 로컬 모드로 동작
    currentUser = null;
    userProfile = { role: 'admin', plan: 'free', name: '로컬 사용자' };
    if (callback) callback(null, userProfile);
    return;
  }

  if (callback) authChangeCallbacks.push(callback);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
      // Firestore에서 사용자 프로필 가져오기
      try {
        userProfile = await getUserProfile(user.uid);

        // 첫 로그인 시 기본 프로필 생성
        if (!userProfile) {
          userProfile = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || '사용자',
            photoURL: user.photoURL || '',
            role: 'admin', // 첫 가입자는 관리자
            plan: 'free',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
          };
          await setDoc(doc(db, 'users', user.uid), userProfile);
        } else {
          // 마지막 로그인 시간 업데이트
          await setDoc(doc(db, 'users', user.uid), {
            ...userProfile,
            lastLogin: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn('프로필 로드 실패:', error);
        userProfile = { role: 'admin', plan: 'free', name: user.displayName || '사용자' };
      }
    } else {
      userProfile = null;
    }

    // 모든 콜백 호출
    authChangeCallbacks.forEach(cb => cb(user, userProfile));
  });
}

/**
 * Google 로그인
 */
export async function loginWithGoogle() {
  if (!isConfigured) {
    showToast('Firebase 설정이 필요합니다. firebase-config.js를 확인하세요.', 'warning');
    return null;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    showToast(`${result.user.displayName}님, 환영합니다! 🎉`, 'success');
    return result.user;
  } catch (error) {
    if (error.code === 'auth/popup-closed-by-user') {
      showToast('로그인이 취소되었습니다.', 'info');
    } else {
      showToast('로그인에 실패했습니다: ' + error.message, 'error');
    }
    return null;
  }
}

/**
 * 로그아웃
 */
export async function logout() {
  if (!isConfigured) return;

  try {
    await signOut(auth);
    currentUser = null;
    userProfile = null;
    showToast('로그아웃되었습니다.', 'info');
  } catch (error) {
    showToast('로그아웃 실패: ' + error.message, 'error');
  }
}

/**
 * Firestore에서 사용자 프로필 조회
 */
async function getUserProfile(uid) {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  } catch {
    return null;
  }
}

/**
 * 현재 사용자 정보 반환
 */
export function getCurrentUser() {
  return currentUser;
}

export function getUserProfileData() {
  return userProfile;
}

/**
 * 권한 체크
 */
export function hasRole(requiredRole) {
  if (!userProfile) return false;
  const roles = { viewer: 0, staff: 1, manager: 2, admin: 3 };
  return (roles[userProfile.role] || 0) >= (roles[requiredRole] || 0);
}

/**
 * 유료 플랜 체크
 */
export function hasPlan(requiredPlan) {
  if (!userProfile) return false;
  const plans = { free: 0, pro: 1, enterprise: 2 };
  return (plans[userProfile.plan] || 0) >= (plans[requiredPlan] || 0);
}

/**
 * 로그인 화면 렌더
 */
export function renderLoginScreen(container) {
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
      <div style="text-align:center; max-width:400px; padding:40px;">
        <div style="font-size:48px; margin-bottom:16px;">📦</div>
        <h1 style="font-size:28px; font-weight:800; margin-bottom:8px;">INVEX</h1>
        <p style="color:var(--text-muted); margin-bottom:32px; font-size:14px;">
          중소기업 맞춤 재고·경영 관리 시스템
        </p>
        <button class="btn btn-primary btn-lg" id="btn-google-login" style="width:100%; gap:8px; font-size:15px;">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="" />
          Google 계정으로 시작하기
        </button>
        <p style="color:var(--text-muted); font-size:11px; margin-top:16px;">
          로그인하면 <a href="#" style="color:var(--accent);">이용약관</a> 및 
          <a href="#" style="color:var(--accent);">개인정보처리방침</a>에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  `;

  container.querySelector('#btn-google-login')?.addEventListener('click', async () => {
    await loginWithGoogle();
  });
}
