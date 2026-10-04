import AppShell from '@/components/layout/AppShell';

export default function WarehouseLayout({ children }) {
  return <AppShell allowedRoles={['A', 'M']}>{children}</AppShell>;
}
