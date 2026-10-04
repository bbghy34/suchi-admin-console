import { Smartphone } from 'lucide-react';

/** Marks data or media that arrives from employees' phones. */
export default function EmployeeAppBadge({ label = 'Phone data', className = '' }) {
  return (
    <span
      title="Sent from employees’ phones"
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        color: 'var(--phone-badge, #2dd4bf)',
        background: 'color-mix(in srgb, var(--phone-badge, #2dd4bf) 12%, transparent)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--phone-badge, #2dd4bf) 28%, transparent)',
      }}
    >
      <Smartphone size={11} aria-hidden="true" />
      {label}
    </span>
  );
}
