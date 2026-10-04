'use client';
import AsyncStatus from '@/components/ui/AsyncStatus';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { formatWhen, warehouseApi } from '@/components/warehouse/api';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import { Warehouse } from 'lucide-react';
import ModuleHeader from '@/components/layout/ModuleHeader';
import { warehouseSections } from '@/components/layout/navigation';

const shortcutGroups = warehouseSections.filter((group) => group.items);

function movementLabel(movement = '') {
  const text = String(movement).toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function WarehouseDashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    warehouseApi('/api/warehouse/summary')
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, []);

  const cards = [
    { label: 'Materials', value: summary?.materialCount ?? '—' },
    { label: 'Suppliers', value: summary?.supplierCount ?? '—' },
    { label: 'Low stock', value: summary?.lowStockCount ?? '—' },
  ];

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={Warehouse}
        title="Warehouse"
        description="Stock on hand, goods in and out, and the master lists behind them. Set a minimum stock on a material to alert admins when on-hand quantity reaches it."
        help={<WorkflowGuide id="warehouse" />}
      />

      {user?.role === 'A' && summary?.lowStockCount > 0 && (
        <a href="/warehouse/low-stock" className="block rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(255,152,0,0.12)', color: '#ffcc80', border: '1px solid rgba(255,152,0,0.35)' }}>
          {summary.lowStockCount} material{summary.lowStockCount === 1 ? '' : 's'} at or below minimum stock. Open the low stock list.
        </a>
      )}
      {!summary && !error ? <AsyncStatus message="Loading warehouse overview…" description="Checking materials, current stock and recent movements." /> : null}
      {error && <p className="text-sm" style={{ color: '#ef9a9a' }}>{error}</p>}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl p-4" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--md-dim)' }}>{card.label}</p>
            <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--md-on)' }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {shortcutGroups.map((group) => (
          <section key={group.name} className="rounded-xl p-4" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>{group.name}</h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--md-dim)' }}>{group.hint}</p>
            <ul className="mt-3 space-y-0.5">
              {group.items.map(({ name, href, icon: Icon }) => (
                <li key={href}>
                  <a href={href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-mat-muted transition-colors hover:bg-mat-surface2 hover:text-mat-on">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {href === '/warehouse/low-stock' && summary?.lowStockCount > 0 ? (
                      <span className="rounded-full px-1.5 text-[11px] font-semibold" style={{ background: 'rgba(255,152,0,0.15)', color: '#ffb74d' }}>{summary.lowStockCount}</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>Recent stock movements</h2>
        <ul className="mt-3 space-y-2">
          {(summary?.recentLedger || []).length === 0 && <li className="text-sm" style={{ color: 'var(--md-muted)' }}>No movements yet.</li>}
          {(summary?.recentLedger || []).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 text-sm" style={{ color: 'var(--md-muted)' }}>
              <span>{row.material?.code} — {row.material?.name}</span>
              <span>{movementLabel(row.movement)} {Number(row.quantity) > 0 ? '+' : ''}{row.quantity}</span>
              <span style={{ color: 'var(--md-dim)' }}>{formatWhen(row.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
