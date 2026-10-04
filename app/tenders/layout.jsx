'use client';

import { usePathname } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';

export default function TendersLayout({ children }) {
  const pathname = usePathname() || '';
  const daily = pathname === '/tenders/daily' || pathname.startsWith('/tenders/daily/');
  return <AppShell allowedRoles={daily ? ['A', 'M', 'T'] : ['A', 'M']}>{children}</AppShell>;
}
