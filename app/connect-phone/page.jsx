import Link from 'next/link';
import { ArrowUpRight, Camera, CalendarOff, MapPin, PackageCheck, Receipt, Smartphone } from 'lucide-react';
import EmployeeAppBadge from '@/components/guide/EmployeeAppBadge';
import ModuleHeader from '@/components/layout/ModuleHeader';

const FLOWS = [
  { icon: MapPin, title: 'Check-ins and check-outs', body: 'Time and phone GPS position', href: '/attendance', module: 'Attendance', badge: 'Phone data' },
  { icon: Camera, title: 'Site photos', body: 'Photo, project, site and GPS position', href: '/progress', module: 'Site Progress', badge: 'Phone media' },
  { icon: PackageCheck, title: 'Delivery photos and quantities', body: 'Against a BOQ item', href: '/boqs', module: 'BOQs', badge: 'Phone media' },
  { icon: CalendarOff, title: 'Leave requests', body: 'Dates and reason', href: '/leaves', module: 'Leaves', badge: 'Phone data' },
  { icon: Receipt, title: 'Site expenses', body: 'Item and amount, where the role allows it', href: '/site-expenses', module: 'Site Expense', badge: 'Phone or console' },
];

export default function PhoneDataPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ModuleHeader
        icon={Smartphone}
        title="Phone data"
        badge={<EmployeeAppBadge label="From employees’ phones" />}
        description={
          <>
            What employees send from their phones and where it shows up. These modules carry the <EmployeeAppBadge className="mx-0.5 align-middle" /> or <EmployeeAppBadge label="Phone media" className="mx-0.5 align-middle" /> label.
          </>
        }
      />

      <ul className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--md-border)', background: 'var(--md-surface)' }}>
        {FLOWS.map(({ icon: Icon, title, body, href, module, badge }, i) => (
          <li key={title} className="flex flex-wrap items-center gap-4 px-4 py-3.5" style={{ borderTop: i ? '1px solid var(--md-border)' : 'none' }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--md-surface2)', color: 'var(--md-on)' }}>
              <Icon size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: 'var(--md-on)' }}>{title} <EmployeeAppBadge label={badge} /></p>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--md-muted)' }}>{body}</p>
            </div>
            <Link href={href} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--md-border)', color: 'var(--md-on)' }}>
              {module} <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-5" style={{ color: 'var(--md-dim)' }}>
        Admins can also add these records in the console, so a single row is not marked by device.
      </p>
    </div>
  );
}
