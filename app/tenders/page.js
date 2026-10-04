'use client';
import AsyncStatus from '@/components/ui/AsyncStatus';

import { useEffect, useState } from 'react';
import { FileText, KeyRound } from 'lucide-react';
import ManualPortalExchange from '@/components/tenders/ManualPortalExchange';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
import { formatINR } from '@/lib/utils';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TendersPage() {
  const [projects, setProjects] = useState([]);
  const [captcha, setCaptcha] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [captchaError, setCaptchaError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projectRes, captchaRes] = await Promise.all([
          fetch('/api/tenders', { credentials: 'include' }),
          fetch('/api/tenders/captcha-status', { credentials: 'include' }),
        ]);
        const projectJson = await projectRes.json().catch(() => ({}));
        const captchaJson = await captchaRes.json().catch(() => ({}));
        if (cancelled) return;

        if (!projectRes.ok || projectJson.success === false) {
          setError(projectJson.message || 'Could not load tender references.');
          setProjects([]);
        } else {
          const list = Array.isArray(projectJson.data) ? projectJson.data : [];
          setProjects(list);
        }

        if (!captchaRes.ok || captchaJson.success === false) {
          setCaptchaError(captchaJson.message || 'Could not read the 2Captcha key status.');
        } else {
          setCaptcha(captchaJson.data || null);
        }
      } catch {
        if (!cancelled) setError('Could not load tenders.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const placeholder = captcha?.placeholder || 'YOUR_2CAPTCHA_API_KEY';

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={FileText}
        title="Tenders"
        description="Projects that carry a tender reference. The 2Captcha key stays in the server environment."
        help={<WorkflowGuide id="tenders" />}
      />

      <a href="/tenders/desk/search" className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Search notices in Tender Desk</a>

      <div className="rounded-xl p-4" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#7986cb' }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>
                2Captcha API key
              </h2>
              {!captchaError && captcha && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={
                    captcha.configured
                      ? { background: 'rgba(102,187,106,0.12)', color: '#81c784', border: '1px solid rgba(102,187,106,0.3)' }
                      : { background: 'rgba(255,152,0,0.12)', color: '#ffcc80', border: '1px solid rgba(255,152,0,0.35)' }
                  }
                >
                  {captcha.configured ? 'Configured' : 'Not configured'}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--md-muted)' }}>
              {captchaError
                ? captchaError
                : captcha?.configured
                  ? `A key is set in ${captcha?.source || 'TWOCAPTCHA_API_KEY'}. The value stays on the server and is never shown here.`
                  : 'No key is set yet. Add it to the server environment; it is never entered on this page.'}
            </p>
            {!captchaError && !captcha?.configured && (
              <>
                <label className="mt-3 block text-xs font-medium" style={{ color: 'var(--md-muted)' }} htmlFor="twocaptcha-key-placeholder">
                  {captcha?.source || 'TWOCAPTCHA_API_KEY'}
                </label>
                <input
                  id="twocaptcha-key-placeholder"
                  readOnly
                  value=""
                  placeholder={placeholder}
                  aria-describedby="twocaptcha-key-hint"
                  className="mt-1 w-full max-w-md rounded-md px-3 py-2 font-mono text-sm outline-none"
                  style={{ background: 'var(--md-surface2)', color: 'var(--md-on)', border: '1px solid var(--md-border)' }}
                />
                <p id="twocaptcha-key-hint" className="mt-2 break-all font-mono text-xs" style={{ color: '#9fa8da' }}>
                  TWOCAPTCHA_API_KEY=&quot;{placeholder}&quot;
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <ManualPortalExchange />

      {error && (
        <p className="text-sm" style={{ color: '#ef9a9a' }}>
          {error}
        </p>
      )}

      {loading ? (
        <AsyncStatus message="Loading tender references…" description="Finding projects with saved tender references." />
      ) : error ? null : projects.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--md-muted)' }}>
          No projects have a tender ID yet. Add one on the project record.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {projects.map((item) => (
            <a
              key={item.id}
              href={`/projects/${item.id}`}
              className="min-w-0 overflow-hidden rounded-xl p-4"
              style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex min-w-0 items-start gap-1 break-all text-xs font-semibold" style={{ color: '#9fa8da' }}>
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {item.tenderId}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: 'var(--md-muted)' }}>
                  {item.status || '—'}
                </span>
              </div>
              <p className="mt-2 break-words text-sm font-semibold" style={{ color: 'var(--md-on)' }}>
                {item.name}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs" style={{ color: 'var(--md-muted)' }}>
                <div className="min-w-0">
                  <dt style={{ color: 'var(--md-muted)' }}>Department</dt>
                  <dd className="break-words">{item.department || '—'}</dd>
                </div>
                <div className="min-w-0">
                  <dt style={{ color: 'var(--md-muted)' }}>Contractor</dt>
                  <dd className="break-words">{item.contractor || '—'}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--md-muted)' }}>Budget</dt>
                  <dd>{formatINR(item.budget)}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--md-muted)' }}>Progress</dt>
                  <dd>{item.progress == null ? '—' : `${item.progress}%`}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--md-muted)' }}>Start</dt>
                  <dd>{formatDate(item.startDate)}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--md-muted)' }}>End</dt>
                  <dd>{formatDate(item.endDate)}</dd>
                </div>
              </dl>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
