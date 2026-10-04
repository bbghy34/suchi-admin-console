'use client';

import { useLayoutEffect, useState } from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { readAuthRole } from '@/lib/utils';
import Button from '@/components/ui/Button';

/**
 * RoleGuard - Client-side role authorization boundary
 * @param {string[]} allowedRoles - Array of roles permitted (e.g. ['A'], ['A', 'M'])
 * @param {React.ReactNode} children - Component to render if permitted
 */
export default function RoleGuard({ allowedRoles = [], allowBillAccess = false, children }) {
  const { user, isLoading } = useAuth();
  const [hintRole, setHintRole] = useState('');

  useLayoutEffect(() => {
    setHintRole(readAuthRole());
  }, [user]);

  const role = user?.role || (isLoading ? hintRole : '');

  const billPass = allowBillAccess && user?.canViewBills;
  if (isLoading && !(role && allowedRoles.includes(role)) && !billPass) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
          <p className="text-xs text-slate-500 font-medium">Verifying access permissions...</p>
        </div>
      </div>
    );
  }

  const isAllowed = (Boolean(role) && allowedRoles.includes(role)) || billPass;

  if (!isAllowed) {
    const roleTitle = {
      A: 'Administrator',
      AA: 'Accountant',
      M: 'Manager',
      E: 'Employee',
      T: 'Tender',
    }[role] || 'User';

    return (
      <div className="mx-auto my-12 max-w-lg rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-inner">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Access Restricted (403)</h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Your current account role (<span className="font-semibold text-slate-800">{roleTitle}</span>) does not have permission to view or manage this section.
        </p>
        <div className="mt-6 flex justify-center">
          <a href="/dashboard">
            <Button variant="primary" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span>Return to Dashboard</span>
            </Button>
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
