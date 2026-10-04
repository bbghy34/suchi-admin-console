import AppShell from '@/components/layout/AppShell';

export default function BoqsLayout({ children }) {
  return <AppShell allowedRoles={['A', 'M']}>{children}</AppShell>;
}
