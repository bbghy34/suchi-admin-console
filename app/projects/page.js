'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Images,
  Pencil,
  Trash2,
  Building2,
  HardHat,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  FileSpreadsheet,
  AlertTriangle,
  Layers,
  MapPin,
  Tag,
  ExternalLink,
  Landmark,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import TenderIdSuggest from '@/components/projects/TenderIdSuggest';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
import Modal from '@/components/ui/Modal';
import { ProgressGallery } from '@/components/progress/ProgressGallery';
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
import { projectTypeOptions } from '@/lib/project-types';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const PROJECT_STATUSES = [
  'PLANNING',
  'ACTIVE',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
];

export default function ProjectsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'A';
  const isManagerOrAdmin = user?.role === 'A' || user?.role === 'M';

  // Core Data States
  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [firms, setFirms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedContractor, setSelectedContractor] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // Alerts & Notifications
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modals state
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressRows, setProgressRows] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Selected project for View/Edit/Delete
  const [activeProject, setActiveProject] = useState(null);

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    type: '',
    status: 'ACTIVE',
    department: '',
    contractor: '',
    firmId: '',
    progress: 0,
    tenderId: '',
    startDate: '',
    endDate: '',
    budget: '',
  });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [editFormGeneralError, setEditFormGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Load auxiliary options (departments and contractors)
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [deptRes, contRes, firmRes] = await Promise.all([
        fetch('/api/departments', { headers }),
        fetch('/api/contractors?limit=100', { headers }),
        fetch('/api/firms?limit=100', { headers }),
      ]);

      const [deptJson, contJson, firmJson] = await Promise.all([
        deptRes.json(),
        contRes.json(),
        firmRes.json(),
      ]);

      if (deptJson.success) setDepartments(deptJson.data || []);
      if (contJson.success) setContractors(contJson.data || []);
      if (firmJson.success) setFirms(firmJson.data || []);
    } catch (err) {
      console.error('Failed to load auxiliary options for projects:', err);
    }
  }, []);

  // Fetch projects with server-side filters & pagination
  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));

      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedStatus) params.set('status', selectedStatus);
      if (selectedDept) params.set('department', selectedDept);
      if (selectedContractor) params.set('contractor', selectedContractor);
      if (selectedType) params.set('type', selectedType);
      if (showInactive && isAdmin) params.set('includeInactive', 'true');

      const res = await fetch(`/api/projects?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setProjects(json.data || []);
        if (json.pagination) {
          setTotalRecords(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        }
      } else {
        setErrorMessage(json.message || 'Failed to load projects.');
      }
    } catch (err) {
      console.error('Fetch projects error:', err);
      setErrorMessage('Network connection error while retrieving projects.');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchQuery, selectedStatus, selectedDept, selectedContractor, selectedType, showInactive, isAdmin]);

  useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleFilterChange = (setter, val) => {
    setter(val);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedStatus('');
    setSelectedDept('');
    setSelectedContractor('');
    setSelectedType('');
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(searchQuery) ||
    Boolean(selectedStatus) ||
    Boolean(selectedDept) ||
    Boolean(selectedContractor) ||
    Boolean(selectedType);

  // Helper date formatters
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

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined || val === '') return '—';
    const num = Number(val);
    if (!Number.isFinite(num)) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Helper for Status Badge
  const renderStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            In Progress
          </span>
        );
      case 'PLANNING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Planning
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Completed
          </span>
        );
      case 'ON_HOLD':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            On Hold
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  // Open Edit Modal with preloaded contractor
  const openEditModal = (project) => {
    setActiveProject(project);
    setEditFormData({
      name: project.name || '',
      description: project.description || '',
      type: project.type || '',
      status: project.status || 'ACTIVE',
      department: project.departmentId || project.department?.id || '',
      contractor: project.contractorId || project.contractor?.id || '',
      firmId: project.firmId || '',
      progress: project.progress !== null && project.progress !== undefined ? project.progress : 0,
      tenderId: project.tenderId || '',
      startDate: formatDateForInput(project.startDate),
      endDate: formatDateForInput(project.endDate),
      budget: project.budget !== null && project.budget !== undefined ? String(project.budget) : '',
    });
    setEditFormErrors({});
    setEditFormGeneralError('');
    setIsEditModalOpen(true);
  };

  const openViewModal = (project) => {
    setActiveProject(project);
    setIsViewModalOpen(true);
  };

  const openProgress = async (project) => {
    setActiveProject(project);
    setProgressRows([]);
    setProgressError('');
    setIsProgressOpen(true);
    setProgressLoading(true);
    try {
      const res = await fetch(`/api/progress?projectId=${encodeURIComponent(project.id)}`, { headers: getAuthHeaders(), credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setProgressError(json.message || 'Could not load progress photos.');
        return;
      }
      setProgressRows(json.data || []);
    } catch {
      setProgressError('Could not load progress photos.');
    } finally {
      setProgressLoading(false);
    }
  };

  const openDeleteModal = (project) => {
    setActiveProject(project);
    setEditFormGeneralError('');
    setIsDeleteModalOpen(true);
  };

  // Submit Edit Project
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!activeProject) return;
    setEditFormGeneralError('');

    const errors = {};
    if (!editFormData.name.trim()) errors.name = 'Project name is required.';
    if (!editFormData.department) errors.department = 'Department is required.';
    if (!editFormData.startDate) errors.startDate = 'Start date is required.';
    if (!editFormData.endDate) errors.endDate = 'End date is required.';

    if (
      editFormData.startDate &&
      editFormData.endDate &&
      new Date(editFormData.startDate) >= new Date(editFormData.endDate)
    ) {
      errors.endDate = 'End date must be after start date.';
    }

    const prog = Number(editFormData.progress);
    if (isNaN(prog) || prog < 0 || prog > 100) {
      errors.progress = 'Progress must be between 0 and 100.';
    }

    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      setEditFormGeneralError('Please correct the highlighted form errors.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: editFormData.name.trim(),
        description: editFormData.description.trim() || null,
        type: editFormData.type || null,
        status: editFormData.status || null,
        department: editFormData.department,
        contractor: editFormData.contractor || null,
        firmId: editFormData.firmId || null,
        progress: prog,
        tenderId: editFormData.tenderId.trim() || null,
        startDate: editFormData.startDate,
        endDate: editFormData.endDate,
        budget: editFormData.budget !== '' ? parseFloat(editFormData.budget) : null,
      };

      const res = await fetch(`/api/projects/${activeProject.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsEditModalOpen(false);
        setSuccessMessage(`Project "${editFormData.name.trim()}" updated successfully.`);
        toast.success(`Project "${editFormData.name.trim()}" updated successfully.`);
        fetchProjects();
      } else {
        const err = json.message || 'Failed to update project.';
        setEditFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Update project error:', err);
      setEditFormGeneralError('Network error while saving project changes.');
      toast.error('Network error while saving project changes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Delete Project
  const handleDeleteSubmit = async (confirmed = false) => {
    if (!activeProject) return;
    setEditFormGeneralError('');
    setIsSubmitting(true);

    try {
      const turningOn = activeProject.isActive === false;
      const res = await fetch(`/api/projects/${activeProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ isActive: turningOn }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsDeleteModalOpen(false);
        const verb = activeProject.isActive === false ? 'activated' : 'deactivated';
        setSuccessMessage(`Project "${activeProject.name}" ${verb}. The record was kept.`);
        toast.success(`Project "${activeProject.name}" ${verb}.`);
        fetchProjects();
      } else {
        const err = json.message || 'Failed to delete project.';
        setEditFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Delete project error:', err);
      setEditFormGeneralError('Network error while deleting project.');
      toast.error('Network error while deleting project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <ModuleHeader
        icon={Briefcase}
        title="Projects"
        description="Every project with its contractor, budget and progress."
        help={<WorkflowGuide id="projects" />}
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
              onClick={() => {
                fetchProjects();
                fetchAuxiliaryData();
              }}
              isLoading={isLoading}
              title="Reload projects"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              <span>Refresh</span>
            </Button>

            <Link href="/projects/new">
              <Button variant="primary" size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                <span>Create Project</span>
              </Button>
            </Link>
          </>
        }
      />

      {/* Success Banner */}
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

      {/* Error Banner */}
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

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 items-center">
            {/* Search Input */}
            <div className="relative lg:col-span-4">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Search by project name or tender ID..."
                value={searchQuery}
                onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            {/* Department Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedDept}
                onChange={(e) => handleFilterChange(setSelectedDept, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Contractor Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedContractor}
                onChange={(e) => handleFilterChange(setSelectedContractor, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All Contractors</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedStatus}
                onChange={(e) => handleFilterChange(setSelectedStatus, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All Statuses</option>
                {PROJECT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Type Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedType}
                onChange={(e) => handleFilterChange(setSelectedType, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All project types</option>
                {projectTypeOptions(projects.map((row) => row.type), selectedType).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Status / Reset row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>
                {isLoading && !projects.length ? 'Loading projects…' : <>
                Showing <strong className="text-slate-900">{projects.length}</strong> of{' '}
                <strong className="text-slate-900">{totalRecords}</strong> projects recorded
                </>}
              </span>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 font-semibold underline underline-offset-2 ml-2"
                >
                  <X className="h-3 w-3" />
                  Reset all filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Rows per page:</span>
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
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project Name</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Contractor</TableHead>
            <TableHead>Firm</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Budget</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        {isLoading ? (
          <TableLoadingState message="Loading projects…" rows={6} cols={11} />
        ) : projects.length === 0 ? (
          <TableEmptyState
            title={hasActiveFilters ? 'No matching projects' : 'No projects registered yet'}
            description={
              hasActiveFilters
                ? 'No projects match your active search and filter criteria.'
                : `Get started by creating the first project in ${CLIENT.name}.`
            }
            icon={Briefcase}
            colSpan={11}
            action={
              !hasActiveFilters && (
                <Link href="/projects/new">
                  <Button size="sm" variant="primary">
                    <Plus className="h-4 w-4 mr-1.5" />
                    <span>Create First Project</span>
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <TableBody>
            {projects.map((proj) => {
              const prog = proj.progress || 0;

              return (
                <TableRow key={proj.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Project Name */}
                  <TableCell className="font-semibold text-slate-900 max-w-[200px]">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 text-xs font-bold mt-0.5">
                        {proj.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/projects/${proj.id}`}
                          className="block leading-snug truncate hover:text-sky-600 hover:underline transition font-semibold text-slate-900"
                          title={`Open ${proj.name} details page`}
                        >
                          {proj.name}
                        </Link>
                        {proj.tenderId && (
                          <span className="inline-block text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5">
                            {proj.tenderId}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Department */}
                  <TableCell>
                    {proj.departmentRel ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-800 text-xs truncate max-w-[130px]">
                        <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">{proj.departmentRel.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Unassigned</span>
                    )}
                  </TableCell>

                  {/* Contractor (Displays Contractor.name, never employee) */}
                  <TableCell>
                    {proj.contractorRel ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-800 text-xs truncate max-w-[140px]">
                        <HardHat className="h-3 w-3 text-amber-500 shrink-0" />
                        <span className="truncate" title={proj.contractorRel.name}>
                          {proj.contractorRel.name}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Unassigned</span>
                    )}
                  </TableCell>

                  {/* Firm */}
                  <TableCell>
                    {proj.firm ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-800 text-xs truncate max-w-[130px]">
                        <Landmark className="h-3 w-3 text-indigo-500 shrink-0" />
                        <span className="truncate" title={proj.firm.name}>
                          {proj.firm.name}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">—</span>
                    )}
                  </TableCell>

                  {/* Type */}
                  <TableCell className="text-slate-600 text-xs">
                    {proj.type || <span className="text-slate-400 italic">—</span>}
                  </TableCell>

                  {/* Status */}
                  <TableCell className="text-center">{renderStatusBadge(proj.status)}</TableCell>

                  {/* Progress */}
                  <TableCell>
                    <div className="w-24">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-semibold text-slate-700">{prog}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            prog >= 100
                              ? 'bg-emerald-500'
                              : prog >= 50
                              ? 'bg-sky-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, prog))}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>

                  {/* Start Date */}
                  <TableCell className="text-slate-600 text-xs">
                    {formatDateDisplay(proj.startDate)}
                  </TableCell>

                  {/* End Date */}
                  <TableCell className="text-slate-600 text-xs">
                    {formatDateDisplay(proj.endDate)}
                  </TableCell>

                  {/* Budget */}
                  <TableCell className="font-mono text-xs font-semibold text-slate-800">
                    {formatCurrency(proj.budget)}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View progress images and dates"
                        onClick={() => openProgress(proj)}
                      >
                        <Images className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                      </Button>
                      {/* View Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View Full Details"
                        onClick={() => openViewModal(proj)}
                      >
                        <Eye className="h-4 w-4 text-slate-500 hover:text-sky-600" />
                      </Button>

                      {/* Edit Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit Project"
                        onClick={() => openEditModal(proj)}
                      >
                        <Pencil className="h-4 w-4 text-slate-500 hover:text-amber-600" />
                      </Button>

                      {/* Delete Button */}
                      {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={proj.isActive === false ? 'Activate Project' : 'Deactivate Project'}
                        onClick={() => openDeleteModal(proj)}
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

      {/* ================= VIEW PROJECT MODAL ================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Project Overview"
        description="Contractor, dates, sites and budget."
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            {activeProject && (
              <Link href={`/projects/${activeProject.id}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-1.5 text-sky-600" />
                  <span>Open Full Details Page</span>
                </Button>
              </Link>
            )}
            <Button variant="primary" size="sm" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        {activeProject && (
          <div className="space-y-4">
            {/* Header info card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-xs">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{activeProject.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {renderStatusBadge(activeProject.status)}
                  {activeProject.type && (
                    <span className="text-xs text-slate-500 font-medium">
                      • {activeProject.type}
                    </span>
                  )}
                  {activeProject.tenderId && (
                    <span className="text-xs font-mono text-slate-400">
                      ID: {activeProject.tenderId}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Budget Allocated
                </span>
                <span className="text-base font-bold font-mono text-slate-900">
                  {formatCurrency(activeProject.budget)}
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Scope of Work & Description
              </h4>
              <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-xl p-3">
                {activeProject.description || 'No detailed scope description provided for this project.'}
              </p>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Department */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-sky-600" />
                  Assigned Department
                </span>
                <p className="text-sm font-semibold text-slate-800">
                  {activeProject.departmentRel?.name || 'Unassigned'}
                </p>
              </div>

              {/* Contractor (Loads Contractor.name) */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <HardHat className="h-3 w-3 text-amber-500" />
                  Partner Contractor
                </span>
                <p className="text-sm font-semibold text-slate-800">
                  {activeProject.contractorRel?.name || 'No contractor assigned'}
                </p>
                {activeProject.contractorRel?.phoneNo && (
                  <p className="text-xs text-slate-500 font-mono">
                    Phone: {activeProject.contractorRel.phoneNo}
                  </p>
                )}
              </div>

              {/* Timeline */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-indigo-600" />
                  Execution Timeline
                </span>
                <p className="text-xs text-slate-700">
                  <strong>Start:</strong> {formatDateDisplay(activeProject.startDate)}
                </p>
                <p className="text-xs text-slate-700">
                  <strong>Target End:</strong> {formatDateDisplay(activeProject.endDate)}
                </p>
              </div>

              {/* Progress & BOQ count */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                  Milestone Progress
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {activeProject.progress || 0}% Completed
                </p>
                <p className="text-xs text-slate-500">
                  {activeProject.boqCount || activeProject.boqRecords?.length || 0} BOQ record(s) linked
                </p>
              </div>

              {/* Firm */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Landmark className="h-3 w-3 text-indigo-600" />
                  Assigned Firm
                </span>
                <p className="text-sm font-semibold text-slate-800">
                  {activeProject.firm?.name || '—'}
                </p>
                {activeProject.firm?.gstNo && (
                  <p className="text-xs text-slate-500 font-mono">GST: {activeProject.firm.gstNo}</p>
                )}
              </div>
            </div>

            {/* Sites Section */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-400" />
                Linked Operational Sites ({activeProject.sites?.length || 0})
              </h4>
              {activeProject.sites && activeProject.sites.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {activeProject.sites.map((site) => (
                    <div
                      key={site.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-slate-800">{site.name}</span>
                      <span className="text-slate-500">{site.address || site.status || 'Active'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  No field operational sites currently mapped to this project.
                </p>
              )}
            </div>

            {/* Footnote */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-3">
              <span>Project ID: {activeProject.id}</span>
              <span>Relationship: Project.contractor → Contractor.id</span>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= EDIT PROJECT MODAL ================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Project"
        description={`Modify parameters for ${activeProject?.name}`}
        maxWidth="max-w-3xl"
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
              Save Project Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editFormGeneralError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{editFormGeneralError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Project Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className={`block w-full rounded-xl border ${
                  editFormErrors.name ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
              />
              {editFormErrors.name && (
                <p className="mt-1 text-xs text-rose-600">{editFormErrors.name}</p>
              )}
            </div>

            {/* Tender ID */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Tender Reference ID
              </label>
              <TenderIdSuggest
                value={editFormData.tenderId}
                onChange={(tenderId) => setEditFormData((current) => ({ ...current, tenderId }))}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Department Dropdown */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Department <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={editFormData.department}
                onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                className={`block w-full rounded-xl border ${
                  editFormErrors.department ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
              >
                <option value="">-- Select Department --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {editFormErrors.department && (
                <p className="mt-1 text-xs text-rose-600">{editFormErrors.department}</p>
              )}
            </div>

            {/* Contractor Dropdown (Loads from /api/contractors, saves Contractor.id) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Partner Contractor (Optional)
              </label>
              <select
                value={editFormData.contractor}
                onChange={(e) => setEditFormData({ ...editFormData, contractor: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">-- No Contractor Assigned --</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phoneNo ? `(${c.phoneNo})` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Saves Contractor.id. Employees cannot be selected as contractors.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Type */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Project Type
              </label>
              <select
                value={editFormData.type}
                onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">Select a type</option>
                {projectTypeOptions(editFormData.type).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Status
              </label>
              <select
                value={editFormData.status}
                onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                {PROJECT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Budget */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Budget (INR)
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 15000000"
                value={editFormData.budget}
                onChange={(e) => setEditFormData({ ...editFormData, budget: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Start Date */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={editFormData.startDate}
                onChange={(e) => setEditFormData({ ...editFormData, startDate: e.target.value })}
                className={`block w-full rounded-xl border ${
                  editFormErrors.startDate ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
              />
              {editFormErrors.startDate && (
                <p className="mt-1 text-xs text-rose-600">{editFormErrors.startDate}</p>
              )}
            </div>

            {/* End Date */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                End Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={editFormData.endDate}
                onChange={(e) => setEditFormData({ ...editFormData, endDate: e.target.value })}
                className={`block w-full rounded-xl border ${
                  editFormErrors.endDate ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
              />
              {editFormErrors.endDate && (
                <p className="mt-1 text-xs text-rose-600">{editFormErrors.endDate}</p>
              )}
            </div>

            {/* Progress */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Progress ({editFormData.progress}%)
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={editFormData.progress}
                onChange={(e) => setEditFormData({ ...editFormData, progress: Number(e.target.value) })}
                className="block w-full accent-sky-600 mt-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Description */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Project Scope & Description
              </label>
              <textarea
                rows={2}
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            {/* Firm Dropdown */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Firm (Optional)
              </label>
              <select
                value={editFormData.firmId}
                onChange={(e) => setEditFormData({ ...editFormData, firmId: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">-- No Firm Assigned --</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}{f.gstNo ? ` (${f.gstNo})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isProgressOpen}
        onClose={() => setIsProgressOpen(false)}
        title={`Progress — ${activeProject?.name || ''}`}
        description="Site photos for this project, with the progress date from each progress record."
        maxWidth="max-w-3xl"
      >
        {progressError && (
          <p className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(244,67,54,0.12)', color: '#ef9a9a' }}>{progressError}</p>
        )}
        <ProgressGallery rows={progressRows} loading={progressLoading} />
      </Modal>

      {/* ================= DELETE CONFIRMATION DIALOG ================= */}
      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => handleDeleteSubmit(false)}
        isLoading={isSubmitting}
        title={activeProject?.isActive === false ? 'Activate Project' : 'Deactivate Project'}
        description={activeProject?.isActive === false
          ? `Activate "${activeProject?.name}" so it appears in lists again?`
          : `Deactivate "${activeProject?.name}"? It stays in the database and is hidden from lists.`}
        confirmText={activeProject?.isActive === false ? 'Activate' : 'Deactivate'}
        variant="danger"
      >
        {activeProject && (
          <div className="space-y-3">
            {editFormGeneralError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{editFormGeneralError}</span>
              </div>
            )}

            {(activeProject.siteCount > 0 || activeProject.boqCount > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Active Dependencies Detected</span>
                </div>
                <p>
                  This project currently has{' '}
                  <strong>{activeProject.siteCount} associated operational site(s)</strong> and{' '}
                  <strong>{activeProject.boqCount} BOQ records</strong>. Confirming deletion will safely
                  dissociate sites from this project and clean linked BOQ references.
                </p>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
