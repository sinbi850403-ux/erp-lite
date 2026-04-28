import React, { useState, useEffect, useMemo } from 'react';
import { employees as employeesDb } from '../db.js';
import { showToast } from '../toast.js';

function buildTree(employees) {
  const deptMap = {};
  employees.forEach(e => {
    const dept = e.dept || '미배정';
    if (!deptMap[dept]) deptMap[dept] = [];
    deptMap[dept].push(e);
  });
  return deptMap;
}

function statusBadge(status) {
  if (status === 'resigned') return <span className="badge badge-danger" style={{ fontSize: 10 }}>퇴사</span>;
  if (status === 'leave') return <span className="badge badge-warning" style={{ fontSize: 10 }}>휴직</span>;
  return null;
}

function EmployeeCard({ emp }) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 14px',
      background: 'var(--bg-card)',
      minWidth: 140,
      maxWidth: 180,
      textAlign: 'center',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--accent), #60a5fa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 16,
        margin: '0 auto 8px',
        flexShrink: 0,
      }}>
        {(emp.name || '?')[0]}
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{emp.name || '-'}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
        {emp.position || '직급 미지정'}
      </div>
      {emp.empNo && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>#{emp.empNo}</div>}
      {statusBadge(emp.status)}
    </div>
  );
}

function DeptGroup({ dept, members, expanded, onToggle }) {
  const manager = members.find(m => m.position && ['팀장', '부장', '과장', '실장', '이사', 'CEO', '대표'].some(t => m.position.includes(t)));
  const others = members.filter(m => m !== manager);

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', marginBottom: 12,
          padding: '8px 12px',
          background: 'var(--accent-light)',
          borderRadius: 6,
          border: '1px solid var(--accent)',
          userSelect: 'none',
        }}
        onClick={onToggle}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{dept}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{members.length}명</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {expanded && (
        <div style={{ paddingLeft: 16 }}>
          {manager && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 12, position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <EmployeeCard emp={manager} />
                {others.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: -20, left: '50%',
                    transform: 'translateX(-50%)',
                    width: 2, height: 20,
                    background: 'var(--border)',
                  }} />
                )}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div style={{ position: 'relative', paddingTop: manager ? 20 : 0 }}>
              {manager && others.length > 0 && (
                <div style={{
                  position: 'absolute', top: 0, left: 70,
                  right: 70, height: 2,
                  background: 'var(--border)',
                }} />
              )}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 12,
              }}>
                {others.map(emp => (
                  <EmployeeCard key={emp.id} emp={emp} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedDepts, setExpandedDepts] = useState({});

  useEffect(() => {
    employeesDb.list()
      .then(data => { setEmployees(data); setLoading(false); })
      .catch(e => { showToast('직원 목록 로드 실패: ' + e.message, 'error'); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'active') return employees.filter(e => e.status !== 'resigned');
    if (statusFilter === 'resigned') return employees.filter(e => e.status === 'resigned');
    return employees;
  }, [employees, statusFilter]);

  const deptMap = useMemo(() => buildTree(filtered), [filtered]);
  const depts = Object.keys(deptMap).sort();

  function toggleDept(dept) {
    setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }));
  }

  function expandAll() {
    const all = {};
    depts.forEach(d => { all[d] = true; });
    setExpandedDepts(all);
  }

  function collapseAll() {
    setExpandedDepts({});
  }

  const isDeptExpanded = dept => expandedDepts[dept] !== false && (expandedDepts[dept] === true || Object.keys(expandedDepts).length === 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">조직도</h1>
          <div className="page-desc">부서별 인원 구성을 시각적으로 확인합니다</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={expandAll}>전체 펼치기</button>
          <button className="btn btn-outline" onClick={collapseAll}>전체 접기</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>재직 상태</span>
          {[
            { value: 'active', label: '재직중' },
            { value: 'all', label: '전체' },
            { value: 'resigned', label: '퇴사' },
          ].map(opt => (
            <button
              key={opt.value}
              className={`btn ${statusFilter === opt.value ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            총 {filtered.length}명 · {depts.length}개 부서
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">👥</div>
          <div className="msg">등록된 직원이 없습니다</div>
          <div className="sub">직원 관리 페이지에서 직원을 추가해 주세요</div>
        </div>
      ) : (
        <div className="card">
          {depts.map(dept => (
            <DeptGroup
              key={dept}
              dept={dept}
              members={deptMap[dept]}
              expanded={isDeptExpanded(dept)}
              onToggle={() => toggleDept(dept)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
