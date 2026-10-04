import AppShell from '@/components/layout/AppShell';

export default function EmployeesLayout({ children }) {
  return <AppShell allowedRoles={['A', 'M']}>{children}</AppShell>;
}
