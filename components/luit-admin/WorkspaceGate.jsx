'use client';

import { usePathname } from 'next/navigation';
import { Info, PackageX, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { routeEnabled } from '@/config/modules';

/**
 * Applies the Luit admin's workspace settings to a console page: the notice
 * banner, and a short card in place of a module that is switched off.
 * Until the session loads, the page shows as before.
 */
export default function WorkspaceGate({ children }) {
  const pathname = usePathname() || '';
  const { user } = useAuth();
  const ids = Array.isArray(user?.enabledModules) ? new Set(user.enabledModules) : null;
  const notice = user?.workspaceNotice;
  const switchedOff = ids && !routeEnabled(pathname, ids);
  const warning = notice?.tone === 'warning';
  const NoticeIcon = warning ? TriangleAlert : Info;

  return (
    <>
      {notice?.text ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
          style={{
            background: warning ? 'rgba(255,152,0,0.12)' : 'color-mix(in srgb, var(--md-primary) 12%, transparent)',
            border: `1px solid ${warning ? 'rgba(255,152,0,0.35)' : 'color-mix(in srgb, var(--md-primary) 35%, transparent)'}`,
            color: 'var(--md-on)',
          }}
        >
          <NoticeIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice.text}</span>
        </div>
      ) : null}
      {switchedOff ? (
        <div className="mx-auto mt-10 max-w-md rounded-2xl p-6 text-center" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
          <PackageX className="mx-auto h-8 w-8 text-mat-dim" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-mat-on">This module is not available</h1>
          <p className="mt-1 text-sm text-mat-muted">It is not switched on for your workspace. Ask your administrator if you need it.</p>
          <a href="/dashboard" className="mt-4 inline-block text-sm font-medium text-primary-300 underline-offset-4 hover:underline">Back to the dashboard</a>
        </div>
      ) : (
        children
      )}
    </>
  );
}
