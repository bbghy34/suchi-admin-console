import { redirect } from 'next/navigation';

export default function DashboardAttendanceRedirect() {
  redirect('/attendance');
}
