'use client';
import AsyncStatus from '@/components/ui/AsyncStatus';

import { useEffect, useState } from 'react';
import { FolderOpen, Upload } from 'lucide-react';
import ModuleHeader from '@/components/layout/ModuleHeader';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import { useAuth } from '@/components/providers/AuthProvider';
import { Table, TableBody, TableCell, TableEmptyState, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { TENDER_ADMIN_PATH } from '@/lib/tender-portal-exchange';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TenderDesk({ mode }) {
  const isAdmin = mode === 'admin';
  const { user } = useAuth();
  const canOpenUpload = user?.role === 'A';
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projectRes, fileRes] = await Promise.all([
          fetch('/api/tenders', { credentials: 'include' }),
          fetch('/api/tenders/documents', { credentials: 'include' }),
        ]);
        const projectJson = await projectRes.json().catch(() => ({}));
        const fileJson = await fileRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!projectRes.ok || projectJson.success === false) {
          setError(projectJson.message || 'Could not load tenders.');
        } else {
          const list = Array.isArray(projectJson.data) ? projectJson.data : [];
          setProjects(list);
          setProjectId((current) => current || list[0]?.id || '');
        }
        if (!fileRes.ok || fileJson.success === false) {
          setError(fileJson.message || 'Could not load the tender file table.');
          setFiles([]);
        } else {
          setFiles(Array.isArray(fileJson.data) ? fileJson.data : []);
        }
      } catch {
        if (!cancelled) setError('Could not load the tender file table.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onUpload(kind, file) {
    if (!projectId || !file) return;
    setBusy(true);
    setNote('');
    setError('');
    try {
      const body = new FormData();
      body.set('projectId', projectId);
      body.set('kind', kind);
      body.set('file', file);
      const response = await fetch('/api/tenders/documents', {
        method: 'POST',
        body,
        credentials: 'include',
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.success === false) {
        setError(json.message || 'Could not save that file.');
        return;
      }
      setFiles(Array.isArray(json.data) ? json.data : []);
      setNote(json.message || 'Saved.');
    } catch {
      setError('Could not save that file.');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(doc) {
    setBusy(true);
    setNote('');
    setError('');
    try {
      const params = new URLSearchParams({ documentId: doc.id });
      const response = await fetch(`/api/tenders/documents?${params}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.success === false) {
        setError(json.message || 'Could not remove that file.');
        return;
      }
      setFiles(Array.isArray(json.data) ? json.data : []);
      setNote(json.message || 'Removed.');
    } catch {
      setError('Could not remove that file.');
    } finally {
      setBusy(false);
    }
  }

  const columns = isAdmin ? 7 : 6;

  return (
    <div className="space-y-5">
      <WorkflowGuide id={isAdmin ? 'tender-admin' : 'tender-portal'} />
      <ModuleHeader
        icon={isAdmin ? Upload : FolderOpen}
        title={isAdmin ? 'Tender upload' : 'Tender portal'}
        description={isAdmin
          ? 'Each upload is one row in the tender portal table, on the project that already has that tender ID.'
          : 'Files an admin has added for these tenders. Open a name to download it.'}
      />

      {isAdmin || canOpenUpload ? (
        <a
          href={isAdmin ? '/tenders/portal' : TENDER_ADMIN_PATH}
          className="inline-flex h-8 w-fit items-center rounded-md px-3 text-xs font-medium"
          style={{ color: 'var(--md-muted)', border: '1px solid var(--md-border-strong)' }}
        >
          {isAdmin ? 'Open tender portal' : 'Open tender upload'}
        </a>
      ) : null}

      {isAdmin ? (
        <section className="rounded-xl p-4" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>
            Add a row
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--md-muted)' }}>
            Pick the tender, then upload the tender file or a document. The new row shows in this table and on the tender portal.
          </p>
          <label className="mt-3 block text-xs font-medium" style={{ color: 'var(--md-muted)' }} htmlFor="tender-file-project">
            Tender
          </label>
          <select
            id="tender-file-project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            disabled={busy || projects.length === 0}
            className="mt-1 w-full max-w-md rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--md-surface2)', color: 'var(--md-on)', border: '1px solid var(--md-border)' }}
          >
            {projects.length === 0 ? <option value="">No tender IDs yet</option> : null}
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.tenderId} — {item.name}
              </option>
            ))}
          </select>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ['file', 'Upload tender file'],
              ['doc', 'Upload document'],
            ].map(([kind, label]) => (
              <label
                key={kind}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium"
                style={{
                  background: kind === 'file' ? 'var(--md-surface3)' : 'transparent',
                  color: kind === 'file' ? 'var(--md-on)' : 'var(--md-muted)',
                  border: '1px solid var(--md-border-strong)',
                  opacity: busy || !projectId ? 0.6 : 1,
                }}
              >
                <Upload className="h-3.5 w-3.5" />
                {label}
                <input
                  type="file"
                  className="sr-only"
                  disabled={busy || !projectId}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    event.target.value = '';
                    if (file) onUpload(kind, file);
                  }}
                />
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="text-sm" style={{ color: '#ef9a9a' }}>
          {error}
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tender ID</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Brought in</TableHead>
            <TableHead>Uploaded by</TableHead>
            {isAdmin ? <TableHead> </TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns}><AsyncStatus compact message="Loading tender files…" description="Reading the documents already attached to this project." /></TableCell>
            </TableRow>
          ) : files.length === 0 ? (
            <TableEmptyState
              colSpan={columns}
              title="No files in the table"
              description="Nothing has been uploaded yet."
            />
          ) : (
            files.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium" style={{ color: '#9fa8da' }}>
                  {doc.tenderId}
                </TableCell>
                <TableCell>{doc.projectName || '—'}</TableCell>
                <TableCell>{doc.label}</TableCell>
                <TableCell>
                  <a href={doc.url} className="break-all font-medium" style={{ color: '#9fa8da' }}>
                    {doc.name}
                  </a>
                </TableCell>
                <TableCell>{formatDate(doc.uploadedAt)}</TableCell>
                <TableCell>{doc.uploadedBy || '—'}</TableCell>
                {isAdmin ? (
                  <TableCell>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(doc)}
                      className="text-xs font-medium"
                      style={{ color: '#ef9a9a' }}
                    >
                      Remove
                    </button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
