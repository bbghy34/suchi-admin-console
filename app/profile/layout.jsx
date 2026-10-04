import AppShell from '@/components/layout/AppShell';

export default function ProfileLayout({ children }) {
  return <AppShell contentClassName="mx-auto min-w-0 max-w-5xl">{children}</AppShell>;
}
