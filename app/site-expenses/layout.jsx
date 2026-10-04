import AppShell from '@/components/layout/AppShell';

export default function SiteExpensesLayout({ children }) {
  return <AppShell allowedRoles={['A', 'M']}>{children}</AppShell>;
}
