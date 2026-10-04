'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  HardHat,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  Phone,
  Briefcase,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Building,
  FileText,
  Clock,
  DollarSign,
  AlertTriangle,
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

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function ContractorsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'A';

  // Core Data States
  const [contractors, setContractors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Alerts & Notifications
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Selected contractor for View/Edit/Delete
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [viewDetails, setViewDetails] = useState(null);
  const [isLoadingViewDetails, setIsLoadingViewDetails] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    phoneNo: '',
    description: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [formGeneralError, setFormGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Fetch contractors from API
  const fetchContractors = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      if (showInactive && isAdmin) params.set('includeInactive', 'true');

      const res = await fetch(`/api/contractors?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setContractors(json.data || []);
        if (json.pagination) {
          setTotalRecords(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        }
      } else {
        setErrorMessage(json.message || 'Failed to load contractors.');
      }
    } catch (err) {
      console.error('Fetch contractors error:', err);
      setErrorMessage('Network connection error while retrieving contractors.');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchQuery, showInactive, isAdmin]);

  useEffect(() => {
    fetchContractors();
  }, [fetchContractors]);

  // Reset page to 1 when search changes
  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setPage(1);
  };

  // Helper date formatter
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  // Form Validation
  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) {
      errors.name = 'Contractor name is required.';
    }
    if (formData.phoneNo && formData.phoneNo.trim()) {
      const phoneErr = validatePhone(formData.phoneNo.trim());
      if (phoneErr) {
        errors.phoneNo = phoneErr;
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Modal Openers
  const openAddModal = () => {
    setFormData({ name: '', phoneNo: '', description: '' });
    setFormErrors({});
    setFormGeneralError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (contractor) => {
    setSelectedContractor(contractor);
    setFormData({
      name: contractor.name || '',
      phoneNo: contractor.phoneNo || '',
      description: contractor.description || '',
    });
    setFormErrors({});
    setFormGeneralError('');
    setIsEditModalOpen(true);
  };

  const openViewModal = async (contractor) => {
    setSelectedContractor(contractor);
    setViewDetails(null);
    setIsViewModalOpen(true);
    setIsLoadingViewDetails(true);

    try {
      const res = await fetch(`/api/contractors/${contractor.id}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setViewDetails(json.data);
      } else {
        setViewDetails(contractor);
      }
    } catch (err) {
      console.error('Failed to fetch detailed contractor data:', err);
      setViewDetails(contractor);
    } finally {
      setIsLoadingViewDetails(false);
    }
  };

  const openDeleteModal = (contractor) => {
    setSelectedContractor(contractor);
    setFormGeneralError('');
    setIsDeleteModalOpen(true);
  };

  // Create Contractor Handler
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormGeneralError('');

    if (!validateForm()) {
      setFormGeneralError('Please enter a valid contractor name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/contractors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          phoneNo: formData.phoneNo.trim() || undefined,
          description: formData.description.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsAddModalOpen(false);
        setSuccessMessage(`Contractor "${formData.name.trim()}" created successfully.`);
        toast.success(`Contractor "${formData.name.trim()}" created successfully.`);
        fetchContractors();
      } else {
        const err = json.message || 'Failed to create contractor.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Create contractor error:', err);
      setFormGeneralError('Network error while saving contractor.');
      toast.error('Network error while saving contractor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Contractor Handler
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedContractor) return;
    setFormGeneralError('');

    if (!validateForm()) {
      setFormGeneralError('Contractor name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/contractors/${selectedContractor.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          phoneNo: formData.phoneNo.trim() || null,
          description: formData.description.trim() || null,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsEditModalOpen(false);
        setSuccessMessage(`Contractor "${formData.name.trim()}" updated successfully.`);
        toast.success(`Contractor "${formData.name.trim()}" updated successfully.`);
        fetchContractors();
      } else {
        const err = json.message || 'Failed to update contractor.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Update contractor error:', err);
      setFormGeneralError('Network error while updating contractor.');
      toast.error('Network error while updating contractor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Contractor Handler
  const handleDeleteSubmit = async () => {
    if (!selectedContractor) return;
    setFormGeneralError('');

    setIsSubmitting(true);
    try {
      const turningOn = selectedContractor.isActive === false;
      const res = await fetch(`/api/contractors/${selectedContractor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ isActive: turningOn }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsDeleteModalOpen(false);
        const verb = selectedContractor.isActive === false ? 'activated' : 'deactivated';
        setSuccessMessage(`Contractor "${selectedContractor.name}" ${verb}. The record was kept.`);
        toast.success(`Contractor "${selectedContractor.name}" ${verb}.`);
        fetchContractors();
      } else {
        const err = json.message || 'Failed to delete contractor.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Delete contractor error:', err);
      setFormGeneralError('Network error while deleting contractor.');
      toast.error('Network error while deleting contractor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        icon={HardHat}
        title="Contractors"
        description="The firms you work with, and the projects they are assigned to."
        help={<WorkflowGuide id="contractors" />}
        actions={
          <>
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show deactivated
              </label>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchContractors}
              isLoading={isLoading}
              title="Reload contractors"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              <span>Refresh</span>
            </Button>

            <Button variant="primary" size="sm" onClick={openAddModal}>
              <Plus className="h-4 w-4 mr-1.5" />
              <span>Add Contractor</span>
            </Button>
          </>
        }
      />

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-900 shadow-sm transition-all animate-in fade-in">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 shadow-sm transition-all animate-in fade-in">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="rounded-lg p-1 text-rose-700 hover:bg-rose-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Search by contractor name, phone, or description..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500 font-medium">
                {isLoading && !contractors.length ? 'Loading contractors…' : <>
                Showing <strong className="text-slate-900">{contractors.length}</strong> of{' '}
                <strong className="text-slate-900">{totalRecords}</strong> contractors
                </>}
              </div>

              {searchQuery && (
                <button
                  onClick={() => handleSearchChange('')}
                  className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-semibold underline underline-offset-2"
                >
                  <X className="h-3 w-3" />
                  Clear search
                </button>
              )}

              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                <span className="text-xs text-slate-400">Rows:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contractor Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contractor Name</TableHead>
            <TableHead>Phone Number</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-center">Projects</TableHead>
            <TableHead>Created Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        {isLoading ? (
          <TableLoadingState message="Loading contractors…" rows={5} cols={6} />
        ) : contractors.length === 0 ? (
          <TableEmptyState
            title={searchQuery ? 'No matching contractors' : 'No contractors registered yet'}
            description={
              searchQuery
                ? `No contractors matched your search for "${searchQuery}".`
                : 'Add the firms you work with so you can assign them to projects.'
            }
            icon={HardHat}
            colSpan={6}
            action={
              !searchQuery && (
                <Button size="sm" variant="primary" onClick={openAddModal}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  <span>Add First Contractor</span>
                </Button>
              )
            }
          />
        ) : (
          <TableBody>
            {contractors.map((contractor) => {
              const hasProjects = contractor.projectCount > 0;

              return (
                <TableRow key={contractor.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Contractor Name */}
                  <TableCell className="font-semibold text-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 border border-amber-100 text-amber-700 font-bold text-xs">
                        {contractor.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="block leading-snug">{contractor.name}</span>
                        <span className="block text-[11px] font-mono text-slate-400">
                          ID: {contractor.id.substring(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  {/* Phone Number */}
                  <TableCell className="text-slate-600">
                    {contractor.phoneNo ? (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-mono text-xs text-slate-700">
                          {contractor.phoneNo}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Not provided</span>
                    )}
                  </TableCell>

                  {/* Description */}
                  <TableCell className="max-w-xs truncate text-slate-600 text-xs">
                    {contractor.description ? (
                      <span title={contractor.description}>{contractor.description}</span>
                    ) : (
                      <span className="text-slate-400 italic">No description</span>
                    )}
                  </TableCell>

                  {/* Projects Count */}
                  <TableCell className="text-center">
                    {hasProjects ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200/60">
                        <Briefcase className="h-3 w-3 text-indigo-600" />
                        <span>{contractor.projectCount} Project{contractor.projectCount > 1 ? 's' : ''}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        0 Projects
                      </span>
                    )}
                  </TableCell>

                  {/* Created Date */}
                  <TableCell className="text-slate-600 text-xs">
                    {formatDateDisplay(contractor.createdAt)}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* View Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View Details & Assigned Projects"
                        onClick={() => openViewModal(contractor)}
                      >
                        <Eye className="h-4 w-4 text-slate-500 hover:text-sky-600" />
                      </Button>

                      {/* Edit Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit Contractor"
                        onClick={() => openEditModal(contractor)}
                      >
                        <Pencil className="h-4 w-4 text-slate-500 hover:text-amber-600" />
                      </Button>

                      {/* Delete Button */}
                      {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={contractor.isActive === false ? 'Activate Contractor' : 'Deactivate Contractor'}
                        onClick={() => openDeleteModal(contractor)}
                        className="hover:text-rose-600 text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        )}
      </Table>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalPages}</span> (Total{' '}
            <span className="font-semibold text-slate-900">{totalRecords}</span> items)
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            {/* Page number pills */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && p - prevPage > 1;

                  return (
                    <div key={p} className="flex items-center">
                      {showEllipsis && <span className="px-1 text-slate-400 text-xs">...</span>}
                      <button
                        onClick={() => setPage(p)}
                        className={`h-8 w-8 rounded-lg text-xs font-semibold transition ${
                          page === p
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    </div>
                  );
                })}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ================= ADD CONTRACTOR MODAL ================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Contractor"
        description="Register an external contracting firm or partner for tender projects."
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddSubmit}
              isLoading={isSubmitting}
            >
              Create Contractor
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formGeneralError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formGeneralError}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Contractor Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Northeast Builders Pvt Ltd"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`block w-full rounded-xl border ${
                formErrors.name ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
              } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
            />
            {formErrors.name && (
              <p className="mt-1 text-xs text-rose-600">{formErrors.name}</p>
            )}
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Contact Phone Number
            </label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={formData.phoneNo}
              onChange={(e) => setFormData({ ...formData, phoneNo: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Description & Specialization
            </label>
            <textarea
              rows={3}
              placeholder="Equipment, specialities, past work or scope…"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>
        </form>
      </Modal>

      {/* ================= EDIT CONTRACTOR MODAL ================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Contractor"
        description={`Update records for ${selectedContractor?.name}`}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSubmit}
              isLoading={isSubmitting}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formGeneralError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formGeneralError}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Contractor Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`block w-full rounded-xl border ${
                formErrors.name ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
              } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
            />
            {formErrors.name && (
              <p className="mt-1 text-xs text-rose-600">{formErrors.name}</p>
            )}
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Contact Phone Number
            </label>
            <input
              type="tel"
              value={formData.phoneNo}
              onChange={(e) => setFormData({ ...formData, phoneNo: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Description & Specialization
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>
        </form>
      </Modal>

      {/* ================= VIEW CONTRACTOR MODAL (DETAILS & ASSIGNED PROJECTS) ================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Contractor Overview"
        description="Contractor details and list of assigned tender projects."
        maxWidth="max-w-2xl"
        footer={
          <Button variant="primary" size="sm" onClick={() => setIsViewModalOpen(false)}>
            Close
          </Button>
        }
      >
        {selectedContractor && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-white font-bold text-lg shadow-sm shadow-amber-500/20">
                {selectedContractor.name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900 truncate">
                  {selectedContractor.name}
                </h3>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" />
                    {selectedContractor.phoneNo || 'No phone'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    Enrolled {formatDateDisplay(selectedContractor.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Company Profile & Description
              </h4>
              <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-xl p-3">
                {selectedContractor.description || 'No description provided for this contractor.'}
              </p>
            </div>

            {/* Assigned Projects Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Assigned Tender Projects ({viewDetails?.projects?.length ?? selectedContractor.projectCount ?? 0})
                </h4>
                {isLoadingViewDetails && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Loading projects...
                  </span>
                )}
              </div>

              {viewDetails?.projects && viewDetails.projects.length > 0 ? (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {viewDetails.projects.map((proj) => (
                    <div
                      key={proj.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {proj.name}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-100">
                          {proj.status || 'Active'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                        {proj.departmentRel && (
                          <span className="flex items-center gap-1">
                            <Building className="h-3 w-3 text-slate-400" />
                            {proj.departmentRel.name}
                          </span>
                        )}
                        {proj.budget !== null && proj.budget !== undefined && (
                          <span className="flex items-center gap-1 font-mono text-emerald-700 font-medium">
                            ${Number(proj.budget).toLocaleString()}
                          </span>
                        )}
                        {proj.progress !== null && proj.progress !== undefined && (
                          <span className="flex items-center gap-1 text-indigo-600 font-medium">
                            {proj.progress}% complete
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                  <Briefcase className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-600">No Projects Currently Assigned</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    This contractor has not been assigned to any tender project in the database.
                  </p>
                </div>
              )}
            </div>

            {/* Footnote */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-3">
              <span>Contractor ID: {selectedContractor.id}</span>
              <span>Relationship: Project.contractor → Contractor.id</span>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= DELETE CONFIRMATION DIALOG ================= */}
      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSubmit}
        isLoading={isSubmitting}
        title={selectedContractor?.isActive === false ? 'Activate Contractor' : 'Deactivate Contractor'}
        description={
          selectedContractor?.isActive === false
            ? `Activate "${selectedContractor?.name}" so it appears in lists again?`
            : `Deactivate "${selectedContractor?.name}"? It stays in the database and is hidden from lists.`
        }
        confirmText={selectedContractor?.isActive === false ? 'Activate' : 'Deactivate'}
        variant="danger"
      >
        {selectedContractor && (
          <div className="space-y-3">
            {formGeneralError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formGeneralError}</span>
              </div>
            )}

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Assigned projects stay linked. This only hides the contractor from lists.
              {selectedContractor.projectCount > 0 ? ` Currently assigned to ${selectedContractor.projectCount} project(s).` : ''}
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
