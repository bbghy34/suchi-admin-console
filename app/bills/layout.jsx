import AppShell from '@/components/layout/AppShell';

export default function BillsLayout({ children }) {
  return <AppShell allowedRoles={['AA', 'A']} allowBillAccess>{children}</AppShell>;
}
