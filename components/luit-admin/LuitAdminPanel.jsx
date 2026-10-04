'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Layers, RefreshCw, XCircle } from 'lucide-react';
import ModuleHeader from '@/components/layout/ModuleHeader';
import Button from '@/components/ui/Button';
import AsyncStatus from '@/components/ui/AsyncStatus';

const STATES = [
  { id: 'on', label: 'On', hint: 'Everyone with the right role' },
  { id: 'preview', label: 'Preview', hint: 'Only the Luit admin' },
  { id: 'off', label: 'Off', hint: 'Nobody' },
];

const TABS = [
  { id: 'modules', label: 'Modules' },
  { id: 'notice', label: 'Notice' },
  { id: 'services', label: 'Services' },
  { id: 'activity', label: 'Activity' },
];

const card = 'rounded-xl border border-[var(--md-border)] bg-[var(--md-surface)]';

function when(iso) {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function Stat({ label, value, hint }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-mat-dim">{label}</p>
      <p className="mt-1.5 truncate text-xl font-semibold text-mat-on">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-mat-dim">{hint}</p> : null}
    </div>
  );
}

export default function LuitAdminPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [tab, setTab] = useState('modules');
  const [notice, setNotice] = useState({ text: '', tone: 'info', active: false });

  const apply = (body) => {
    setData(body);
    setNotice(body.notice);
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/luit-admin', { credentials: 'same-origin', cache: 'no-store' });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Could not load the Luit admin panel.');
      apply(body);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(change, key) {
    setSaving(key);
    setError('');
    try {
      const res = await fetch('/api/luit-admin', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'The change was not saved.');
      apply(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  const families = useMemo(() => {
    const groups = new Map();
    for (const module of data?.modules || []) {
      if (!groups.has(module.family)) groups.set(module.family, []);
      groups.get(module.family).push(module);
    }
    return [...groups.entries()];
  }, [data]);
  const names = useMemo(() => new Map((data?.modules || []).map((m) => [m.id, m.name.split(' — ').pop()])), [data]);
  const stateOf = (id) => data?.modules.find((m) => m.id === id)?.state;

  if (!data && !error) return <AsyncStatus message="Opening Luit Admin…" description="Reading this workspace's modules and services." />;

  const live = (data?.modules || []).filter((m) => m.state === 'on').length;
  const healthy = (data?.status.checks || []).filter((c) => c.ok).length;

  return (
    <div className="space-y-6">
      <ModuleHeader
        icon={Layers}
        title="Luit Admin"
        description={data ? `Workspace for ${data.client.name}. Only you can open this page.` : 'Only you can open this page.'}
        actions={<Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      {error ? (
        <p role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,83,80,0.08)', color: '#ef9a9a', border: '1px solid rgba(239,83,80,0.25)' }}>{error}</p>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Client" value={data.client.name} hint={data.client.emailDomain} />
            <Stat label="Modules live" value={`${live} / ${data.modules.length}`} hint={live === data.modules.length ? 'Everything on' : 'Some switched off'} />
            <Stat label="Services" value={`${healthy} / ${data.status.checks.length}`} hint={`v${data.status.version} · ${data.status.environment}`} />
            <Stat label="Notice" value={data.notice.active ? 'Showing' : 'Off'} hint={data.notice.active ? data.notice.text : 'No message on screens'} />
          </div>

          <div className="flex gap-1 border-b border-[var(--md-border)]" role="tablist" aria-label="Luit Admin sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === item.id ? 'border-primary-400 text-mat-on' : 'border-transparent text-mat-dim hover:text-mat-on'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'modules' ? (
            <div className={`${card} divide-y divide-[var(--md-border)]`}>
              <p className="px-4 py-3 text-xs leading-5 text-mat-dim">
                Every module is on by default. <span className="text-mat-muted">Preview</span> shows a module only to you; <span className="text-mat-muted">Off</span> hides it for everyone. A module that needs another follows it.
              </p>
              {families.map(([family, modules]) => (
                <div key={family} className="px-4 py-3">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-mat-dim">{family}</p>
                  <ul>
                    {modules.map((module) => {
                      const blocked = (module.requires || []).filter((id) => stateOf(id) === 'off');
                      return (
                        <li key={module.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                          <div className="min-w-0">
                            <p className="text-sm text-mat-on">{module.name.split(' — ').pop()}</p>
                            <p className="truncate text-xs text-mat-dim">
                              {module.routes.join('  ')}
                              {blocked.length ? <span className="text-amber-300"> · hidden while {blocked.map((id) => names.get(id)).join(', ')} is off</span> : null}
                              {!module.purchased ? <span className="text-amber-300"> · not in plan</span> : null}
                            </p>
                          </div>
                          {module.core ? (
                            <span className="text-xs text-mat-dim">Always on</span>
                          ) : (
                            <div className="luit-segment" role="group" aria-label={`${module.name} visibility`}>
                              {STATES.map((state) => (
                                <button
                                  key={state.id}
                                  type="button"
                                  title={state.hint}
                                  aria-pressed={module.state === state.id}
                                  disabled={!module.purchased || saving === module.id}
                                  onClick={() => module.state !== state.id && save({ modules: { [module.id]: state.id } }, module.id)}
                                >
                                  {state.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'notice' ? (
            <form className={`${card} space-y-3 p-4`} onSubmit={(event) => { event.preventDefault(); save({ notice }, 'notice'); }}>
              <p className="text-xs text-mat-dim">A short line at the top of every console page, for planned downtime or a new feature.</p>
              <textarea
                rows={3}
                maxLength={280}
                value={notice.text}
                onChange={(event) => setNotice({ ...notice, text: event.target.value })}
                placeholder="Luit will be updated tonight from 10 pm to 10:30 pm."
                className="w-full rounded-lg border border-[var(--md-border)] bg-[var(--md-surface2)] px-3 py-2 text-sm text-mat-on outline-none placeholder:text-mat-dim focus:border-primary-400"
              />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="luit-segment" role="group" aria-label="Notice style">
                  {[['info', 'Information'], ['warning', 'Warning']].map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={notice.tone === id} onClick={() => setNotice({ ...notice, tone: id })}>{label}</button>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 text-mat-muted">
                  <input type="checkbox" checked={notice.active} onChange={(event) => setNotice({ ...notice, active: event.target.checked })} />
                  Show on every page
                </label>
                <Button type="submit" variant="primary" size="sm" isLoading={saving === 'notice'} className="ml-auto">Save</Button>
              </div>
            </form>
          ) : null}

          {tab === 'services' ? (
            <ul className={`${card} divide-y divide-[var(--md-border)]`}>
              {data.status.checks.map((check) => (
                <li key={check.id} className="flex items-center gap-3 px-4 py-3">
                  {check.ok
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-label="Working" />
                    : <XCircle className="h-4 w-4 shrink-0 text-red-400" aria-label="Needs attention" />}
                  <span className="min-w-0 flex-1 text-sm text-mat-on">{check.label}</span>
                  <span className="truncate text-xs text-mat-dim">{check.detail}</span>
                </li>
              ))}
              <li className="px-4 py-3 text-xs text-mat-dim">
                Version {data.status.version}{data.status.commit ? ` · ${data.status.commit}` : ''} · {data.status.environment}
              </li>
            </ul>
          ) : null}

          {tab === 'activity' ? (
            data.log.length ? (
              <ul className={`${card} divide-y divide-[var(--md-border)]`}>
                {data.log.map((entry) => (
                  <li key={`${entry.at}-${entry.change}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="text-sm text-mat-on">{entry.change}</span>
                    <span className="text-xs text-mat-dim">{entry.by} · {when(entry.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${card} px-4 py-6 text-center text-sm text-mat-dim`}>No changes yet.</p>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
