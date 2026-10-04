'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  Phone,
  Briefcase,
  Users,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  MapPin,
  User,
  Hash,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { validatePhone } from '@/lib/validation';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
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
import { CLIENT } from '@/config/client';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const EMPTY_FORM = {
  name: '',
  gstNo: '',
  address: '',
  proprietorName: '',
  phoneNo: '',
};

// ── Module-level helpers (stable identity — never defined inside a component) ──
const inputStyle = (hasError) => ({
  width: '100%',
  background: 'var(--md-surface2)',
  border: `1px solid ${hasError ? '#ef5350' : 'var(--md-surface3)'}`,
  borderRadius: '8px',
  padding: '8px 12px',
  color: 'var(--md-on)',
  fontSize: '0.875rem',
  outline: 'none',
});

function Field({ id, label, required, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--md-muted)' }}>
        {label}{required && <span style={{ color: '#ef5350' }}> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs" style={{ color: '#ef5350' }}>{error}</p>}
    </div>
  );
}

function StatBadge({ icon: Icon, label, count, color }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--md-surface2)' }}>
      <Icon className="h-4 w-4" style={{ color }} />
      <span className="text-xs" style={{ color: 'var(--md-muted)' }}>{label}</span>
      <span className="text-sm font-bold ml-auto" style={{ color }}>{count}</span>
    </div>
  );
}

export default function FirmsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'A';

  // ── Data ──────────────────────────────────────────────────────────────────
  const [firms, setFirms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Alerts ────────────────────────────────────────────────────────────────
  const [errorMessage, setErrorMessage]   = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // ── Modals ────────────────────────────────────────────────────────────────
  const [isAddModalOpen, setIsAddModalOpen]       = useState(false);
  const [isEditModalOpen, setIsEditModalOpen]     = useState(false);
  const [isViewModalOpen, setIsViewModalOpen]     = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // ── Selected / Detail ──────────────────────────────────────────────────────
  const [selectedFirm, setSelectedFirm]               = useState(null);
  const [viewDetails, setViewDetails]                 = useState(null);
  const [isLoadingViewDetails, setIsLoadingViewDetails] = useState(false);

  // ── Form ──────────────────────────────────────────────────────────────────
  const [formData, setFormData]           = useState(EMPTY_FORM);
  const [formErrors, setFormErrors]       = useState({});
  const [formGeneralError, setFormGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting]   = useState(false);

  // Auto-dismiss success
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(''), 4500);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchFirms = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (showInactive && isAdmin) params.set('includeInactive', 'true');

      const res  = await fetch(`/api/firms?${params}`, { headers: getAuthHeaders() });
      const json = await res.json();

      if (res.ok && json.success) {
        setFirms(json.data || []);
        if (json.pagination) {
          setTotalRecords(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        }
      } else {
        setErrorMessage(json.message || 'Failed to load firms.');
      }
    } catch {
      setErrorMessage('Network error while retrieving firms.');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchQuery, showInactive, isAdmin]);

  useEffect(() => { fetchFirms(); }, [fetchFirms]);

  const handleSearchChange = (val) => { setSearchQuery(val); setPage(1); };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmt = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Firm name is required.';
    if (formData.phoneNo?.trim()) {
      const err = validatePhone(formData.phoneNo.trim());
      if (err) errors.phoneNo = err;
    }
    if (formData.gstNo?.trim()) {
      const gst = formData.gstNo.trim().toUpperCase();
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst)) {
        errors.gstNo = 'Enter a valid 15-character GST number.';
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Modal Openers ─────────────────────────────────────────────────────────
  const openAddModal = () => {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setFormGeneralError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (firm) => {
    setSelectedFirm(firm);
    setFormData({
      name:           firm.name           || '',
      gstNo:          firm.gstNo          || '',
      address:        firm.address        || '',
      proprietorName: firm.proprietorName || '',
      phoneNo:        firm.phoneNo        || '',
    });
    setFormErrors({});
    setFormGeneralError('');
    setIsEditModalOpen(true);
  };

  const openViewModal = async (firm) => {
    setSelectedFirm(firm);
    setViewDetails(null);
    setIsViewModalOpen(true);
    setIsLoadingViewDetails(true);
    try {
      const res  = await fetch(`/api/firms/${firm.id}`, { headers: getAuthHeaders() });
      const json = await res.json();
      setViewDetails(res.ok && json.success ? json.data : firm);
    } catch {
      setViewDetails(firm);
    } finally {
      setIsLoadingViewDetails(false);
    }
  };

  const openDeleteModal = (firm) => {
    setSelectedFirm(firm);
    setFormGeneralError('');
    setIsDeleteModalOpen(true);
  };

  // ── CRUD Handlers ─────────────────────────────────────────────────────────
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormGeneralError('');
    if (!validateForm()) { setFormGeneralError('Please fix the errors above.'); return; }
    setIsSubmitting(true);
    try {
      const res  = await fetch('/api/firms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name:           formData.name.trim(),
          gstNo:          formData.gstNo.trim()          || undefined,
          address:        formData.address.trim()        || undefined,
          proprietorName: formData.proprietorName.trim() || undefined,
          phoneNo:        formData.phoneNo.trim()        || undefined,
          createdBy:      user?.id,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setIsAddModalOpen(false);
        setSuccessMessage(`Firm "${json.data.name}" created successfully.`);
        toast?.success?.(`Firm "${json.data.name}" created.`);
        fetchFirms();
      } else {
        setFormGeneralError(json.message || 'Failed to create firm.');
      }
    } catch {
      setFormGeneralError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setFormGeneralError('');
    if (!validateForm()) { setFormGeneralError('Please fix the errors above.'); return; }
    setIsSubmitting(true);
    try {
      const res  = await fetch(`/api/firms/${selectedFirm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name:           formData.name.trim(),
          gstNo:          formData.gstNo.trim()          || null,
          address:        formData.address.trim()        || null,
          proprietorName: formData.proprietorName.trim() || null,
          phoneNo:        formData.phoneNo.trim()        || null,
          updatedBy:      user?.id,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setIsEditModalOpen(false);
        setSuccessMessage(`Firm "${json.data.name}" updated successfully.`);
        toast?.success?.(`Firm "${json.data.name}" updated.`);
        fetchFirms();
      } else {
        setFormGeneralError(json.message || 'Failed to update firm.');
      }
    } catch {
      setFormGeneralError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const turningOn = selectedFirm?.isActive === false;
      const res  = await fetch(`/api/firms/${selectedFirm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ isActive: turningOn }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setIsDeleteModalOpen(false);
        const verb = selectedFirm?.isActive === false ? 'activated' : 'deactivated';
        setSuccessMessage(`Firm "${selectedFirm.name}" ${verb}. The record was kept.`);
        toast?.success?.(`Firm ${verb}.`);
        fetchFirms();
      } else {
        setFormGeneralError(json.message || 'Failed to delete firm.');
      }
    } catch {
      setFormGeneralError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <ModuleHeader
        icon={Building2}
        title="Firms"
        description={<>{totalRecords} firm{totalRecords !== 1 ? 's' : ''} registered</>}
        help={<WorkflowGuide id="firms" />}
        actions={isAdmin ? (
          <Button id="btn-add-firm" onClick={openAddModal} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Firm
          </Button>
        ) : null}
      />

      {/* Notifications */}
      {errorMessage && (
        <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)' }}>
          <AlertCircle className="h-5 w-5 shrink-0" style={{ color: '#ef5350' }} />
          <p className="text-sm" style={{ color: '#ef5350' }}>{errorMessage}</p>
          <button onClick={() => setErrorMessage('')} className="ml-auto" style={{ color: '#ef5350' }}><X className="h-4 w-4" /></button>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(102,187,106,0.1)', border: '1px solid rgba(102,187,106,0.25)' }}>
          <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: '#66bb6a' }} />
          <p className="text-sm" style={{ color: '#66bb6a' }}>{successMessage}</p>
          <button onClick={() => setSuccessMessage('')} className="ml-auto" style={{ color: '#66bb6a' }}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Search + Refresh */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--md-dim)' }} />
              <input
                id="firms-search"
                type="text"
                placeholder="Search by name, GST, proprietor, phone…"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--md-surface2)', border: '1px solid var(--md-surface3)', color: 'var(--md-on)', outline: 'none' }}
              />
            </div>
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs font-medium shrink-0" style={{ color: 'var(--md-muted)' }}>
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show deactivated
              </label>
            )}
            <Button id="btn-refresh-firms" variant="ghost" onClick={fetchFirms} disabled={isLoading} className="flex items-center gap-2 shrink-0">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firm Name</TableHead>
                <TableHead>GST No.</TableHead>
                <TableHead>Proprietor</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            {isLoading ? (
              <TableLoadingState rows={4} cols={8} />
            ) : firms.length === 0 ? (
              <TableEmptyState
                colSpan={8}
                icon={Building2}
                title="No firms found"
                description={searchQuery ? 'Try adjusting your search.' : 'Add your first firm to get started.'}
              />
            ) : (
              <TableBody>
                {firms.map((firm) => (
                  <TableRow key={firm.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                          style={{ background: 'rgba(92,107,192,0.15)', color: '#7986cb' }}
                        >
                          {firm.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm" style={{ color: 'var(--md-on)' }}>{firm.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs" style={{ color: firm.gstNo ? 'var(--md-on)' : 'var(--md-dim)' }}>
                        {firm.gstNo || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: firm.proprietorName ? 'var(--md-on)' : 'var(--md-dim)' }}>
                        {firm.proprietorName || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: firm.phoneNo ? 'var(--md-on)' : 'var(--md-dim)' }}>
                        {firm.phoneNo || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ background: 'rgba(92,107,192,0.15)', color: '#7986cb' }}
                      >
                        <Users className="h-3 w-3" /> {firm.employeeCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ background: 'rgba(255,183,77,0.12)', color: '#ffb74d' }}
                      >
                        <Briefcase className="h-3 w-3" /> {firm.projectCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs" style={{ color: 'var(--md-muted)' }}>{fmt(firm.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          id={`btn-view-firm-${firm.id}`}
                          onClick={() => openViewModal(firm)}
                          className="rounded-lg p-1.5 transition-colors"
                          style={{ color: 'var(--md-muted)' }}
                          onMouseOver={e => e.currentTarget.style.color = '#7986cb'}
                          onMouseOut={e => e.currentTarget.style.color = 'var(--md-muted)'}
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              id={`btn-edit-firm-${firm.id}`}
                              onClick={() => openEditModal(firm)}
                              className="rounded-lg p-1.5 transition-colors"
                              style={{ color: 'var(--md-muted)' }}
                              onMouseOver={e => e.currentTarget.style.color = '#ffd54f'}
                              onMouseOut={e => e.currentTarget.style.color = 'var(--md-muted)'}
                              title="Edit firm"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              id={`btn-delete-firm-${firm.id}`}
                              onClick={() => openDeleteModal(firm)}
                              className="rounded-lg p-1.5 transition-colors"
                              style={{ color: 'var(--md-muted)' }}
                              onMouseOver={e => e.currentTarget.style.color = '#ef5350'}
                              onMouseOut={e => e.currentTarget.style.color = 'var(--md-muted)'}
                              title={firm.isActive === false ? 'Activate firm' : 'Deactivate firm'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: 'var(--md-dim)' }}>
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalRecords)} of {totalRecords}
          </p>
          <div className="flex items-center gap-2">
            <Button
              id="btn-prev-page-firms"
              variant="ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-sm" style={{ color: 'var(--md-muted)' }}>{page} / {totalPages}</span>
            <Button
              id="btn-next-page-firms"
              variant="ghost"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Add Modal ─────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Firm"
        description="Register a new firm in the system."
      >
        <form onSubmit={handleAddSubmit} className="space-y-5">
          <div className="space-y-4">
            <Field id="firm-name" label="Firm Name" required error={formErrors.name}>
              <input
                id="firm-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={`e.g. ${CLIENT.sampleFirmName}`}
                style={inputStyle(!!formErrors.name)}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="firm-gst" label="GST Number" error={formErrors.gstNo}>
                <input
                  id="firm-gst"
                  type="text"
                  value={formData.gstNo}
                  onChange={(e) => setFormData((prev) => ({ ...prev, gstNo: e.target.value.toUpperCase() }))}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  maxLength={15}
                  style={inputStyle(!!formErrors.gstNo)}
                />
              </Field>
              <Field id="firm-phone" label="Phone Number" error={formErrors.phoneNo}>
                <input
                  id="firm-phone"
                  type="tel"
                  value={formData.phoneNo}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phoneNo: e.target.value }))}
                  placeholder="e.g. +91 98765 43210"
                  style={inputStyle(!!formErrors.phoneNo)}
                />
              </Field>
            </div>
            <Field id="firm-proprietor" label="Proprietor / Director Name" error={formErrors.proprietorName}>
              <input
                id="firm-proprietor"
                type="text"
                value={formData.proprietorName}
                onChange={(e) => setFormData((prev) => ({ ...prev, proprietorName: e.target.value }))}
                placeholder="e.g. Ramesh Kumar"
                style={inputStyle(false)}
              />
            </Field>
            <Field id="firm-address" label="Address" error={formErrors.address}>
              <textarea
                id="firm-address"
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Registered office address…"
                style={{ ...inputStyle(false), resize: 'vertical' }}
              />
            </Field>
          </div>
          {formGeneralError && (
            <p className="text-sm rounded-lg p-3" style={{ background: 'rgba(239,83,80,0.1)', color: '#ef5350' }}>
              {formGeneralError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button id="btn-cancel-add-firm" type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button id="btn-submit-add-firm" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Firm'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Firm — ${selectedFirm?.name}`}
        description="Update the firm's registered details."
      >
        <form onSubmit={handleEditSubmit} className="space-y-5">
          <div className="space-y-4">
            <Field id="edit-firm-name" label="Firm Name" required error={formErrors.name}>
              <input
                id="edit-firm-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={`e.g. ${CLIENT.sampleFirmName}`}
                style={inputStyle(!!formErrors.name)}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="edit-firm-gst" label="GST Number" error={formErrors.gstNo}>
                <input
                  id="edit-firm-gst"
                  type="text"
                  value={formData.gstNo}
                  onChange={(e) => setFormData((prev) => ({ ...prev, gstNo: e.target.value.toUpperCase() }))}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  maxLength={15}
                  style={inputStyle(!!formErrors.gstNo)}
                />
              </Field>
              <Field id="edit-firm-phone" label="Phone Number" error={formErrors.phoneNo}>
                <input
                  id="edit-firm-phone"
                  type="tel"
                  value={formData.phoneNo}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phoneNo: e.target.value }))}
                  placeholder="e.g. +91 98765 43210"
                  style={inputStyle(!!formErrors.phoneNo)}
                />
              </Field>
            </div>
            <Field id="edit-firm-proprietor" label="Proprietor / Director Name" error={formErrors.proprietorName}>
              <input
                id="edit-firm-proprietor"
                type="text"
                value={formData.proprietorName}
                onChange={(e) => setFormData((prev) => ({ ...prev, proprietorName: e.target.value }))}
                placeholder="e.g. Ramesh Kumar"
                style={inputStyle(false)}
              />
            </Field>
            <Field id="edit-firm-address" label="Address" error={formErrors.address}>
              <textarea
                id="edit-firm-address"
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Registered office address…"
                style={{ ...inputStyle(false), resize: 'vertical' }}
              />
            </Field>
          </div>
          {formGeneralError && (
            <p className="text-sm rounded-lg p-3" style={{ background: 'rgba(239,83,80,0.1)', color: '#ef5350' }}>
              {formGeneralError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button id="btn-cancel-edit-firm" type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button id="btn-submit-edit-firm" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── View Modal ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Firm Details"
        size="lg"
      >
        {isLoadingViewDetails ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin" style={{ color: '#7986cb' }} />
          </div>
        ) : viewDetails ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold"
                style={{ background: 'rgba(92,107,192,0.2)', color: '#7986cb' }}
              >
                {viewDetails.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--md-on)' }}>{viewDetails.name}</h3>
                {viewDetails.gstNo && (
                  <p className="font-mono text-xs" style={{ color: 'var(--md-muted)' }}>GST: {viewDetails.gstNo}</p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatBadge icon={Users} label="Employees" count={viewDetails.employeeCount ?? 0} color="#7986cb" />
              <StatBadge icon={Briefcase} label="Projects" count={viewDetails.projectCount ?? 0} color="#ffb74d" />
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: User,     label: 'Proprietor',   value: viewDetails.proprietorName },
                { icon: Phone,    label: 'Phone',        value: viewDetails.phoneNo },
                { icon: MapPin,   label: 'Address',      value: viewDetails.address },
                { icon: Calendar, label: 'Created',      value: fmt(viewDetails.createdAt) },
                { icon: Hash,     label: 'GST No.',      value: viewDetails.gstNo },
                { icon: Calendar, label: 'Last Updated', value: fmt(viewDetails.updatedAt) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 rounded-lg p-3" style={{ background: 'var(--md-surface2)' }}>
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--md-dim)' }} />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--md-dim)' }}>{label}</p>
                    <p className="text-sm truncate" style={{ color: value ? 'var(--md-on)' : '#3e3e3e' }}>{value || '—'}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Employees list */}
            {viewDetails.employees?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--md-dim)' }}>
                  Employees ({viewDetails.employees.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {viewDetails.employees.map((emp) => (
                    <div key={emp.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--md-surface2)' }}>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: 'rgba(92,107,192,0.15)', color: '#7986cb' }}>
                        {emp.name.charAt(0)}
                      </div>
                      <span className="text-sm flex-1" style={{ color: 'var(--md-on)' }}>{emp.name}</span>
                      {emp.employeeCode && <span className="text-xs font-mono" style={{ color: 'var(--md-dim)' }}>{emp.employeeCode}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Projects list */}
            {viewDetails.projects?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--md-dim)' }}>
                  Projects ({viewDetails.projects.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {viewDetails.projects.map((proj) => (
                    <div key={proj.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--md-surface2)' }}>
                      <FileText className="h-4 w-4 shrink-0" style={{ color: '#ffb74d' }} />
                      <span className="text-sm flex-1" style={{ color: 'var(--md-on)' }}>{proj.name}</span>
                      {proj.status && (
                        <span className="text-xs rounded-full px-2 py-0.5" style={{ background: 'var(--md-surface3)', color: 'var(--md-muted)' }}>
                          {proj.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: 'var(--md-border)' }}>
                <Button
                  id="btn-view-edit-firm"
                  variant="ghost"
                  onClick={() => { setIsViewModalOpen(false); openEditModal(viewDetails); }}
                  className="flex items-center gap-2"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title={selectedFirm?.isActive === false ? 'Activate Firm' : 'Deactivate Firm'}
        description={selectedFirm?.isActive === false
          ? `Activate "${selectedFirm?.name}" so it appears in lists again?`
          : `Deactivate "${selectedFirm?.name}"? It stays in the database and is hidden from lists.`}
        confirmText={selectedFirm?.isActive === false ? 'Activate' : 'Deactivate'}
        isLoading={isSubmitting}
        error={formGeneralError}
      />
    </div>
  );
}
