'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import Credit from '@/components/layout/Credit';
import RoleGuard from '@/components/auth/RoleGuard';
import WorkspaceGate from '@/components/luit-admin/WorkspaceGate';

/**
 * Admin shell. The column is locked to the viewport so the sidebar and navbar
 * stay put, and only the main region scrolls.
 */
export default function AppShell({
  children,
  allowedRoles,
  allowBillAccess = false,
  contentClassName = 'mx-auto min-w-0 max-w-7xl',
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const body = allowedRoles?.length ? (
    <RoleGuard allowedRoles={allowedRoles} allowBillAccess={allowBillAccess}>{children}</RoleGuard>
  ) : (
    children
  );

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--md-bg)', color: 'var(--md-on)' }}>
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onMenuToggle={() => setMobileSidebarOpen(true)} />
        <main className="console-canvas min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className={contentClassName}><WorkspaceGate>{body}</WorkspaceGate></div>
        </main>
        <footer className="shrink-0 px-4 pb-2.5 pt-0.5" style={{ background: 'var(--md-bg)' }}>
          <Credit />
        </footer>
      </div>
    </div>
  );
}
