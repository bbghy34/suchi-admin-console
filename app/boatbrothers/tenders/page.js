'use client';

import RoleGuard from '@/components/auth/RoleGuard';
import TenderDesk from '@/components/tenders/TenderDesk';

export default function BoatBrothersTendersPage() {
  return (
    <RoleGuard allowedRoles={['A']}>
      <TenderDesk mode="admin" />
    </RoleGuard>
  );
}
