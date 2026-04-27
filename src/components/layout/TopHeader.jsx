import React from 'react';
import { useLocation } from 'react-router-dom';
import { PAGE_LABELS } from '../../router-config.js';

export default function TopHeader({ user, profile }) {
  const location = useLocation();
  const pageId = location.pathname.slice(1) || 'home';
  const pageLabel = PAGE_LABELS[pageId] || pageId;

  const userName = profile?.name || user?.displayName || '';
  const userPhoto = user?.photoURL;

  return (
    <header className="top-header" id="top-header">
      <div className="top-header-left">
        <nav className="breadcrumb" id="breadcrumb" aria-label="현재 위치">
          <span className="breadcrumb-current"> {pageLabel}</span>
        </nav>
      </div>
      <div className="top-header-right">
        <div className="sync-dot" id="sync-dot" title="동기화 연결됨" />
        <div className="top-header-user" id="top-header-user">
          {user && (
            <div className="top-user-compact">
              {userPhoto
                ? <img src={userPhoto} className="top-user-avatar" alt="" />
                : <span className="top-user-avatar-placeholder">{userName?.[0] || 'U'}</span>
              }
              <span className="top-user-name">{userName}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
