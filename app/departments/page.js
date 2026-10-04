'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Power,
  PowerOff,
  Users,
  Briefcase,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  Shield,
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

export default function DepartmentsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'A';

  // State
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
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

  // Selected department for View/Edit/Delete
  const [selectedDept, setSelectedDept] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    HOD: '',
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Load departments from real REST API
  const fetchDepartments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const query = showInactive && isAdmin ? '?includeInactive=true' : '';
      const res = await fetch(`/api/departments${query}`);
      const json = await res.json();

      if (res.ok && json.success) {
        setDepartments(json.data || []);
      } else {
        setErrorMessage(json.message || 'Failed to load departments.');
      }
    } catch (err) {
      console.error('Failed to fetch departments:', err);
      setErrorMessage('Network error loading departments. Please check connectivity.');
    } finally {
      setIsLoading(false);
    }
  }, [showInactive, isAdmin]);

  // 2. Load employees for HOD dropdown
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      const json = await res.json();
      if (res.ok && json.success) {
        setEmployees(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load employees for HOD list:', err);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
    fetchEmployees();
  }, [fetchDepartments, fetchEmployees]);

  // Auto-dismiss success messages after 4 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Filter departments based on search query
  const filteredDepartments = useMemo(() => {
    if (!searchQuery.trim()) return departments;
    const q = searchQuery.toLowerCase().trim();
    return departments.filter((d) => {
      const matchName = d.name?.toLowerCase().includes(q);
      const matchDesc = d.description?.toLowerCase().includes(q);
      const matchHod = d.hod?.name?.toLowerCase().includes(q) || d.hod?.email?.toLowerCase().includes(q);
      return matchName || matchDesc || matchHod;
    });
  }, [departments, searchQuery]);

  // Handlers for Modals
  const openAddModal = () => {
    setFormData({ name: '', description: '', HOD: '' });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (dept) => {
    setSelectedDept(dept);
    setFormData({
      name: dept.name || '',
      description: dept.description || '',
      HOD: dept.HOD || '',
    });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const openViewModal = (dept) => {
    setSelectedDept(dept);
    setIsViewModalOpen(true);
  };

  const openDeleteModal = (dept) => {
    setSelectedDept(dept);
    setFormError('');
    setIsDeleteModalOpen(true);
  };

  // Submit Add Department
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Department name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          HOD: formData.HOD.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsAddModalOpen(false);
        setSuccessMessage(`Department "${formData.name.trim()}" created successfully.`);
        toast.success(`Department "${formData.name.trim()}" created successfully.`);
        fetchDepartments();
      } else {
        const err = json.message || 'Failed to create department.';
        setFormError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Create department error:', err);
      setFormError('Network error while saving department.');
      toast.error('Network error while saving department.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit Department
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDept) return;
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Department name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/departments/${selectedDept.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          HOD: formData.HOD.trim() || null,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsEditModalOpen(false);
        setSuccessMessage(`Department "${formData.name.trim()}" updated successfully.`);
        toast.success(`Department "${formData.name.trim()}" updated successfully.`);
        fetchDepartments();
      } else {
        const err = json.message || 'Failed to update department.';
        setFormError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Update department error:', err);
      setFormError('Network error while updating department.');
      toast.error('Network error while updating department.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Delete Department
  const handleDeleteSubmit = async () => {
    if (!selectedDept) return;
    setFormError('');
    setIsSubmitting(true);

    try {
      const turningOn = selectedDept.isActive === false;
      const res = await fetch(`/api/departments/${selectedDept.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: turningOn }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsDeleteModalOpen(false);
        const verb = turningOn ? 'activated' : 'deactivated';
        setSuccessMessage(`Department "${selectedDept.name}" ${verb}. The record was kept.`);
        toast.success(`Department "${selectedDept.name}" ${verb}.`);
        fetchDepartments();
      } else {
        const err = json.message || 'Failed to delete department.';
        setFormError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Delete department error:', err);
      setFormError('Network error while deleting department.');
      toast.error('Network error while deleting department.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        icon={Building2}
        title="Departments"
        description="Departments, their heads, and who works in each."
        help={<WorkflowGuide id="departments" />}
        actions={
          <>
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show deactivated
              </label>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDepartments}
              isLoading={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              <span>Refresh</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={openAddModal}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              <span>Add Department</span>
            </Button>
          </>
        }
      />

      {/* Success Banner */}
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

      {/* Global Error Banner */}
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

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Search departments by name, description, or HOD..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-semibold text-slate-900">{filteredDepartments.length}</span> of{' '}
              <span className="font-semibold text-slate-900">{departments.length}</span> departments
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Department Table Component */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Department Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Head of Department (HOD)</TableHead>
            <TableHead className="text-center">Employees</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        {isLoading ? (
          <TableLoadingState message="Loading departments…" rows={4} cols={5} />
        ) : filteredDepartments.length === 0 ? (
          <TableEmptyState
            title={searchQuery ? 'No matching departments' : 'No departments registered yet'}
            description={
              searchQuery
                ? `No departments matched your search for "${searchQuery}".`
                : `Get started by creating your first organizational department in ${CLIENT.name}.`
            }
            icon={Building2}
            colSpan={5}
            action={
              !searchQuery && (
                <Button size="sm" variant="primary" onClick={openAddModal}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  <span>Create Department</span>
                </Button>
              )
            }
          />
        ) : (
          <TableBody>
            {filteredDepartments.map((dept) => (
              <TableRow key={dept.id}>
                {/* Name */}
                <TableCell className="font-semibold text-slate-900">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 text-xs font-bold">
                      {dept.name.charAt(0).toUpperCase()}
                    </div>
                    <span>{dept.name}</span>
                  </div>
                </TableCell>

                {/* Description */}
                <TableCell className="max-w-xs truncate text-slate-600">
                  {dept.description || <span className="text-slate-400 italic">No description</span>}
                </TableCell>

                {/* HOD Information */}
                <TableCell>
                  {dept.hod ? (
                    <div>
                      <span className="font-medium text-slate-900 block">{dept.hod.name}</span>
                      <span className="text-xs text-slate-400 block">{dept.hod.email}</span>
                    </div>
                  ) : dept.HOD ? (
                    <span className="text-xs font-mono text-slate-500">ID: {dept.HOD.substring(0, 8)}...</span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500 font-medium">
                      Unassigned
                    </span>
                  )}
                </TableCell>

                {/* Employee Count */}
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                    <Users className="h-3 w-3" />
                    <span>{dept.employeeCount}</span>
                  </span>
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="View Details"
                      onClick={() => openViewModal(dept)}
                    >
                      <Eye className="h-4 w-4 text-slate-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit Department"
                      onClick={() => openEditModal(dept)}
                    >
                      <Pencil className="h-4 w-4 text-slate-500" />
                    </Button>
                    {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title={dept.isActive === false ? 'Activate Department' : 'Deactivate Department'}
                      onClick={() => openDeleteModal(dept)}
                      className="hover:text-rose-600"
                    >
                      {dept.isActive === false ? (
                        <Power className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <PowerOff className="h-4 w-4 text-rose-500" />
                      )}
                    </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        )}
      </Table>

      {/* ================= ADD DEPARTMENT MODAL ================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Department"
        description="Add a department and, if you like, its head."
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
              Create Department
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
              Department Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Civil Engineering, Accounts"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Brief description of department responsibilities..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Head of Department (HOD)
            </label>
            {employees.length > 0 ? (
              <select
                value={formData.HOD}
                onChange={(e) => setFormData({ ...formData, HOD: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">-- No HOD Assigned --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.email}) - {emp.role === 'A' ? 'Admin' : emp.role === 'M' ? 'Manager' : 'Staff'}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Optional Employee ID for HOD"
                value={formData.HOD}
                onChange={(e) => setFormData({ ...formData, HOD: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            )}
            <p className="mt-1 text-xs text-slate-400">
              Select an active employee to lead this department.
            </p>
          </div>
        </form>
      </Modal>

      {/* ================= EDIT DEPARTMENT MODAL ================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Department"
        description={`Modify information for department: ${selectedDept?.name}`}
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
              Department Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Head of Department (HOD)
            </label>
            {employees.length > 0 ? (
              <select
                value={formData.HOD}
                onChange={(e) => setFormData({ ...formData, HOD: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">-- No HOD Assigned --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.email})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.HOD}
                onChange={(e) => setFormData({ ...formData, HOD: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            )}
          </div>
        </form>
      </Modal>

      {/* ================= VIEW DEPARTMENT MODAL ================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Department Information"
        description="The department, its head and its people."
        footer={
          <Button variant="primary" size="sm" onClick={() => setIsViewModalOpen(false)}>
            Done
          </Button>
        }
      >
        {selectedDept && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white font-bold text-lg">
                {selectedDept.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedDept.name}</h3>
                <p className="text-xs text-slate-500 font-mono">ID: {selectedDept.id}</p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Description
              </h4>
              <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-xl p-3">
                {selectedDept.description || 'No description provided.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <Users className="h-4 w-4 text-sky-600" />
                  <span>Assigned Personnel</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {selectedDept.employeeCount}
                </div>
                <p className="text-[11px] text-slate-400">Total staff members</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <Briefcase className="h-4 w-4 text-indigo-600" />
                  <span>Linked Projects</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {selectedDept.projectCount ?? 0}
                </div>
                <p className="text-[11px] text-slate-400">Active tender projects</p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Head of Department (HOD)
              </h4>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                {selectedDept.hod ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{selectedDept.hod.name}</p>
                    <p className="text-xs text-slate-500">Email: {selectedDept.hod.email}</p>
                    {selectedDept.hod.phone && (
                      <p className="text-xs text-slate-500">Phone: {selectedDept.hod.phone}</p>
                    )}
                    {selectedDept.hod.employeeCode && (
                      <p className="text-xs text-slate-400 font-mono">Code: {selectedDept.hod.employeeCode}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No HOD assigned to this department.</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-slate-100 pt-3">
              <Calendar className="h-3.5 w-3.5" />
              <span>Created on: {new Date(selectedDept.createdAt).toLocaleDateString()}</span>
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
        title={selectedDept?.isActive === false ? 'Activate Department' : 'Deactivate Department'}
        description={selectedDept?.isActive === false
          ? `Activate "${selectedDept?.name}" so it appears in lists again?`
          : `Deactivate "${selectedDept?.name}"? It will be hidden from lists. The record is kept.`}
        confirmText={selectedDept?.isActive === false ? 'Activate' : 'Deactivate'}
        variant="danger"
      >
        {selectedDept && (
          <div className="space-y-3">
            {formError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {selectedDept.employeeCount > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 font-medium">
                This department has <strong>{selectedDept.employeeCount}</strong> assigned employee(s). They stay linked. Deactivation only hides the department.
              </div>
            )}

            {selectedDept.projectCount > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 font-medium">
                Warning: This department currently has <strong>{selectedDept.projectCount}</strong> associated project(s).
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
