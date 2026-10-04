import AppShell from '@/components/layout/AppShell';

export default function FirmsLayout({ children }) {
  return <AppShell allowedRoles={['A', 'M']}>{children}</AppShell>;
}
