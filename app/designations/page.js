'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Award,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  Shield,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
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

export default function DesignationsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'A';
  const canManage = user?.role === 'A' || user?.role === 'M';

  // State
  const [designations, setDesignations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Alerts
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Selected item
  const [selectedDesig, setSelectedDesig] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    title: '',
    description: '',
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Fetch designations from REST API
  const fetchDesignations = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const query = showInactive && isAdmin ? '?includeInactive=true' : '';
      const res = await fetch(`/api/designations${query}`);
      const json = await res.json();

      if (res.ok && json.success) {
        setDesignations(json.data || []);
      } else {
        setErrorMessage(json.message || 'Failed to retrieve designations.');
      }
    } catch (err) {
      console.error('Error fetching designations:', err);
      setErrorMessage('Network error fetching designations.');
    } finally {
      setIsLoading(false);
    }
  }, [showInactive, isAdmin]);

  useEffect(() => {
    fetchDesignations();
  }, [fetchDesignations]);

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Search filtering
  const filteredDesignations = useMemo(() => {
    if (!searchQuery.trim()) return designations;
    const q = searchQuery.toLowerCase().trim();
    return designations.filter((d) => {
      const matchTitle = d.title?.toLowerCase().includes(q);
      const matchDesc = d.description?.toLowerCase().includes(q);
      return matchTitle || matchDesc;
    });
  }, [designations, searchQuery]);

  // Modal open helpers
  const openAddModal = () => {
    setFormData({ title: '', description: '' });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (desig) => {
    setSelectedDesig(desig);
    setFormData({
      title: desig.title || '',
      description: desig.description || '',
    });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const openViewModal = (desig) => {
    setSelectedDesig(desig);
    setIsViewModalOpen(true);
  };

  const openDeleteModal = (desig) => {
    setSelectedDesig(desig);
    setFormError('');
    setIsDeleteModalOpen(true);
  };

  // Submit Add
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.title.trim()) {
      setFormError('Designation title is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/designations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsAddModalOpen(false);
        setSuccessMessage(`Designation "${formData.title.trim()}" created successfully.`);
        toast.success(`Designation "${formData.title.trim()}" created successfully.`);
        fetchDesignations();
      } else {
        const err = json.message || 'Failed to create designation.';
        setFormError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Create designation error:', err);
      setFormError('Network error while saving designation.');
      toast.error('Network error while saving designation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDesig) return;
    setFormError('');

    if (!formData.title.trim()) {
      setFormError('Designation title cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/designations/${selectedDesig.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsEditModalOpen(false);
        setSuccessMessage(`Designation "${formData.title.trim()}" updated successfully.`);
        toast.success(`Designation "${formData.title.trim()}" updated successfully.`);
        fetchDesignations();
      } else {
        const err = json.message || 'Failed to update designation.';
        setFormError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Update designation error:', err);
      setFormError('Network error while updating designation.');
      toast.error('Network error while updating designation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Delete
  const handleDeleteSubmit = async () => {
    if (!selectedDesig) return;
    setFormError('');
    setIsSubmitting(true);

    try {
      const turningOn = selectedDesig.isActive === false;
      const res = await fetch(`/api/designations/${selectedDesig.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: turningOn }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsDeleteModalOpen(false);
        const verb = selectedDesig.isActive === false ? 'activated' : 'deactivated';
        setSuccessMessage(`Designation "${selectedDesig.title}" ${verb}. The record was kept.`);
        toast.success(`Designation "${selectedDesig.title}" ${verb}.`);
        fetchDesignations();
      } else {
        const err = json.message || 'Failed to delete designation.';
        setFormError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Delete designation error:', err);
      setFormError('Network error while deleting designation.');
      toast.error('Network error while deleting designation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        icon={Award}
        title="Designations"
        description={`Configure job roles, employment ranks, and track personnel assignments across ${CLIENT.name}.`}
        help={<WorkflowGuide id="designations" />}
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
              onClick={fetchDesignations}
              isLoading={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              <span>Refresh</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canManage}
              title={canManage ? 'Add new designation' : 'Admin or Manager privileges required'}
              onClick={openAddModal}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              <span>Add Designation</span>
            </Button>
          </>
        }
      />

      {/* Success Notification */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-900 shadow-sm transition-all animate-in fade-in">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
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

      {/* Error Notification */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 shadow-sm transition-all animate-in fade-in">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <AlertCircle className="h-5 w-5 text-rose-600" />
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

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Search designations by title or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-semibold text-slate-900">{filteredDesignations.length}</span> of{' '}
              <span className="font-semibold text-slate-900">{designations.length}</span> designations
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Designations Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Designation Title</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-center">Assigned Employees</TableHead>
            <TableHead>Created Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        {isLoading ? (
          <TableLoadingState message="Loading designations…" rows={4} cols={5} />
        ) : filteredDesignations.length === 0 ? (
          <TableEmptyState
            title={searchQuery ? 'No matching designations' : 'No designations created yet'}
            description={
              searchQuery
                ? `No designations found matching "${searchQuery}".`
                : `Create job designations to categorize roles and ranks for ${CLIENT.name} personnel.`
            }
            icon={Award}
            colSpan={5}
            action={
              !searchQuery && canManage && (
                <Button size="sm" variant="primary" onClick={openAddModal}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  <span>Create Designation</span>
                </Button>
              )
            }
          />
        ) : (
          <TableBody>
            {filteredDesignations.map((desig) => (
              <TableRow key={desig.id}>
                {/* Title */}
                <TableCell className="font-semibold text-slate-900">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">
                      {desig.title.charAt(0).toUpperCase()}
                    </div>
                    <span>{desig.title}</span>
                  </div>
                </TableCell>

                {/* Description */}
                <TableCell className="max-w-xs truncate text-slate-600">
                  {desig.description || <span className="text-slate-400 italic">No description</span>}
                </TableCell>

                {/* Employee Count */}
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                    <Users className="h-3.5 w-3.5 text-slate-500" />
                    <span>{desig.employeeCount}</span>
                  </span>
                </TableCell>

                {/* Created Date */}
                <TableCell className="text-xs text-slate-500">
                  {new Date(desig.createdAt).toLocaleDateString()}
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="View Details"
                      onClick={() => openViewModal(desig)}
                    >
                      <Eye className="h-4 w-4 text-slate-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={canManage ? 'Edit Designation' : 'Admin/Manager privilege required'}
                      disabled={!canManage}
                      onClick={() => openEditModal(desig)}
                    >
                      <Pencil className="h-4 w-4 text-slate-500" />
                    </Button>
                    {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title={desig.isActive === false ? 'Activate Designation' : 'Deactivate Designation'}
                      onClick={() => openDeleteModal(desig)}
                      className="hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        )}
      </Table>

      {/* ================= ADD DESIGNATION MODAL ================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Designation"
        description="Register a new employee job title and role classification."
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
              Create Designation
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Designation Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Project Manager, Site Engineer, Surveyor"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Responsibilities, scope, and key deliverables..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>
        </form>
      </Modal>

      {/* ================= EDIT DESIGNATION MODAL ================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Designation"
        description={`Update role specifications for: ${selectedDesig?.title}`}
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
          {formError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Designation Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Description
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

      {/* ================= VIEW DESIGNATION MODAL ================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Designation Information"
        description="The designation and the people who hold it."
        footer={
          <Button variant="primary" size="sm" onClick={() => setIsViewModalOpen(false)}>
            Close
          </Button>
        }
      >
        {selectedDesig && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600 text-white font-bold text-lg">
                {selectedDesig.title.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedDesig.title}</h3>
                <p className="text-xs text-slate-500 font-mono">ID: {selectedDesig.id}</p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Description
              </h4>
              <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-xl p-3">
                {selectedDesig.description || 'No description provided.'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <Users className="h-4 w-4 text-sky-600" />
                  <span>Personnel Holding This Title</span>
                </div>
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700">
                  {selectedDesig.employeeCount} Active
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Number of staff members currently mapped to this designation in the employee directory.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-slate-100 pt-3">
              <Calendar className="h-3.5 w-3.5" />
              <span>Created on: {new Date(selectedDesig.createdAt).toLocaleDateString()}</span>
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
        title={selectedDesig?.isActive === false ? 'Activate Designation' : 'Deactivate Designation'}
        description={selectedDesig?.isActive === false
          ? `Activate "${selectedDesig?.title}" so it appears in lists again?`
          : `Deactivate "${selectedDesig?.title}"? It stays in the database and is hidden from lists.`}
        confirmText={selectedDesig?.isActive === false ? 'Activate' : 'Deactivate'}
        variant="danger"
      >
        {selectedDesig && (
          <div className="space-y-3">
            {formError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {selectedDesig.employeeCount > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 font-medium">
                <strong>{selectedDesig.employeeCount}</strong> employee(s) keep this designation. Deactivation only hides it from lists.
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
