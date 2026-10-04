'use client';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { phoneWorkflow } from '@/lib/mobile-workflows.mjs';
import EmployeeAppBadge from './EmployeeAppBadge';

/** Banner on modules that receive data or media from employees' phones. */
export default function PhoneConnectionHelp() {
  const workflow = phoneWorkflow(usePathname());
  if (!workflow) return null;
  return (
    <details className="group overflow-hidden rounded-xl border" style={{ borderColor: 'var(--md-border)', background: 'var(--md-surface)' }}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <EmployeeAppBadge label={workflow.badge || 'Phone data'} />
        <span className="text-sm font-medium" style={{ color: 'var(--md-on)' }}>{workflow.title}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs" style={{ color: 'var(--md-dim)' }}>
          How it works <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--md-border)' }}>
        <p className="max-w-3xl text-sm leading-6" style={{ color: 'var(--md-muted)' }}>{workflow.detail}</p>
        <p className="mt-2 text-xs leading-5" style={{ color: 'var(--md-dim)' }}>
          Office staff can also add these records here, so a single row is not marked by device.
        </p>
        <a href="/connect-phone" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--md-primary)' }}>
          What phones send <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </details>
  );
}
