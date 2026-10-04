import AppShell from '@/components/layout/AppShell';

export default function DesignationsLayout({ children }) {
  return <AppShell allowedRoles={['A']}>{children}</AppShell>;
}
