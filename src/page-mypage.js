/**
 * page-mypage.js - 마이페이지
 * Supabase 인증 기준으로 프로필/비밀번호 기능을 제공한다.
 */

import {
  getCurrentUser,
  getUserProfileData,
  updateProfileName,
  changePassword,
  deleteAccount,
} from './firebase-auth.js';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, isConfigured } from './firebase-config.js';
import { showToast } from './toast.js';
import { getCurrentPlan, PLANS } from './plan.js';

export function renderMyPage(container) {
  const user = getCurrentUser();
  const profile = getUserProfileData();
  const plan = getCurrentPlan();
  const planInfo = PLANS[plan] || PLANS.free;

  const providerId = user?.providerData?.[0]?.providerId || 'password';
  const isGoogleUser = providerId === 'google.com';
  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('ko-KR')
    : '-';

  const displayName = profile?.name || user?.displayName || '사용자';
  const initials = displayName?.[0]?.toUpperCase?.() || 'U';

  container.innerHTML = `
    <div style="max-width:700px; margin:0 auto; padding:24px;">
      <h2 style="font-size:22px; font-weight:800; margin-bottom:24px;">마이페이지</h2>

      <div class="card" style="padding:24px; margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
          <div style="width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,#8b5cf6,#3b82f6); display:flex; align-items:center; justify-content:center; font-size:24px; color:white; font-weight:700;">
            ${initials}
          </div>
          <div>
            <div style="font-size:18px; font-weight:700;">${displayName}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">${user?.email || '-'}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
              가입일: ${joinDate} · ${isGoogleUser ? 'Google 계정' : '이메일 계정'}
            </div>
          </div>
        </div>

        <div style="padding:12px 16px; background:rgba(139,92,246,0.1); border-radius:8px; border:1px solid rgba(139,92,246,0.2); margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:13px; font-weight:600;">${planInfo.icon} ${planInfo.name} 플랜</span>
              <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${planInfo.price}</span>
            </div>
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:6px;">이름</label>
          <div style="display:flex; gap:8px;">
            <input id="my-name" type="text" value="${displayName}" class="input" style="flex:1;" />
            <button id="btn-update-name" class="btn btn-primary" style="white-space:nowrap;">변경</button>
          </div>
        </div>
      </div>

      <div class="card" style="padding:24px; margin-bottom:20px; ${isGoogleUser ? 'opacity:0.5;' : ''}">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:16px;">비밀번호 변경</h3>
        ${
          isGoogleUser
            ? '<p style="font-size:12px; color:var(--text-muted);">Google 계정은 Google에서 비밀번호를 관리합니다.</p>'
            : `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <input id="my-current-pw" type="password" placeholder="현재 비밀번호" class="input" />
            <input id="my-new-pw" type="password" placeholder="새 비밀번호 (6자 이상)" class="input" />
            <input id="my-new-pw2" type="password" placeholder="새 비밀번호 확인" class="input" />
            <button id="btn-change-pw" class="btn btn-primary">비밀번호 변경</button>
          </div>
        `
        }
      </div>

      <div class="card" style="padding:24px; border:1px solid rgba(239,68,68,0.3);">
        <h3 style="font-size:15px; font-weight:700; color:#ef4444; margin-bottom:8px;">계정 탈퇴</h3>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">
          계정 탈퇴는 현재 관리자 검수 후 처리됩니다.
        </p>
        <button id="btn-delete-account" class="btn" style="background:#ef4444; color:white; font-size:13px;">
          탈퇴 요청
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-update-name')?.addEventListener('click', async () => {
    const newName = document.getElementById('my-name')?.value?.trim();
    if (!newName) {
      showToast('이름을 입력해 주세요.', 'warning');
      return;
    }
    const ok = await updateProfileName(newName);
    if (!ok) return;

    // 기존 Firestore 프로필도 함께 갱신해 호환성 유지
    if (isConfigured && db && user?.uid) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { name: newName });
      } catch {
        // Firestore 미연결 시 무시
      }
    }
    showToast('이름이 변경되었습니다.', 'success');
  });

  if (!isGoogleUser) {
    document.getElementById('btn-change-pw')?.addEventListener('click', async () => {
      const currentPw = document.getElementById('my-current-pw')?.value || '';
      const newPw = document.getElementById('my-new-pw')?.value || '';
      const newPw2 = document.getElementById('my-new-pw2')?.value || '';

      if (!currentPw) {
        showToast('현재 비밀번호를 입력해 주세요.', 'warning');
        return;
      }
      if (newPw.length < 6) {
        showToast('새 비밀번호는 6자 이상이어야 합니다.', 'warning');
        return;
      }
      if (newPw !== newPw2) {
        showToast('새 비밀번호 확인이 일치하지 않습니다.', 'warning');
        return;
      }

      const ok = await changePassword(currentPw, newPw);
      if (!ok) return;

      document.getElementById('my-current-pw').value = '';
      document.getElementById('my-new-pw').value = '';
      document.getElementById('my-new-pw2').value = '';
    });
  }

  document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
    const confirmed = confirm('탈퇴 요청을 진행할까요?');
    if (!confirmed) return;

    // 기존 Firestore 사용자 문서는 정리 시도
    if (isConfigured && db && user?.uid) {
      try {
        await deleteDoc(doc(db, 'users', user.uid));
      } catch {
        // Firestore 미연결 시 무시
      }
    }
    await deleteAccount();
  });
}

