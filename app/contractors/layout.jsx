import AppShell from '@/components/layout/AppShell';

export default function ContractorsLayout({ children }) {
  return <AppShell allowedRoles={['A', 'M']}>{children}</AppShell>;
}
