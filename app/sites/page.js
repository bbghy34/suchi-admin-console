'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Images,
  MapPin,
  Plus,
  Search,
  RefreshCw,
  Eye,
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
  ExternalLink,
  ShieldCheck,
  Compass,
  Phone,
  Mail,
  User,
  AlertTriangle,
  Briefcase,
  Copy,
  Check,
  CircleDot,
  PowerOff,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
import Modal from '@/components/ui/Modal';
import LocationPickerModal from '@/components/ui/LocationPickerModal';
import { ProgressGallery } from '@/components/progress/ProgressGallery';
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

const SITE_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'PLANNED',
  'UNDER_MAINTENANCE',
  'COMPLETED',
];

export default function SitesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'A';
  const isManagerOrAdmin = user?.role === 'A' || user?.role === 'M';

  // Core Data States
  const [sites, setSites] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  // Alerts & Notifications
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressRows, setProgressRows] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [progressForm, setProgressForm] = useState({ latitude: '', longitude: '', file: null });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

  // Active / Selected Site
  const [selectedSite, setSelectedSite] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formGeneralError, setFormGeneralError] = useState('');

  // Form Data State for Add & Edit
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    coordinates: '',
    attendanceRadius: '',
    status: 'ACTIVE',
    sitManager: '',
    projectId: '',
  });

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Fetch Projects and Employees for dropdowns
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [projRes, empRes] = await Promise.all([
        fetch('/api/projects?limit=100', { headers }),
        fetch('/api/employees?limit=100', { headers }),
      ]);
      const [projJson, empJson] = await Promise.all([
        projRes.json(),
        empRes.json(),
      ]);

      if (projJson.success) setProjects(projJson.data || []);
      if (empJson.success) setEmployees(empJson.data || []);
    } catch (err) {
      console.error('Failed to load auxiliary dropdown data:', err);
    }
  }, []);

  // Fetch Sites with Filters & Pagination
  const fetchSites = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedStatus.trim()) params.append('status', selectedStatus.trim());
      if (selectedProject.trim()) params.append('projectId', selectedProject.trim());
      if (showInactive && isAdmin) params.append('includeInactive', 'true');

      const res = await fetch(`/api/sites?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setSites(json.data || []);
        if (json.pagination) {
          setTotalRecords(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        }
      } else {
        setErrorMessage(json.message || 'Failed to load operational sites.');
      }
    } catch (err) {
      console.error('Fetch sites error:', err);
      setErrorMessage('Network error while retrieving operational sites.');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchQuery, selectedStatus, selectedProject, showInactive, isAdmin]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  // KPI Calculations
  const stats = useMemo(() => {
    const total = totalRecords;
    const active = sites.filter((s) => s.status?.toUpperCase() === 'ACTIVE').length;
    const withProject = sites.filter((s) => s.projectId).length;
    const withManager = sites.filter((s) => s.sitManager).length;
    return { total, active, withProject, withManager };
  }, [sites, totalRecords]);

  // Copy helper
  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Status Badge Formatter
  const renderStatusBadge = (status) => {
    const s = status?.toUpperCase();
    switch (s) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case 'PLANNED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Planned
          </span>
        );
      case 'UNDER_MAINTENANCE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 border border-purple-200 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            Maintenance
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 border border-sky-200 shadow-2xs">
            <CheckCircle2 className="h-3 w-3 text-sky-600" />
            Completed
          </span>
        );
      case 'INACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 border border-slate-300 shadow-2xs">
            <CircleDot className="h-1.5 w-1.5 text-slate-400" />
            Inactive
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  // Open Add Modal
  const openAddModal = () => {
    setFormData({
      name: '',
      address: '',
      coordinates: '',
      attendanceRadius: '',
      status: 'ACTIVE',
      sitManager: '',
      projectId: '',
    });
    setFormErrors({});
    setFormGeneralError('');
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (site) => {
    setSelectedSite(site);
    setFormData({
      name: site.name || '',
      address: site.address || '',
      coordinates: site.coordinates || '',
      attendanceRadius: site.attendanceRadius != null ? String(site.attendanceRadius) : '',
      status: site.status || 'ACTIVE',
      sitManager: site.sitManager || '',
      projectId: site.projectId || '',
    });
    setFormErrors({});
    setFormGeneralError('');
    setIsEditModalOpen(true);
  };

  // Handle Location Picker selection
  const handleLocationSelected = ({ coordinates, address }) => {
    setFormData((prev) => ({
      ...prev,
      coordinates,
      address: address !== undefined ? address : prev.address,
    }));
    toast.success(`Coordinates set to ${coordinates}`);
  };

  // Open View Modal
  const openViewModal = (site) => {
    setSelectedSite(site);
    setIsViewModalOpen(true);
  };

  const loadProgress = async (siteId) => {
    setProgressLoading(true);
    try {
      const res = await fetch(`/api/progress?siteId=${encodeURIComponent(siteId)}`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setProgressRows([]);
        setProgressError(json.message || 'Could not load progress photos.');
        return;
      }
      setProgressRows(json.data || []);
    } catch {
      setProgressRows([]);
      setProgressError('Could not load progress photos.');
    } finally {
      setProgressLoading(false);
    }
  };

  const openProgress = (site) => {
    setSelectedSite(site);
    setProgressForm({ latitude: '', longitude: '', file: null });
    setProgressError('');
    setIsProgressOpen(true);
    loadProgress(site.id);
  };

  const submitProgress = async (e) => {
    e.preventDefault();
    if (!selectedSite) return;
    setProgressError('');
    if (!selectedSite.projectId) {
      setProgressError('Assign this site to a project before adding a progress photo.');
      return;
    }
    if (!progressForm.file) {
      setProgressError('Choose a site photo.');
      return;
    }
    setProgressSaving(true);
    try {
      const body = new FormData();
      body.append('file', progressForm.file);
      body.append('projectId', selectedSite.projectId);
      body.append('siteId', selectedSite.id);
      body.append('latitude', progressForm.latitude);
      body.append('longitude', progressForm.longitude);
      const res = await fetch('/api/progress', { method: 'POST', headers: getAuthHeaders(), body });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setProgressError(json.message || 'Could not save progress.');
        return;
      }
      setProgressForm({ latitude: '', longitude: '', file: null });
      toast.success('Progress photo saved.');
      loadProgress(selectedSite.id);
    } catch {
      setProgressError('Network error while saving progress.');
    } finally {
      setProgressSaving(false);
    }
  };

  // Open Delete / Deactivate Modal
  const openDeleteModal = (site) => {
    setSelectedSite(site);
    setIsDeleteModalOpen(true);
  };

  // Handle Create Site
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormGeneralError('');

    const errors = {};
    if (!formData.name.trim()) {
      errors.name = 'Site name is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        coordinates: formData.coordinates.trim() || null,
        attendanceRadius: formData.attendanceRadius !== '' ? parseInt(formData.attendanceRadius, 10) : null,
        status: formData.status || 'ACTIVE',
        sitManager: formData.sitManager ? formData.sitManager.trim() : null, // Site.sitManager -> Employee.id
        projectId: formData.projectId ? formData.projectId.trim() : null,   // Site.projectId -> Project.id
      };

      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsAddModalOpen(false);
        setSuccessMessage(`Site "${json.data.name}" registered successfully.`);
        toast.success(`Site "${json.data.name}" registered successfully.`);
        fetchSites();
      } else {
        const err = json.message || 'Failed to create site.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Create site error:', err);
      setFormGeneralError('Network error while creating site.');
      toast.error('Network error while creating site.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Site
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSite) return;
    setFormGeneralError('');

    const errors = {};
    if (!formData.name.trim()) {
      errors.name = 'Site name is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        coordinates: formData.coordinates.trim() || null,
        attendanceRadius: formData.attendanceRadius !== '' ? parseInt(formData.attendanceRadius, 10) : null,
        status: formData.status || 'ACTIVE',
        sitManager: formData.sitManager ? formData.sitManager.trim() : null,
        projectId: formData.projectId ? formData.projectId.trim() : null,
      };

      const res = await fetch(`/api/sites/${selectedSite.id}`, {
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
        setSuccessMessage(`Site "${json.data.name}" updated successfully.`);
        toast.success(`Site "${json.data.name}" updated successfully.`);
        fetchSites();
      } else {
        const err = json.message || 'Failed to update site.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Update site error:', err);
      setFormGeneralError('Network error while updating site.');
      toast.error('Network error while updating site.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Deactivate Site
  const handleDeactivateSite = async () => {
    if (!selectedSite) return;
    setIsSubmitting(true);
    try {
      const turningOn = selectedSite.isActive === false;
      const res = await fetch(`/api/sites/${selectedSite.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ isActive: turningOn }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setIsDeleteModalOpen(false);
        setSuccessMessage(`Site "${selectedSite.name}" deactivated successfully.`);
        toast.success(`Site "${selectedSite.name}" deactivated successfully.`);
        fetchSites();
      } else {
        const err = json.message || 'Failed to deactivate site.';
        setErrorMessage(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Deactivate site error:', err);
      setErrorMessage('Network error while deactivating site.');
      toast.error('Network error while deactivating site.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear all filters
  const resetFilters = () => {
    setSearchQuery('');
    setSelectedStatus('');
    setSelectedProject('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(searchQuery || selectedStatus || selectedProject);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header & Action Controls */}
      <ModuleHeader
        icon={MapPin}
        title="Sites"
        description="Work locations, their projects and site managers. Phones use them for attendance."
        help={<WorkflowGuide id="sites" />}
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
                fetchSites();
                fetchAuxiliaryData();
              }}
              isLoading={isLoading}
              title="Reload site data"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              <span>Refresh</span>
            </Button>

            {isManagerOrAdmin && (
              <Button variant="primary" size="sm" onClick={openAddModal}>
                <Plus className="h-4 w-4 mr-1.5" />
                <span>Add Site</span>
              </Button>
            )}
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

      {/* KPI Overview Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Sites
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {stats.total}
              </span>
              <MapPin className="h-5 w-5 text-sky-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">All work locations</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Active
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {stats.active}
              </span>
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Work going on now</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              On a project
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {stats.withProject}
              </span>
              <Briefcase className="h-5 w-5 text-indigo-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Linked to a project</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              With a manager
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {stats.withManager}
              </span>
              <User className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Site manager assigned</span>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-slate-200/90 shadow-2xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search site, address, GPS..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Project Filter (Site.projectId -> Project.id) */}
            <div>
              <select
                value={selectedProject}
                onChange={(e) => {
                  setSelectedProject(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition"
              >
                <option value="">All Projects</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name} {proj.tenderId ? `(${proj.tenderId})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition"
              >
                <option value="">All Statuses</option>
                {SITE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filters */}
            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="w-full text-rose-600 hover:bg-rose-50 border-rose-200"
                >
                  <X className="h-4 w-4 mr-1.5" />
                  <span>Reset Filters</span>
                </Button>
              ) : (
                <div className="text-xs text-slate-400 italic flex items-center justify-center w-full">
                  Showing {totalRecords} matching site{totalRecords === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sites Data Table */}
      <Card className="border-slate-200/90 overflow-hidden shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead className="w-[280px]">Site Name & Coordinates</TableHead>
              <TableHead className="min-w-[180px]">Project Allocation</TableHead>
              <TableHead className="min-w-[170px]">Site Manager</TableHead>
              <TableHead className="min-w-[200px]">Physical Address</TableHead>
              <TableHead className="text-center w-[120px]">Status</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableLoadingState message="Loading sites…" rows={5} cols={6} />
            ) : sites.length === 0 ? (
              <TableEmptyState
                colSpan={6}
                title="No Sites Found"
                description={
                  hasActiveFilters
                    ? 'No sites match these filters.'
                    : 'No operational sites registered in the database yet.'
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Clear Active Filters
                    </Button>
                  ) : isManagerOrAdmin ? (
                    <Button variant="primary" size="sm" onClick={openAddModal}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      Create First Site
                    </Button>
                  ) : null
                }
              />
            ) : (
              sites.map((site) => (
                <TableRow key={site.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Site Name & Coordinates */}
                  <TableCell className="font-semibold text-slate-900">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 text-xs font-bold mt-0.5 shadow-2xs">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-slate-900 leading-snug truncate">
                          {site.name}
                        </span>
                        {site.coordinates ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 mt-0.5">
                            <Compass className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[180px]">{site.coordinates}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No GPS coordinates</span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Project Allocation (Site.projectId -> Project.id) */}
                  <TableCell>
                    {site.project ? (
                      <div className="space-y-0.5">
                        <Link
                          href={`/projects/${site.project.id}`}
                          className="font-bold text-xs text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1 group"
                          title={`Open ${site.project.name} dossier`}
                        >
                          <Briefcase className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                          <span className="truncate max-w-[160px]">{site.project.name}</span>
                          <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition shrink-0" />
                        </Link>
                        {site.project.tenderId && (
                          <span className="inline-block text-[10px] font-mono text-slate-400">
                            {site.project.tenderId}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Unassigned</span>
                    )}
                  </TableCell>

                  {/* Site Manager (Site.sitManager -> Employee.id) */}
                  <TableCell>
                    {site.manager ? (
                      <div className="space-y-0.5">
                        <span className="font-semibold text-xs text-slate-800 flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate max-w-[140px]">{site.manager.name}</span>
                        </span>
                        {site.manager.phone && (
                          <span className="block text-[11px] font-mono text-slate-500">
                            {site.manager.phone}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">No manager assigned</span>
                    )}
                  </TableCell>

                  {/* Physical Address */}
                  <TableCell className="text-slate-600 text-xs">
                    {site.address ? (
                      <span className="line-clamp-2 max-w-[220px]" title={site.address}>
                        {site.address}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">—</span>
                    )}
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell className="text-center">
                    {renderStatusBadge(site.status)}
                  </TableCell>

                  {/* Actions Column */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* View Button */}
                      {isManagerOrAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View site images and progress"
                          onClick={() => openProgress(site)}
                        >
                          <Images className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View Site Details"
                        onClick={() => openViewModal(site)}
                      >
                        <Eye className="h-4 w-4 text-slate-500 hover:text-sky-600" />
                      </Button>

                      {/* Edit Button */}
                      {isManagerOrAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit Site"
                          onClick={() => openEditModal(site)}
                        >
                          <Pencil className="h-4 w-4 text-slate-500 hover:text-amber-600" />
                        </Button>
                      )}

                      {/* Delete / Deactivate Button */}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={site.isActive === false ? 'Activate Site' : 'Deactivate Site'}
                          onClick={() => openDeleteModal(site)}
                        >
                          <PowerOff className="h-4 w-4 text-slate-500 hover:text-rose-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        {!isLoading && sites.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 px-4 py-3 gap-3 bg-slate-50/50">
            <div className="text-xs text-slate-500 font-medium">
              Showing page <span className="font-bold text-slate-900">{page}</span> of{' '}
              <span className="font-bold text-slate-900">{totalPages}</span> ({totalRecords} sites total)
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>

              <div className="px-2 text-xs font-mono font-bold text-slate-700">
                {page} / {totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ================= ADD SITE MODAL ================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add site"
        description="Register an operational field site, link to an ongoing project, and assign an employee site manager."
        maxWidth="max-w-2xl"
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
              Create Site
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

          {/* Site Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Site Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Bypass Road, Km 12"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Project Dropdown (Site.projectId -> Project.id) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Linked Project (Project.id)
              </label>
              <select
                value={formData.projectId}
                onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">-- No Project Linked --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.tenderId ? `(${p.tenderId})` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Populated from registered Project entities.
              </p>
            </div>

            {/* Site Manager Dropdown (Site.sitManager -> Employee.id) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Site Manager (Employee.id)
              </label>
              <select
                value={formData.sitManager}
                onChange={(e) => setFormData({ ...formData, sitManager: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">-- No Manager Assigned --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.employeeCode ? `[${emp.employeeCode}]` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Dropdown must use Employee accounts.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Operational Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                {SITE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* GPS Coordinates */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  GPS Coordinates
                </label>
                <button
                  type="button"
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="text-xs font-medium text-sky-500 hover:text-sky-600 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <MapPin className="h-3.5 w-3.5 text-sky-500" />
                  <span>Select on Map</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. 13.0827, 80.2707"
                  value={formData.coordinates}
                  onChange={(e) => setFormData({ ...formData, coordinates: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 pr-28 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="h-3 w-3 text-sky-600" />
                  <span>Pick Map</span>
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Search place &amp; pin location on interactive map.
              </p>
            </div>
          </div>

          {/* Address & Attendance Radius */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Address */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Physical Location & Address
              </label>
              <textarea
                rows={2}
                placeholder="Street address or nearest landmark…"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            {/* Attendance Radius */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Attendance Radius <span className="text-slate-400 font-normal normal-case">(metres)</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 200"
                value={formData.attendanceRadius}
                onChange={(e) => setFormData({ ...formData, attendanceRadius: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Max distance (m) allowed for attendance check-in.
              </p>
            </div>
          </div>
        </form>
      </Modal>

      {/* ================= EDIT SITE MODAL ================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Site Details"
        description={`Update location, project allocation, and site manager for ${selectedSite?.name}`}
        maxWidth="max-w-2xl"
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

          {/* Site Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Site Name <span className="text-rose-500">*</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Project Dropdown */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Linked Project (Project.id)
              </label>
              <select
                value={formData.projectId}
                onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">-- No Project Linked --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.tenderId ? `(${p.tenderId})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Site Manager Dropdown */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Site Manager (Employee.id)
              </label>
              <select
                value={formData.sitManager}
                onChange={(e) => setFormData({ ...formData, sitManager: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">-- No Manager Assigned --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.employeeCode ? `[${emp.employeeCode}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Operational Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                {SITE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* GPS Coordinates */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  GPS Coordinates
                </label>
                <button
                  type="button"
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="text-xs font-medium text-sky-500 hover:text-sky-600 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <MapPin className="h-3.5 w-3.5 text-sky-500" />
                  <span>Select on Map</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. 13.0827, 80.2707"
                  value={formData.coordinates}
                  onChange={(e) => setFormData({ ...formData, coordinates: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 pr-28 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="h-3 w-3 text-sky-600" />
                  <span>Pick Map</span>
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Search place &amp; pin location on interactive map.
              </p>
            </div>
          </div>

          {/* Address & Attendance Radius */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Address */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Physical Location & Address
              </label>
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            {/* Attendance Radius */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Attendance Radius <span className="text-slate-400 font-normal normal-case">(metres)</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 200"
                value={formData.attendanceRadius}
                onChange={(e) => setFormData({ ...formData, attendanceRadius: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Max distance (m) allowed for attendance check-in.
              </p>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isProgressOpen}
        onClose={() => setIsProgressOpen(false)}
        title={`Site progress — ${selectedSite?.name || ''}`}
        description="Photos for this site, with the progress date, project, and latitude and longitude saved on each record."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={submitProgress} className="space-y-3 mb-5">
          {progressError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{progressError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="mt-1 block w-full text-xs"
                onChange={(e) => setProgressForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Latitude
              <input
                required
                value={progressForm.latitude}
                onChange={(e) => setProgressForm((prev) => ({ ...prev, latitude: e.target.value }))}
                placeholder="26.1445"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Longitude
              <input
                required
                value={progressForm.longitude}
                onChange={(e) => setProgressForm((prev) => ({ ...prev, longitude: e.target.value }))}
                placeholder="91.7362"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <Button type="submit" variant="primary" size="sm" isLoading={progressSaving} disabled={!isManagerOrAdmin}>
            Save progress photo
          </Button>
        </form>
        <ProgressGallery rows={progressRows} loading={progressLoading} />
      </Modal>

      {/* ================= VIEW SITE MODAL ================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Site Operational Dossier"
        description="Location, project and site manager."
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span>Site.id: {selectedSite?.id.substring(0, 12)}...</span>
              <button
                onClick={() => copyToClipboard(selectedSite?.id)}
                className="hover:text-sky-600 transition p-1"
                title="Copy full Site ID"
              >
                {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
              {isManagerOrAdmin && selectedSite && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsViewModalOpen(false);
                    openEditModal(selectedSite);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit Site
                </Button>
              )}
            </div>
          </div>
        }
      >
        {selectedSite && (
          <div className="space-y-4 text-xs">
            {/* Header Badge & Name */}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/60 p-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Operational Site Name
                </span>
                <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                  {selectedSite.name}
                </h3>
              </div>
              <div>{renderStatusBadge(selectedSite.status)}</div>
            </div>

            {/* Project & Manager Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Linked Project Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5 text-sky-600" /> Linked Project
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Site.projectId</span>
                </div>

                {selectedSite.project ? (
                  <div className="space-y-1.5 pt-1">
                    <h5 className="font-bold text-sm text-slate-900">
                      {selectedSite.project.name}
                    </h5>
                    {selectedSite.project.tenderId && (
                      <p className="font-mono text-[11px] text-slate-500">
                        Tender: {selectedSite.project.tenderId}
                      </p>
                    )}
                    <Link
                      href={`/projects/${selectedSite.project.id}`}
                      className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold pt-1"
                    >
                      <span>Open Full Project Dossier</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ) : (
                  <p className="text-slate-400 italic pt-1">No project currently mapped to this site.</p>
                )}
              </div>

              {/* Site Manager Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-indigo-600" /> Site Manager
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Site.sitManager</span>
                </div>

                {selectedSite.manager ? (
                  <div className="space-y-1 pt-1">
                    <h5 className="font-bold text-sm text-slate-900">
                      {selectedSite.manager.name}
                    </h5>
                    {selectedSite.manager.employeeCode && (
                      <p className="font-mono text-[11px] text-slate-500">
                        Code: {selectedSite.manager.employeeCode}
                      </p>
                    )}
                    {selectedSite.manager.phone && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono text-slate-700">{selectedSite.manager.phone}</span>
                        <a
                          href={`tel:${selectedSite.manager.phone}`}
                          className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-400 italic pt-1">No employee assigned as site manager.</p>
                )}
              </div>
            </div>

            {/* Location, GPS & Attendance Radius */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Physical Geography & Coordinates
              </span>

              <div className="flex items-start gap-2 pt-1 text-slate-700">
                <MapPin className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  {selectedSite.address || 'No physical landmark or address registered.'}
                </span>
              </div>

              {selectedSite.coordinates && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-slate-600">
                  <span className="font-mono font-medium flex items-center gap-1">
                    <Compass className="h-3.5 w-3.5 text-slate-400" />
                    GPS: {selectedSite.coordinates}
                  </span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(selectedSite.coordinates)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold"
                  >
                    <span>View Map</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {selectedSite.attendanceRadius != null && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-slate-600">
                  <span className="flex items-center gap-1 font-medium">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                    Attendance Radius
                  </span>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {selectedSite.attendanceRadius} m
                  </span>
                </div>
              )}
            </div>

            {/* Attendance & Audit Footnote */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-slate-500">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Field Attendance Logs:
              </span>
              <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                {selectedSite.attendanceCount || 0} Records
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= DELETE / DEACTIVATE MODAL ================= */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={selectedSite?.isActive === false ? 'Activate Site' : 'Deactivate Site'}
        description="Deactivated sites stay in the database and disappear from the normal list. An administrator can activate them again."
        maxWidth="max-w-lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeactivateSite}
              isLoading={isSubmitting}
              className="text-amber-700 hover:bg-amber-50 border-amber-300"
            >
              <PowerOff className="h-4 w-4 mr-1.5" />
              {selectedSite?.isActive === false ? 'Activate Site' : 'Deactivate Site'}
            </Button>
          </div>
        }
      >
        {selectedSite && (
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-900">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-sm block">Action Required for: {selectedSite.name}</span>
                <p className="leading-relaxed">
                  Sites often have connected field attendance records from employees working at this location.
                </p>
              </div>
            </div>

            <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-700">
              <div className="flex justify-between py-1 border-b border-slate-200/80">
                <span className="text-slate-500">Site Name:</span>
                <span className="font-bold text-slate-900">{selectedSite.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/80">
                <span className="text-slate-500">Linked Project:</span>
                <span className="font-semibold text-slate-800">
                  {selectedSite.project?.name || 'None'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Associated Attendances:</span>
                <span className="font-mono font-bold text-slate-800">
                  {selectedSite.attendanceCount || 0} Records
                </span>
              </div>
            </div>

            <p className="text-slate-500 leading-relaxed">
              <strong>Deactivating</strong> keeps all historic attendance logs intact while hiding the site from active operations. <strong>Deleting permanently</strong> will disassociate or remove related attendance links.
            </p>
          </div>
        )}
      </Modal>

      {/* ================= LOCATION PICKER MAP MODAL ================= */}
      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        initialCoordinates={formData.coordinates}
        initialAddress={formData.address}
        onSelectLocation={handleLocationSelected}
      />
    </div>
  );
}
