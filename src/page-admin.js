/**
 * page-admin.js - 관리자 대시보드
 * 역할: 사용자 관리, 시스템 현황, 요금제 변경, 공지사항, 로그 확인
 * 왜 필요? → SaaS 운영자가 사용자/매출을 한눈에 관리
 * 접근 제한: 관리자 이메일만 접근 가능
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { getCurrentUser } from './firebase-auth.js';
import { PLANS, getCurrentPlan, setPlan } from './plan.js';

// 총관리자(사이트 소유자) 이메일 목록
const ADMIN_EMAILS = [
  'sinbi0214@naver.com',     // 총관리자 (네이버)
  'sinbi850403@gmail.com',   // 총관리자 (구글)
  'admin@invex.io.kr',       // 시스템 관리자
];

/**
 * 관리자 권한 체크
 * 왜 이메일 기반? → Firebase Custom Claims 없이 간단하게 관리자 판별
 */
export function isAdmin() {
  const user = getCurrentUser();
  if (!user) return false;
  // 관리자 이메일이거나, 첫 번째 가입자(임시 관리자)
  if (ADMIN_EMAILS.includes(user.email)) return true;
  // 관리자 목록이 비어있으면 모든 로그인 사용자를 관리자로 (초기 셋업용)
  if (ADMIN_EMAILS.length <= 1 && ADMIN_EMAILS[0] === 'admin@invex.io.kr') return true;
  return false;
}

/**
 * 날짜 포맷
 */
function fmt(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function renderAdminPage(container, navigateTo) {
  const state = getState();
  const user = getCurrentUser();

  // 관리자 아닌 경우 차단
  if (!isAdmin()) {
    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; min-height:60vh; text-align:center;">
        <div>
          <div style="font-size:64px; margin-bottom:16px;">🚫</div>
          <h2 style="font-size:20px; font-weight:700; margin-bottom:8px;">접근 권한이 없습니다</h2>
          <p style="color:var(--text-muted);">관리자만 접근할 수 있는 페이지입니다.</p>
        </div>
      </div>
    `;
    return;
  }

  // 시스템 통계 계산
  const users = state.adminUsers || [];
  const totalUsers = users.length;
  const freeUsers = users.filter(u => (u.plan || 'free') === 'free').length;
  const proUsers = users.filter(u => u.plan === 'pro').length;
  const entUsers = users.filter(u => u.plan === 'enterprise').length;
  const monthlyRevenue = (proUsers * 290000) + (entUsers * 490000);
  const paymentHistory = state.paymentHistory || [];
  const notices = state.adminNotices || [];
  const totalItems = (state.mappedData || []).length;
  const totalTransactions = (state.transactions || []).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">👑</span> 관리자 대시보드</h1>
        <div class="page-desc">INVEX 시스템 관리 및 사용자 모니터링</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" id="btn-admin-refresh">🔄 새로고침</button>
      </div>
    </div>

    <!-- 핵심 KPI -->
    <div class="stats-grid" style="grid-template-columns:repeat(5, 1fr); margin-bottom:20px;">
      <div class="stat-card">
        <div class="stat-label">총 사용자</div>
        <div class="stat-value" style="color:var(--accent);">${totalUsers}</div>
        <div class="stat-sub">명</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">유료 전환율</div>
        <div class="stat-value" style="color:#3b82f6;">${totalUsers > 0 ? Math.round(((proUsers + entUsers) / totalUsers) * 100) : 0}%</div>
        <div class="stat-sub">Pro ${proUsers} / ENT ${entUsers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">예상 월 매출</div>
        <div class="stat-value" style="color:var(--success);">₩${monthlyRevenue.toLocaleString()}</div>
        <div class="stat-sub">월</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 등록 품목</div>
        <div class="stat-value">${totalItems.toLocaleString()}</div>
        <div class="stat-sub">건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 거래</div>
        <div class="stat-value">${totalTransactions.toLocaleString()}</div>
        <div class="stat-sub">건</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
      <!-- 사용자 관리 -->
      <div class="card" style="grid-column:1/3;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div class="card-title" style="margin:0;">👥 사용자 관리</div>
          <div style="display:flex; gap:8px;">
            <input class="form-input" id="admin-user-search" placeholder="🔍 이메일/이름 검색" style="width:220px; font-size:12px;" />
            <button class="btn btn-primary btn-sm" id="btn-add-user">➕ 사용자 추가</button>
          </div>
        </div>
        <div class="table-wrapper" style="border:none; max-height:400px; overflow-y:auto;">
          <table class="data-table" id="admin-users-table">
            <thead><tr>
              <th>사용자</th>
              <th>이메일</th>
              <th>요금제</th>
              <th>가입일</th>
              <th>최근 접속</th>
              <th>상태</th>
              <th style="text-align:center;">관리</th>
            </tr></thead>
            <tbody>
              ${users.length > 0 ? users.map(u => `
                <tr data-uid="${u.uid || u.id}">
                  <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                      ${u.photoURL ? `<img src="${u.photoURL}" style="width:28px; height:28px; border-radius:50%;" />` : '<div style="width:28px; height:28px; border-radius:50%; background:var(--bg-secondary); display:flex; align-items:center; justify-content:center; font-size:12px;">👤</div>'}
                      <div>
                        <div style="font-weight:600; font-size:13px;">${u.name || '(이름 없음)'}</div>
                        ${u.role === 'admin' ? '<span style="font-size:9px; background:#ef4444; color:#fff; padding:1px 4px; border-radius:3px;">관리자</span>' : ''}
                      </div>
                    </div>
                  </td>
                  <td style="font-size:12px; color:var(--text-muted);">${u.email || '-'}</td>
                  <td>
                    <span class="badge ${u.plan === 'enterprise' ? 'badge-purple' : u.plan === 'pro' ? 'badge-primary' : 'badge-default'}">
                      ${(PLANS[u.plan || 'free']?.icon || '🆓')} ${(u.plan || 'free').toUpperCase()}
                    </span>
                  </td>
                  <td style="font-size:11px; color:var(--text-muted);">${fmt(u.createdAt)}</td>
                  <td style="font-size:11px; color:var(--text-muted);">${fmt(u.lastLogin)}</td>
                  <td>
                    <span class="badge ${u.status === 'suspended' ? 'badge-danger' : 'badge-success'}">
                      ${u.status === 'suspended' ? '🚫 정지' : '✅ 활성'}
                    </span>
                  </td>
                  <td style="text-align:center;">
                    <div style="display:flex; gap:4px; justify-content:center;">
                      <button class="btn btn-ghost btn-sm btn-edit-user" data-uid="${u.uid || u.id}" title="수정">✏️</button>
                      <button class="btn btn-ghost btn-sm btn-plan-user" data-uid="${u.uid || u.id}" title="요금제 변경">💎</button>
                      <button class="btn btn-ghost btn-sm btn-suspend-user" data-uid="${u.uid || u.id}" data-status="${u.status || 'active'}" title="정지/활성">
                        ${u.status === 'suspended' ? '✅' : '🚫'}
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">
                    <div style="font-size:28px; margin-bottom:8px;">👥</div>
                    아직 등록된 사용자가 없습니다.<br/>
                    <button class="btn btn-primary btn-sm" id="btn-add-demo-users" style="margin-top:12px;">📊 데모 데이터 생성</button>
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
      <!-- 공지사항 관리 -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div class="card-title" style="margin:0;">📢 공지사항</div>
          <button class="btn btn-ghost btn-sm" id="btn-add-notice">➕ 작성</button>
        </div>
        ${notices.length > 0 ? notices.slice(0, 5).map(n => `
          <div style="padding:10px; border-bottom:1px solid var(--border); font-size:13px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>${n.title}</strong>
              <span style="font-size:10px; color:var(--text-muted);">${fmt(n.date)}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${n.content}</div>
          </div>
        `).join('') : `
          <div style="text-align:center; padding:24px; color:var(--text-muted);">
            <div style="font-size:24px; margin-bottom:8px;">📢</div>
            등록된 공지가 없습니다.
          </div>
        `}
      </div>

      <!-- 시스템 정보 -->
      <div class="card">
        <div class="card-title">🖥️ 시스템 정보</div>
        <div style="font-size:13px; line-height:2.2;">
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">도메인</span>
            <strong><a href="https://invex.io.kr" target="_blank" style="color:var(--accent);">invex.io.kr</a></strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">서버</span>
            <strong>Vercel Edge</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">데이터베이스</span>
            <strong>Firebase Firestore</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">인증</span>
            <strong>Firebase Auth (Google)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">결제</span>
            <strong>토스페이먼츠</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">버전</span>
            <strong>v3.0</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0;">
            <span style="color:var(--text-muted);">현재 접속자</span>
            <strong>${user?.email || '-'}</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- 최근 결제 -->
    <div class="card">
      <div class="card-title">💰 최근 결제 내역</div>
      ${paymentHistory.length > 0 ? `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead><tr><th>일시</th><th>사용자</th><th>요금제</th><th class="text-right">금액</th><th>상태</th></tr></thead>
            <tbody>
              ${paymentHistory.slice(0, 10).map(p => `
                <tr>
                  <td style="font-size:12px;">${fmt(p.date)}</td>
                  <td>${p.userName || '-'}</td>
                  <td><strong>${p.planName}</strong></td>
                  <td class="text-right" style="font-weight:600;">${p.amount}</td>
                  <td><span class="badge ${p.status === 'paid' ? 'badge-success' : 'badge-warning'}">${p.status === 'paid' ? '결제완료' : '환불'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="text-align:center; padding:24px; color:var(--text-muted);">
          <div style="font-size:24px; margin-bottom:8px;">💰</div>
          결제 내역이 없습니다.
        </div>
      `}
    </div>
  `;

  // === 이벤트 ===

  // 새로고침
  container.querySelector('#btn-admin-refresh')?.addEventListener('click', () => {
    renderAdminPage(container, navigateTo);
    showToast('새로고침 완료', 'info');
  });

  // 데모 사용자 생성
  container.querySelector('#btn-add-demo-users')?.addEventListener('click', () => {
    const demoUsers = [
      { uid: 'u1', name: '김관리', email: 'admin@invex.io.kr', plan: 'enterprise', role: 'admin', status: 'active', createdAt: '2026-03-01T09:00:00Z', lastLogin: new Date().toISOString(), photoURL: '' },
      { uid: 'u2', name: '이매니저', email: 'manager@company.com', plan: 'pro', role: 'manager', status: 'active', createdAt: '2026-03-05T10:30:00Z', lastLogin: '2026-04-04T14:20:00Z', photoURL: '' },
      { uid: 'u3', name: '박사원', email: 'staff@company.com', plan: 'pro', role: 'staff', status: 'active', createdAt: '2026-03-10T08:00:00Z', lastLogin: '2026-04-05T09:15:00Z', photoURL: '' },
      { uid: 'u4', name: '최인턴', email: 'intern@company.com', plan: 'free', role: 'viewer', status: 'active', createdAt: '2026-03-20T11:00:00Z', lastLogin: '2026-04-03T16:45:00Z', photoURL: '' },
      { uid: 'u5', name: '정대리', email: 'jung@retail.kr', plan: 'pro', role: 'staff', status: 'suspended', createdAt: '2026-02-15T13:00:00Z', lastLogin: '2026-03-28T10:00:00Z', photoURL: '' },
    ];
    setState({ adminUsers: demoUsers });
    showToast('데모 사용자 5명이 생성되었습니다.', 'success');
    renderAdminPage(container, navigateTo);
  });

  // 사용자 검색
  container.querySelector('#admin-user-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    container.querySelectorAll('#admin-users-table tbody tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? '' : 'none';
    });
  });

  // 사용자 추가
  container.querySelector('#btn-add-user')?.addEventListener('click', () => {
    showUserModal(null, container, navigateTo);
  });

  // 사용자 수정
  container.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      const u = users.find(x => (x.uid || x.id) === uid);
      if (u) showUserModal(u, container, navigateTo);
    });
  });

  // 요금제 변경
  container.querySelectorAll('.btn-plan-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      const u = users.find(x => (x.uid || x.id) === uid);
      if (u) showPlanChangeModal(u, container, navigateTo);
    });
  });

  // 정지/활성
  container.querySelectorAll('.btn-suspend-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      const current = btn.dataset.status;
      const newStatus = current === 'suspended' ? 'active' : 'suspended';
      const updated = users.map(u => (u.uid || u.id) === uid ? { ...u, status: newStatus } : u);
      setState({ adminUsers: updated });
      showToast(newStatus === 'suspended' ? '사용자가 정지되었습니다.' : '사용자가 활성화되었습니다.', newStatus === 'suspended' ? 'warning' : 'success');
      renderAdminPage(container, navigateTo);
    });
  });

  // 공지 작성
  container.querySelector('#btn-add-notice')?.addEventListener('click', () => {
    showNoticeModal(container, navigateTo);
  });
}

/**
 * 사용자 추가/수정 모달
 */
function showUserModal(user, container, navigateTo) {
  const isEdit = !!user;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <h3>${isEdit ? '✏️ 사용자 수정' : '➕ 사용자 추가'}</h3>
        <button class="btn btn-ghost btn-sm modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">이름</label>
          <input class="form-input" id="mu-name" value="${user?.name || ''}" placeholder="홍길동" />
        </div>
        <div class="form-group">
          <label class="form-label">이메일</label>
          <input class="form-input" type="email" id="mu-email" value="${user?.email || ''}" placeholder="user@company.com" />
        </div>
        <div class="form-group">
          <label class="form-label">역할</label>
          <select class="form-input" id="mu-role">
            <option value="viewer" ${user?.role === 'viewer' ? 'selected' : ''}>👁️ 뷰어</option>
            <option value="staff" ${user?.role === 'staff' ? 'selected' : ''}>📝 편집자</option>
            <option value="manager" ${user?.role === 'manager' ? 'selected' : ''}>📋 매니저</option>
            <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>👑 관리자</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">요금제</label>
          <select class="form-input" id="mu-plan">
            ${Object.values(PLANS).map(p => `<option value="${p.id}" ${user?.plan === p.id ? 'selected' : ''}>${p.icon} ${p.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-ghost modal-close">취소</button>
        <button class="btn btn-primary" id="mu-save">${isEdit ? '저장' : '추가'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#mu-save').addEventListener('click', () => {
    const name = modal.querySelector('#mu-name').value.trim();
    const email = modal.querySelector('#mu-email').value.trim();
    const role = modal.querySelector('#mu-role').value;
    const plan = modal.querySelector('#mu-plan').value;
    if (!name || !email) { showToast('이름과 이메일을 입력하세요.', 'warning'); return; }

    const state = getState();
    let users = state.adminUsers || [];
    if (isEdit) {
      users = users.map(u => (u.uid || u.id) === (user.uid || user.id) ? { ...u, name, email, role, plan } : u);
    } else {
      users.push({ uid: 'u' + Date.now(), name, email, role, plan, status: 'active', createdAt: new Date().toISOString(), lastLogin: null, photoURL: '' });
    }
    setState({ adminUsers: users });
    modal.remove();
    showToast(isEdit ? '사용자 정보가 수정되었습니다.' : '사용자가 추가되었습니다.', 'success');
    renderAdminPage(container, navigateTo);
  });
}

/**
 * 요금제 변경 모달
 */
function showPlanChangeModal(user, container, navigateTo) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <h3>💎 요금제 변경 — ${user.name}</h3>
        <button class="btn btn-ghost btn-sm modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
          ${Object.values(PLANS).map(p => `
            <div class="plan-card-admin" data-plan="${p.id}" style="
              border:2px solid ${(user.plan || 'free') === p.id ? p.color : 'var(--border)'};
              border-radius:10px; padding:16px; text-align:center; cursor:pointer;
              background:${(user.plan || 'free') === p.id ? p.color + '15' : 'var(--bg-secondary)'};
            ">
              <div style="font-size:24px;">${p.icon}</div>
              <div style="font-size:14px; font-weight:700;">${p.name}</div>
              <div style="font-size:16px; font-weight:800; color:${p.color};">${p.price}</div>
              ${(user.plan || 'free') === p.id ? '<div style="font-size:10px; color:var(--success); margin-top:4px;">✓ 현재</div>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelectorAll('.plan-card-admin').forEach(card => {
    card.addEventListener('click', () => {
      const planId = card.dataset.plan;
      const state = getState();
      const users = (state.adminUsers || []).map(u =>
        (u.uid || u.id) === (user.uid || user.id) ? { ...u, plan: planId } : u
      );
      setState({ adminUsers: users });
      modal.remove();
      showToast(`${user.name}님의 요금제가 ${PLANS[planId].name}으로 변경되었습니다.`, 'success');
      renderAdminPage(container, navigateTo);
    });
  });
}

/**
 * 공지사항 작성 모달
 */
function showNoticeModal(container, navigateTo) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:450px;">
      <div class="modal-header">
        <h3>📢 공지사항 작성</h3>
        <button class="btn btn-ghost btn-sm modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">제목</label>
          <input class="form-input" id="notice-title" placeholder="공지 제목" />
        </div>
        <div class="form-group">
          <label class="form-label">내용</label>
          <textarea class="form-input" id="notice-content" rows="4" placeholder="공지 내용을 입력하세요"></textarea>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-ghost modal-close">취소</button>
        <button class="btn btn-primary" id="notice-save">📢 게시</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#notice-save').addEventListener('click', () => {
    const title = modal.querySelector('#notice-title').value.trim();
    const content = modal.querySelector('#notice-content').value.trim();
    if (!title) { showToast('제목을 입력하세요.', 'warning'); return; }
    const notices = getState().adminNotices || [];
    notices.unshift({ id: 'n' + Date.now(), title, content, date: new Date().toISOString() });
    setState({ adminNotices: notices });
    modal.remove();
    showToast('공지가 게시되었습니다.', 'success');
    renderAdminPage(container, navigateTo);
  });
}
