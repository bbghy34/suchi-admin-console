'use client';

export function ProgressGallery({ rows, loading }) {
  if (loading) return <p className="text-sm" style={{ color: 'var(--md-muted)' }}>Loading progress…</p>;
  if (!rows?.length) return <p className="text-sm" style={{ color: 'var(--md-muted)' }}>No progress photos yet.</p>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <article key={row.id} className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--md-border)', background: 'var(--md-sidebar)' }}>
          <img src={row.images} alt="Site progress" className="h-44 w-full object-cover" style={{ background: 'var(--md-bg)' }} />
          <div className="space-y-1 p-3 text-xs" style={{ color: 'var(--md-muted)' }}>
            <p><span style={{ color: 'var(--md-dim)' }}>Progress date </span>{row.createdAt ? new Date(row.createdAt).toLocaleString('en-IN') : '—'}</p>
            <p><span style={{ color: 'var(--md-dim)' }}>Project </span>{row.project?.name || '—'}</p>
            <p><span style={{ color: 'var(--md-dim)' }}>Site </span>{row.site?.name || '—'}</p>
            <p><span style={{ color: 'var(--md-dim)' }}>Latitude </span>{row.latitude}</p>
            <p><span style={{ color: 'var(--md-dim)' }}>Longitude </span>{row.longitude}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
