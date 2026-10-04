import AppShell from '@/components/layout/AppShell';

export default function PartiesLayout({ children }) {
  return <AppShell allowedRoles={['AA']} allowBillAccess>{children}</AppShell>;
}
