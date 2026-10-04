import AppShell from '@/components/layout/AppShell';
export default function Layout({children}) { return <AppShell allowedRoles={['A','M','E','AA']}>{children}</AppShell>; }
