'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Contact, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { useToast } from '@/components/providers/ToastProvider';
import Button from '@/components/ui/Button';
import ModuleHeader from '@/components/layout/ModuleHeader';
import Modal from '@/components/ui/Modal';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableLoadingState,
  TableEmptyState,
} from '@/components/ui/Table';

const fieldClass = 'mt-1 block w-full rounded-lg px-3 py-2 text-sm outline-none';
const fieldStyle = {
  background: 'var(--md-sidebar)',
  border: '1px solid var(--md-border-strong)',
  color: 'var(--md-on)',
};

const emptyForm = { name: '', phoneNo: '', gst: '' };

function authHeaders(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
      {label}
      {children}
    </label>
  );
}

function Hint({ children }) {
  return (
    <span className="mt-1 block font-normal" style={{ color: 'var(--md-dim)' }}>
      {children}
    </span>
  );
}

export default function PartiesPage() {
  const toast = useToast();
  const loadSequence = useRef(0);
  const [parties, setParties] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/parties?${params}`, { headers: authHeaders() });
      const json = await res.json();
      if (sequence !== loadSequence.current) return;
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not load parties.');
      setParties(json.data || []);
      setPages(json.pagination?.totalPages || 1);
      setTotal(json.pagination?.total || 0);
    } catch (loadError) {
      if (sequence !== loadSequence.current) return;
      setError(loadError.message || 'Could not load parties.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (party) => {
    setSelected(party || null);
    setForm(party ? {
      name: party.name || '',
      phoneNo: party.phoneNo || '',
      gst: party.gst || '',
    } : emptyForm);
    setFormError('');
    setModal('form');
  };

  const saveParty = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.name.trim()) {
      setFormError('Party name is required.');
      return;
    }
    if (!form.phoneNo.trim()) {
      setFormError('Phone number is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(selected ? `/api/parties/${selected.id}` : '/api/parties', {
        method: selected ? 'PUT' : 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          name: form.name.trim(),
          phoneNo: form.phoneNo.trim(),
          gst: form.gst.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.message || 'Could not save this party.');
        return;
      }
      toast.success(selected ? 'Party updated.' : 'Party added.');
      setModal(null);
      await load();
    } catch {
      setFormError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/parties/${selected.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Could not delete this party.');
        return;
      }
      toast.success('Party deleted.');
      setModal(null);
      await load();
    } catch {
      toast.error('Network error while deleting.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={Users}
        title="Parties"
        description="Party name, phone, and GST used on BOQ bills."
      />

      {error ? (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface)', color: '#e57373' }}>{error}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-xs" style={{ color: 'var(--md-dim)' }}>{total} part{total === 1 ? 'y' : 'ies'}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="relative text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              Search
              <Search className="pointer-events-none absolute left-3 top-8 h-4 w-4" style={{ color: 'var(--md-dim)' }} />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name, phone, or GST"
                className={`${fieldClass} pl-9`}
                style={fieldStyle}
              />
            </label>
            <Button variant="primary" size="sm" onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" /> Add party
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Party name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>GST</TableHead>
              <TableHead>Bills</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoadingState message="Loading parties…" cols={5} />
            ) : parties.length === 0 ? (
              <TableEmptyState
                colSpan={5}
                icon={Contact}
                title="No parties"
                description={search ? 'Nothing matches this search.' : 'Add the first party used on BOQ bills.'}
                action={!search ? (
                  <Button variant="primary" size="sm" onClick={() => openForm(null)}>
                    <Plus className="h-4 w-4" /> Add party
                  </Button>
                ) : null}
              />
            ) : (
              parties.map((party) => (
                <TableRow key={party.id}>
                  <TableCell><span className="font-medium" style={{ color: 'var(--md-on)' }}>{party.name}</span></TableCell>
                  <TableCell>{party.phoneNo}</TableCell>
                  <TableCell>{party.gst || '—'}</TableCell>
                  <TableCell>{party.billCount || 0}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => openForm(party)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        onClick={() => {
                          setSelected(party);
                          setModal('delete');
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-end gap-2 text-sm" style={{ color: 'var(--md-muted)' }}>
          <span>Page {page} of {pages}</span>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <Modal
        isOpen={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? 'Update party' : 'Add party'}
        description="Name and phone identify the party. GST is optional."
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" isLoading={saving} onClick={saveParty}>
              {selected ? 'Save changes' : 'Add party'}
            </Button>
          </>
        }
      >
        <form onSubmit={saveParty} className="space-y-3">
          {formError ? (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface)', color: '#e57373' }}>{formError}</p>
          ) : null}
          <Field label="Party name">
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className={fieldClass}
              style={fieldStyle}
            />
          </Field>
          <Field label="Phone number">
            <input
              required
              value={form.phoneNo}
              onChange={(event) => setForm((current) => ({ ...current, phoneNo: event.target.value }))}
              className={fieldClass}
              style={fieldStyle}
            />
          </Field>
          <Field label="GST">
            <input
              maxLength={15}
              value={form.gst}
              onChange={(event) => setForm((current) => ({ ...current, gst: event.target.value.toUpperCase() }))}
              className={fieldClass}
              style={fieldStyle}
            />
            <Hint>Optional. 15 letters and digits.</Hint>
          </Field>
        </form>
      </Modal>

      <Modal
        isOpen={modal === 'delete'}
        onClose={() => setModal(null)}
        title="Delete party"
        description={selected?.billCount ? 'This party is still used on bills.' : 'This removes the party from the directory.'}
        footer={
          selected?.billCount ? (
            <Button variant="outline" onClick={() => setModal(null)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
              <Button variant="danger" isLoading={saving} onClick={confirmDelete}>Delete</Button>
            </>
          )
        }
      >
        <p className="text-sm" style={{ color: 'var(--md-muted)' }}>
          {selected?.billCount
            ? `${selected.name} is used on ${selected.billCount} BOQ bill${selected.billCount === 1 ? '' : 's'}. Change those bills before deleting it.`
            : `${selected?.name || 'This party'} will be removed.`}
        </p>
      </Modal>
    </div>
  );
}
