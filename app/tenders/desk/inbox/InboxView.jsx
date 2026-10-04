'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/components/desk/api';
import { Button, Empty, ErrorBox, PageTitle } from '@/components/desk/ui';
import { formatIST, istDateKey } from '@/lib/desk/format';

const REMINDER_KINDS = new Set([
  'FETCH_OPEN', 'BID_END', 'PRE_BID', 'EMD_OPEN', 'EMD_REFUND',
  'BID_POSTPONED', 'BID_EXTENDED', 'CHECKLIST_OPEN', 'SD_MISSING',
  'BG_EXPIRY', 'SD_APPLY', 'SD_WAITING', 'SD_RETURN', 'DIGEST',
]);

export function matchesNotificationFilter(item, filter) {
  if (filter === 'unread') return !item.readAt;
  if (filter === 'downloads') return item.kind === 'OFFICIAL_RETRIEVAL';
  if (filter === 'reminders') return REMINDER_KINDS.has(item.kind);
  return true;
}

export function InboxView({ items: initial, todayKey }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  // Background completion refreshes server props while this inbox stays mounted.
  useEffect(() => { setItems(initial); }, [initial]);

  const groups = useMemo(() => {
    const today = [];
    const earlier = [];
    for (const n of items.filter((item) => matchesNotificationFilter(item, filter))) {
      (istDateKey(n.scheduledFor) === todayKey ? today : earlier).push(n);
    }
    return { today, earlier };
  }, [items, todayKey, filter]);

  async function updateNotifications(method, json, update) {
    setBusy(true);
    setError('');
    try {
      await api('/api/desk/notifications', { method, json });
      setItems(update);
      router.refresh();
    } catch (err) {
      setError(err?.message || 'Could not update notifications. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function mark(id, unread = false) {
    return updateNotifications('PATCH', { id, unread }, (list) => list.map((n) =>
      n.id === id ? { ...n, readAt: unread ? null : new Date().toISOString() } : n));
  }

  function markAll() {
    return updateNotifications('PATCH', { all: true }, (list) => list.map((n) =>
      ({ ...n, readAt: n.readAt || new Date().toISOString() })));
  }

  function remove(id) {
    if (!items.some((n) => n.id === id) || !window.confirm('Delete this notification?')) return;
    return updateNotifications('DELETE', { id }, (list) => list.filter((n) => n.id !== id));
  }

  function removeRead() {
    if (!window.confirm('Delete all read notifications?')) return;
    return updateNotifications('DELETE', { read: true }, (list) => list.filter((n) => !n.readAt));
  }

  function Group({ title, rows }) {
    if (!rows.length) return null;
    return (
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</h2>
        <ul className="d-card divide-y divide-ink-100 overflow-hidden">
          {rows.map((n) => (
            <li key={n.id} className={`px-3 py-3 ${n.readAt ? 'inbox-read' : 'inbox-unread'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`inbox-title text-sm leading-5 ${n.readAt ? 'font-medium' : 'font-semibold'}`}>{n.title}</p>
                  {n.body ? <p className="inbox-body mt-1 whitespace-pre-wrap text-sm leading-5">{n.kind === 'OFFICIAL_RETRIEVAL' ? n.body.replace(/ Retrieval reference:[\s\S]*$/, '') : n.body}</p> : null}
                  <p className="mt-1 text-xs text-ink-600">{formatIST(n.scheduledFor)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {n.tenderId ? (
                    <a href={`/tenders/desk/tenders/${n.tenderId}`}>
                      <Button variant="secondary">Open tender</Button>
                    </a>
                  ) : n.kind === 'OFFICIAL_RETRIEVAL' ? (
                    <a href="/tenders/desk/jobs">
                      <Button variant="secondary">Open downloads</Button>
                    </a>
                  ) : n.kind === 'FETCH_OPEN' ? (
                    <a href="/tenders/desk/fetch"><Button variant="secondary">Open portal review</Button></a>
                  ) : null}
                  <Button variant="ghost" disabled={busy} onClick={() => mark(n.id, !!n.readAt)}>
                    {n.readAt ? 'Mark unread' : 'Mark read'}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => remove(n.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div>
      <PageTitle
        description="Download results, tender deadlines and security money reminders. Open a notification to continue the related task."
        aside={
          <div className="flex flex-wrap gap-2">
            {items.some((n) => !n.readAt) ? <Button variant="secondary" disabled={busy} onClick={markAll}>Mark all read</Button> : null}
            {items.some((n) => n.readAt) ? <Button variant="secondary" disabled={busy} onClick={removeRead}>Delete read</Button> : null}
          </div>
        }
      >
        Notifications
      </PageTitle>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter notifications">
        {[['all', 'All'], ['unread', 'Unread'], ['downloads', 'Downloads'], ['reminders', 'Reminders']].map(([value, label]) => (
          <Button key={value} variant={filter === value ? 'primary' : 'secondary'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>
        ))}
      </div>
      {error ? <div className="mb-4" role="alert"><ErrorBox>{error}</ErrorBox></div> : null}
      {busy ? <p className="mb-3 text-sm text-ink-500" role="status">Updating notifications…</p> : null}
      {!items.length ? <Empty>No notifications yet. Download results appear here automatically. Follow a tender to receive deadline and money reminders.</Empty>
        : !groups.today.length && !groups.earlier.length ? <Empty>No {filter === 'all' ? '' : filter} notifications to show.</Empty> : null}
      <Group title="Today" rows={groups.today} />
      <Group title="Earlier" rows={groups.earlier} />
    </div>
  );
}
