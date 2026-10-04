import AppShell from '@/components/layout/AppShell';

export default function BoatBrothersLayout({ children }) {
  return <AppShell allowedRoles={['A']}>{children}</AppShell>;
}
