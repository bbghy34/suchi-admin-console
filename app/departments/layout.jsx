import AppShell from '@/components/layout/AppShell';

export default function DepartmentsLayout({ children }) {
  return <AppShell allowedRoles={['A']}>{children}</AppShell>;
}
