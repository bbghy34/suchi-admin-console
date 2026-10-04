import AppShell from '@/components/layout/AppShell';

export default function ProjectsLayout({ children }) {
  return <AppShell allowedRoles={['A', 'M']}>{children}</AppShell>;
}
