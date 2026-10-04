'use client';

import ModuleHeader from '@/components/layout/ModuleHeader';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Camera,
  MapPin,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  ExternalLink,
  Briefcase,
  Copy,
  Check,
  Download,
  LayoutGrid,
  Table as TableIcon,
  Filter,
  SlidersHorizontal,
  Compass,
  Building2,
  ArrowUpDown,
  Navigation,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
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

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

function getRelativeTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffDays === 0) {
      if (diffHrs === 0) {
        if (diffMin < 2) return 'Just now';
        return `${diffMin}m ago`;
      }
      return `${diffHrs}h ago`;
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  } catch {
    return '';
  }
}

export default function ProgressPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isManagerOrAdmin = user?.role === 'A' || user?.role === 'M';
  const isAdmin = user?.role === 'A';

  // ── States ──────────────────────────────────────────────────────────────
  const [records, setRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dropdown options
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [datePreset, setDatePreset] = useState('ALL'); // ALL, TODAY, WEEK, MONTH, CUSTOM
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Add Progress Form
  const [addForm, setAddForm] = useState({
    projectId: '',
    siteId: '',
    latitude: '',
    longitude: '',
    file: null,
  });
  const [addFilePreview, setAddFilePreview] = useState('');
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsDetectMessage, setGpsDetectMessage] = useState('');
  const [addError, setAddError] = useState('');
  const addFileInputRef = useRef(null);

  // Copy indicator
  const [copiedKey, setCopiedKey] = useState('');

  // ── Load Dropdowns (Projects & Sites) ──────────────────────────────────
  const loadFilterOptions = useCallback(async () => {
    try {
      const [projRes, siteRes] = await Promise.all([
        fetch('/api/projects?limit=100', { headers: getAuthHeaders() }),
        fetch('/api/sites?dropdown=true', { headers: getAuthHeaders() }),
      ]);
      const projJson = await projRes.json();
      const siteJson = await siteRes.json();

      if (projJson.success && Array.isArray(projJson.data)) {
        setProjects(projJson.data);
      }
      if (siteJson.success && Array.isArray(siteJson.data)) {
        setSites(siteJson.data);
      }
    } catch {
      // Non-critical; filters will degrade gracefully
    }
  }, []);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  // ── Sites filtered by chosen project in Add Form / Filter bar ──────────
  const availableSitesForFilter = useMemo(() => {
    if (!selectedProject) return sites;
    return sites.filter((s) => s.projectId === selectedProject);
  }, [sites, selectedProject]);

  const availableSitesForAdd = useMemo(() => {
    if (!addForm.projectId) return sites;
    return sites.filter((s) => s.projectId === addForm.projectId);
  }, [sites, addForm.projectId]);

  // ── Date presets handler ───────────────────────────────────────────────
  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    setPage(1);

    const now = new Date();
    if (preset === 'ALL') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'TODAY') {
      const d = now.toISOString().split('T')[0];
      setFromDate(d);
      setToDate(d);
    } else if (preset === 'WEEK') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      setFromDate(past.toISOString().split('T')[0]);
      setToDate(now.toISOString().split('T')[0]);
    } else if (preset === 'MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(firstDay.toISOString().split('T')[0]);
      setToDate(now.toISOString().split('T')[0]);
    }
  };

  // ── Fetch Progress Records ─────────────────────────────────────────────
  const fetchProgress = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedProject) params.set('projectId', selectedProject);
      if (selectedSite) params.set('siteId', selectedSite);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (includeArchived && isAdmin) params.set('includeInactive', 'true');

      const res = await fetch(`/api/progress?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setRecords(json.data || []);
        if (json.pagination) {
          setTotalCount(json.pagination.total ?? (json.data || []).length);
          setTotalPages(json.pagination.totalPages ?? 1);
        } else {
          setTotalCount((json.data || []).length);
          setTotalPages(1);
        }
      } else {
        toast.error(json.message || 'Failed to load progress records.');
      }
    } catch {
      toast.error('Network error loading progress records.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [
    page,
    limit,
    sortBy,
    sortOrder,
    searchQuery,
    selectedProject,
    selectedSite,
    fromDate,
    toDate,
    includeArchived,
    isAdmin,
    toast,
  ]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchProgress();
  };

  // ── Reset Filters ──────────────────────────────────────────────────────
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (selectedProject) count++;
    if (selectedSite) count++;
    if (fromDate || toDate) count++;
    if (includeArchived) count++;
    return count;
  }, [searchQuery, selectedProject, selectedSite, fromDate, toDate, includeArchived]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedProject('');
    setSelectedSite('');
    setDatePreset('ALL');
    setFromDate('');
    setToDate('');
    setIncludeArchived(false);
    setPage(1);
  };

  // ── KPI Stats Derived ──────────────────────────────────────────────────
  const kpiStats = useMemo(() => {
    const distinctSites = new Set(records.map((r) => r.siteId).filter(Boolean)).size;
    const distinctProjects = new Set(records.map((r) => r.projectId).filter(Boolean)).size;
    const latestRecord = records[0];

    return {
      total: totalCount,
      sites: distinctSites,
      projects: distinctProjects,
      latest: latestRecord ? getRelativeTime(latestRecord.createdAt) : 'None yet',
    };
  }, [records, totalCount]);

  // ── Copy Helper ────────────────────────────────────────────────────────
  const copyText = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopiedKey(key);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // ── Detect GPS in Add Form ─────────────────────────────────────────────
  const detectCurrentGps = () => {
    if (!navigator.geolocation) {
      setGpsDetectMessage('Geolocation is not supported by your browser.');
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setIsDetectingGps(true);
    setGpsDetectMessage('Detecting current satellite location…');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const acc = Math.round(pos.coords.accuracy);
        setAddForm((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        setGpsDetectMessage(`GPS detected (Accuracy ±${acc}m).`);
        toast.success(`Location locked: ${lat}, ${lng} (±${acc}m)`);
        setIsDetectingGps(false);
      },
      (err) => {
        setIsDetectingGps(false);
        setGpsDetectMessage(`GPS error: ${err.message}`);
        toast.error(`Could not detect location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // ── File Selection in Add Form ─────────────────────────────────────────
  const handleAddFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAddForm((prev) => ({ ...prev, file }));
    try {
      const preview = URL.createObjectURL(file);
      setAddFilePreview(preview);
    } catch {}
  };

  const handleOpenAdd = () => {
    setAddForm({
      projectId: selectedProject || (projects[0]?.id || ''),
      siteId: selectedSite || '',
      latitude: '',
      longitude: '',
      file: null,
    });
    setAddFilePreview('');
    setAddError('');
    setGpsDetectMessage('');
    setIsAddModalOpen(true);
  };

  // ── Submit Add Progress ────────────────────────────────────────────────
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddError('');

    if (!addForm.projectId) {
      setAddError('Please select a project.');
      return;
    }
    if (!addForm.siteId) {
      setAddError('Please select a site.');
      return;
    }
    if (!addForm.latitude || isNaN(Number(addForm.latitude))) {
      setAddError('Please provide a valid latitude number.');
      return;
    }
    if (!addForm.longitude || isNaN(Number(addForm.longitude))) {
      setAddError('Please provide a valid longitude number.');
      return;
    }
    if (!addForm.file) {
      setAddError('Please select a progress photo to upload.');
      return;
    }

    setIsSavingProgress(true);
    try {
      const fd = new FormData();
      fd.append('projectId', addForm.projectId);
      fd.append('siteId', addForm.siteId);
      fd.append('latitude', addForm.latitude);
      fd.append('longitude', addForm.longitude);
      fd.append('file', addForm.file);

      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: fd,
      });
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success('Site progress photo uploaded and logged!');
        setIsAddModalOpen(false);
        fetchProgress();
      } else {
        setAddError(json.message || 'Failed to save progress photo.');
        toast.error(json.message || 'Failed to save progress.');
      }
    } catch {
      setAddError('Network error while saving progress.');
      toast.error('Network error while saving progress.');
    } finally {
      setIsSavingProgress(false);
    }
  };

  // ── Delete Progress ────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!selectedRecord) return;
    try {
      const res = await fetch(`/api/progress/${selectedRecord.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success('Progress log removed.');
        setIsDeleteModalOpen(false);
        setSelectedRecord(null);
        fetchProgress();
      } else {
        toast.error(json.message || 'Could not delete progress log.');
      }
    } catch {
      toast.error('Network error during deletion.');
    }
  };

  // ── Export CSV ─────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (!records.length) {
      toast.error('No progress logs to export.');
      return;
    }

    const headers = [
      'Log ID',
      'Date',
      'Time',
      'Project Name',
      'Project Tender Ref',
      'Site Name',
      'Latitude',
      'Longitude',
      'Google Maps URL',
      'Photo URL',
      'Logged By',
      'Status',
    ];

    const rows = records.map((r) => [
      `"${r.id}"`,
      `"${formatDate(r.createdAt)}"`,
      `"${formatTime(r.createdAt)}"`,
      `"${(r.project?.name || '').replace(/"/g, '""')}"`,
      `"${(r.project?.tenderId || '').replace(/"/g, '""')}"`,
      `"${(r.site?.name || '').replace(/"/g, '""')}"`,
      r.latitude,
      r.longitude,
      `"https://www.google.com/maps?q=${r.latitude},${r.longitude}"`,
      `"${r.images}"`,
      `"${r.createdBy || ''}"`,
      r.isActive !== false ? 'Active' : 'Inactive',
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `site-progress-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${records.length} progress logs to CSV!`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ════════════════════ PAGE HEADER ════════════════════ */}
      <ModuleHeader
        icon={Camera}
        title="Site Progress"
        description="GPS-verified site photos, visual construction timeline, and inspection records."
        actions={
          <>
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Gallery</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!records.length}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-slate-500" />
              Export CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            {isManagerOrAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenAdd}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Progress Photo
              </Button>
            )}
          </>
        }
      />

      {/* ════════════════════ METRICS CARDS ════════════════════ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-slate-200/90 shadow-2xs hover:shadow-xs transition">
          <CardContent className="p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Photos
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {kpiStats.total}
              </span>
              <Camera className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">All progress photos</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 shadow-2xs hover:shadow-xs transition">
          <CardContent className="p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Sites covered
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {kpiStats.sites}
              </span>
              <MapPin className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">With at least one photo</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 shadow-2xs hover:shadow-xs transition">
          <CardContent className="p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Projects
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {kpiStats.projects}
              </span>
              <Briefcase className="h-5 w-5 text-indigo-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">With site photos</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 shadow-2xs hover:shadow-xs transition">
          <CardContent className="p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Latest photo
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-extrabold font-sans text-slate-900 truncate">
                {kpiStats.latest}
              </span>
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Most recent upload</span>
          </CardContent>
        </Card>
      </div>

      {/* ════════════════════ FILTERS BAR ════════════════════ */}
      <Card className="border-slate-200/90 shadow-2xs">
        <CardContent className="p-4 space-y-3.5">
          {/* Top Row: Search + Project Filter + Site Filter + Sort */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search project, site, uploader…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Project Filter */}
            <div>
              <select
                value={selectedProject}
                onChange={(e) => {
                  setSelectedProject(e.target.value);
                  setSelectedSite(''); // Reset site when project changes
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
              >
                <option value="">All Projects ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.tenderId ? `(${p.tenderId})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Site Filter */}
            <div>
              <select
                value={selectedSite}
                onChange={(e) => {
                  setSelectedSite(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
              >
                <option value="">
                  {selectedProject
                    ? `All Sites for Project (${availableSitesForFilter.length})`
                    : `All Sites (${sites.length})`}
                </option>
                {availableSitesForFilter.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div>
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [sb, so] = e.target.value.split(':');
                  setSortBy(sb);
                  setSortOrder(so);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
              >
                <option value="createdAt:desc">Date: Newest First</option>
                <option value="createdAt:asc">Date: Oldest First</option>
                <option value="project:asc">Project: A → Z</option>
                <option value="site:asc">Site: A → Z</option>
              </select>
            </div>
          </div>

          {/* Bottom Row: Date Presets & Custom Range + Active Filters reset */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            {/* Quick Date Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Timeframe:
              </span>
              {[
                { label: 'All Time', value: 'ALL' },
                { label: 'Today', value: 'TODAY' },
                { label: 'Last 7 Days', value: 'WEEK' },
                { label: 'This Month', value: 'MONTH' },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => applyDatePreset(preset.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    datePreset === preset.value
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {preset.label}
                </button>
              ))}

              {/* Custom Date Pickers */}
              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setDatePreset('CUSTOM');
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none"
                  title="From Date"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setDatePreset('CUSTOM');
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none"
                  title="To Date"
                />
              </div>
            </div>

            {/* Right side: Active archived toggle (admin) + Reset */}
            <div className="flex items-center gap-3">
              {isAdmin && (
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e) => {
                      setIncludeArchived(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                  />
                  <span>Show archived</span>
                </label>
              )}

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 transition"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Reset Filters ({activeFiltersCount})</span>
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ════════════════════ CONTENT: TABLE OR GRID ════════════════════ */}
      {viewMode === 'table' ? (
        /* TABLE VIEW */
        <Card className="border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/90 border-b border-slate-200 text-slate-600">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead className="w-24">Photo</TableHead>
                  <TableHead className="min-w-[140px]">Date & Time</TableHead>
                  <TableHead className="min-w-[200px]">Project</TableHead>
                  <TableHead className="min-w-[160px]">Site Location</TableHead>
                  <TableHead className="min-w-[170px]">GPS Coordinates</TableHead>
                  <TableHead className="min-w-[120px]">Logged By</TableHead>
                  <TableHead className="w-20 text-center">Status</TableHead>
                  <TableHead className="w-28 text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableLoadingState colSpan={9} message="Loading site progress records…" />
                ) : records.length === 0 ? (
                  <TableEmptyState
                    colSpan={9}
                    title="No progress logs found"
                    description={
                      activeFiltersCount > 0
                        ? 'Try clearing or changing your filters to find records.'
                        : 'No site progress photos have been logged yet.'
                    }
                    action={
                      activeFiltersCount > 0 ? (
                        <Button variant="outline" size="sm" onClick={handleResetFilters}>
                          Clear all filters
                        </Button>
                      ) : isManagerOrAdmin ? (
                        <Button variant="primary" size="sm" onClick={handleOpenAdd}>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Record First Progress
                        </Button>
                      ) : null
                    }
                  />
                ) : (
                  records.map((row, idx) => {
                    const rowNumber = (page - 1) * limit + idx + 1;
                    const mapsUrl = `https://www.google.com/maps?q=${row.latitude},${row.longitude}`;

                    return (
                      <TableRow key={row.id} className="hover:bg-slate-50/70 transition">
                        {/* Serial Number */}
                        <TableCell className="text-center font-mono text-xs text-slate-400">
                          {rowNumber}
                        </TableCell>

                        {/* Photo Thumbnail */}
                        <TableCell>
                          <div
                            onClick={() => {
                              setSelectedRecord(row);
                              setIsViewModalOpen(true);
                            }}
                            className="group relative h-14 w-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer shadow-2xs hover:shadow-md transition"
                            title="Click to view full photo"
                          >
                            <img
                              src={row.images}
                              alt="Site progress"
                              className="h-full w-full object-cover group-hover:scale-108 transition-transform duration-200"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <Eye className="h-4 w-4" />
                            </div>
                          </div>
                        </TableCell>

                        {/* Date & Time */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 font-bold text-slate-900 text-xs">
                              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{formatDate(row.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{formatTime(row.createdAt)}</span>
                              <span className="inline-block px-1.5 py-0.2 rounded-md bg-slate-100 text-[10px] font-mono text-slate-600">
                                {getRelativeTime(row.createdAt)}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Project */}
                        <TableCell>
                          {row.project ? (
                            <div className="space-y-1 max-w-[240px]">
                              <p className="font-semibold text-xs text-slate-900 truncate" title={row.project.name}>
                                {row.project.name}
                              </p>
                              {row.project.tenderId && (
                                <span className="inline-block font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-bold truncate">
                                  Ref: {row.project.tenderId}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Unassigned</span>
                          )}
                        </TableCell>

                        {/* Site */}
                        <TableCell>
                          {row.site ? (
                            <div className="space-y-0.5 max-w-[180px]">
                              <div className="flex items-start gap-1 text-xs">
                                <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                <span className="font-medium text-slate-800 truncate" title={row.site.name}>{row.site.name}</span>
                              </div>
                              {row.site.address && (
                                <p className="text-[10px] text-slate-400 truncate pl-4.5" title={row.site.address}>{row.site.address}</p>
                              )}
                              {row.site.manager?.name && (
                                <p className="text-[10px] text-slate-500 font-medium pl-4.5">Mgr: {row.site.manager.name}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">No Site</span>
                          )}
                        </TableCell>

                        {/* GPS Coordinates */}
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs font-mono text-slate-700">
                              <span>
                                {row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyText(`${row.latitude}, ${row.longitude}`, `gps-${row.id}`)}
                                className="p-0.5 text-slate-400 hover:text-slate-700 transition"
                                title="Copy coordinates"
                              >
                                {copiedKey === `gps-${row.id}` ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                            >
                              <Navigation className="h-3 w-3" />
                              <span>View on Maps</span>
                            </a>
                          </div>
                        </TableCell>

                        {/* Logged By */}
                        <TableCell>
                          <div className="space-y-0.5 max-w-[140px]">
                            <p className="text-xs font-semibold text-slate-800 truncate" title={row.creator?.name || row.createdBy || 'System'}>
                              {row.creator?.name || (row.createdBy ? `${row.createdBy.substring(0, 10)}…` : 'System')}
                            </p>
                            {row.creator?.role && (
                              <span className="text-[10px] font-mono text-slate-400 block">
                                {row.creator.role === 'A' ? 'Admin' : row.creator.role === 'M' ? 'Manager' : 'Employee'}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-center">
                          {row.isActive !== false ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              Archived
                            </span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRecord(row);
                                setIsViewModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition"
                              title="View full progress photo and details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 transition"
                              title="Open in Google Maps"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            {isManagerOrAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRecord(row);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title="Delete progress log"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        /* GALLERY / GRID VIEW */
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 mr-2" />
              <span className="text-sm font-medium text-slate-600">Loading progress gallery…</span>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-2xl border border-slate-200">
              <Camera className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-700">No progress photos found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                No progress photos match the selected filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {records.map((row) => {
                const mapsUrl = `https://www.google.com/maps?q=${row.latitude},${row.longitude}`;

                return (
                  <article
                    key={row.id}
                    className="group relative rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs hover:shadow-md transition flex flex-col"
                  >
                    {/* Photo Container */}
                    <div
                      onClick={() => {
                        setSelectedRecord(row);
                        setIsViewModalOpen(true);
                      }}
                      className="relative aspect-video w-full overflow-hidden bg-slate-900 cursor-pointer"
                    >
                      <img
                        src={row.images}
                        alt="Site progress"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20" />

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white">
                          <Calendar className="h-3 w-3" />
                          {formatDate(row.createdAt)}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 backdrop-blur-xs text-[10px] font-bold text-white">
                          <Navigation className="h-3 w-3" />
                          GPS Locked
                        </span>
                      </div>

                      {/* Bottom Info over image */}
                      <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
                        <h4 className="font-bold text-sm truncate" title={row.site?.name || 'Site'}>
                          {row.site?.name || 'Site Location'}
                        </h4>
                        <p className="text-[11px] text-slate-300 truncate" title={row.project?.name}>
                          {row.project?.name || 'No Project'}
                        </p>
                      </div>
                    </div>

                    {/* Metadata & Actions */}
                    <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-slate-500 text-[11px]">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(row.createdAt)} ({getRelativeTime(row.createdAt)})
                          </span>
                          <span className="font-mono text-[10px]">
                            {row.latitude.toFixed(3)}, {row.longitude.toFixed(3)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          <Navigation className="h-3 w-3" />
                          Maps Pin
                        </a>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRecord(row);
                              setIsViewModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-emerald-600 rounded"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {isManagerOrAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRecord(row);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ PAGINATION BAR ════════════════════ */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-2">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span>
            Showing {totalCount > 0 ? (page - 1) * limit + 1 : 0} to{' '}
            {Math.min(page * limit, totalCount)} of {totalCount} records
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="h-8 px-2.5 border-slate-200"
          >
            <ChevronLeft className="h-4 w-4 mr-0.5" />
            Previous
          </Button>
          <span className="px-2 font-mono text-xs font-semibold text-slate-700">
            Page {page} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="h-8 px-2.5 border-slate-200"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-0.5" />
          </Button>
        </div>
      </div>

      {/* ════════════════════ ADD PROGRESS MODAL ════════════════════ */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Record Site Progress Photo"
        description="Upload a site progress image stamped with GPS coordinates, project, and site location."
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)} disabled={isSavingProgress}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddSubmit}
              isLoading={isSavingProgress}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Upload & Save Progress
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
          {addError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{addError}</span>
            </div>
          )}

          {/* Project & Site Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Linked Project <span className="text-rose-500">*</span>
              </label>
              <select
                value={addForm.projectId}
                onChange={(e) => {
                  setAddForm((prev) => ({
                    ...prev,
                    projectId: e.target.value,
                    siteId: '', // Reset site when project changes
                  }));
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required
              >
                <option value="">-- Choose Project --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.tenderId ? `(${p.tenderId})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Site Location <span className="text-rose-500">*</span>
              </label>
              <select
                value={addForm.siteId}
                onChange={(e) => setAddForm((prev) => ({ ...prev, siteId: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required
              >
                <option value="">-- Choose Site --</option>
                {availableSitesForAdd.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Photo Upload Zone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Progress Photo <span className="text-rose-500">*</span>
            </label>
            <div
              onClick={() => addFileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                addFilePreview
                  ? 'border-emerald-400 bg-emerald-50/40'
                  : 'border-slate-300 hover:border-emerald-400 bg-slate-50/60'
              }`}
            >
              <input
                ref={addFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAddFileChange}
                className="hidden"
              />

              {addFilePreview ? (
                <div className="space-y-2">
                  <div className="relative mx-auto h-36 max-w-xs rounded-lg overflow-hidden border border-emerald-200 shadow-2xs">
                    <img src={addFilePreview} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                  <p className="text-xs font-medium text-emerald-800">
                    Selected: {addForm.file?.name} ({(addForm.file?.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                  <p className="text-[11px] text-slate-400">Click to choose a different photo</p>
                </div>
              ) : (
                <div className="py-4 space-y-1">
                  <Camera className="h-8 w-8 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-slate-800">
                    Click or drag & drop a site photo here
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Supports JPG, PNG, WEBP up to 8MB
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* GPS Coordinates Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-emerald-600" />
                GPS Coordinates
              </span>
              <button
                type="button"
                onClick={detectCurrentGps}
                disabled={isDetectingGps}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-xs font-semibold transition"
              >
                <Navigation className={`h-3.5 w-3.5 ${isDetectingGps ? 'animate-spin' : ''}`} />
                <span>{isDetectingGps ? 'Detecting…' : 'Get Current Location'}</span>
              </button>
            </div>

            {gpsDetectMessage && (
              <p className="text-[11px] text-emerald-700 font-medium">{gpsDetectMessage}</p>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Latitude</label>
                <input
                  type="text"
                  placeholder="e.g. 20.2644"
                  value={addForm.latitude}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, latitude: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Longitude</label>
                <input
                  type="text"
                  placeholder="e.g. 85.8281"
                  value={addForm.longitude}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, longitude: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ════════════════════ VIEW DETAIL MODAL ════════════════════ */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Site Progress Detail"
        description="High-resolution inspection photograph and GPS telemetry."
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full text-xs">
            <span className="font-mono text-slate-400 truncate max-w-[200px]">
              ID: {selectedRecord?.id}
            </span>
            <div className="flex gap-2">
              {selectedRecord && (
                <a
                  href={`https://www.google.com/maps?q=${selectedRecord.latitude},${selectedRecord.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Navigation className="h-3.5 w-3.5 text-emerald-600" />
                  Google Maps
                </a>
              )}
              <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        {selectedRecord && (
          <div className="space-y-4 text-xs">
            {/* Full-width Image */}
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video max-h-80 flex items-center justify-center">
              <img
                src={selectedRecord.images}
                alt="Site progress full"
                className="max-h-full max-w-full object-contain"
              />
              <a
                href={selectedRecord.images}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[11px] font-semibold hover:bg-black/90 transition"
              >
                <ExternalLink className="h-3 w-3" />
                Open Full Resolution
              </a>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Associated Project
                </span>
                <p className="font-bold text-slate-900 text-sm">{selectedRecord.project?.name || 'Unassigned'}</p>
                {selectedRecord.project?.tenderId && (
                  <p className="font-mono text-[11px] text-sky-700 font-semibold">Tender: {selectedRecord.project.tenderId}</p>
                )}
                {selectedRecord.project?.status && (
                  <p className="text-[11px] text-slate-600">Status: <span className="font-semibold">{selectedRecord.project.status}</span></p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Site Location
                </span>
                <p className="font-bold text-slate-900 text-sm flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                  {selectedRecord.site?.name || 'Unknown Site'}
                </p>
                {selectedRecord.site?.address && (
                  <p className="text-[11px] text-slate-600">{selectedRecord.site.address}</p>
                )}
                {selectedRecord.site?.manager?.name && (
                  <p className="text-[11px] text-slate-700 font-medium">
                    Site Manager: <span className="font-bold">{selectedRecord.site.manager.name}</span>
                    {selectedRecord.site.manager.phone ? ` (${selectedRecord.site.manager.phone})` : ''}
                  </p>
                )}
                <div className="pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                  <span>Logged by: </span>
                  <span className="font-bold text-slate-800">
                    {selectedRecord.creator?.name || selectedRecord.createdBy || 'System'}
                  </span>
                  {selectedRecord.creator?.role && (
                    <span className="font-mono text-[10px] text-slate-400 ml-1">
                      ({selectedRecord.creator.role === 'A' ? 'Admin' : selectedRecord.creator.role === 'M' ? 'Manager' : 'Employee'})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* GPS & Timestamp card */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 block">
                  Exact GPS Coordinates
                </span>
                <p className="font-mono text-xs font-bold text-slate-900 mt-0.5">
                  Lat: {selectedRecord.latitude} | Long: {selectedRecord.longitude}
                </p>
              </div>

              <div className="text-right sm:text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Timestamp
                </span>
                <p className="font-semibold text-slate-800 text-xs">
                  {formatDate(selectedRecord.createdAt)}, {formatTime(selectedRecord.createdAt)}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ════════════════════ DELETE CONFIRMATION MODAL ════════════════════ */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Progress Log"
        description="Are you sure you want to remove this site progress record?"
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteConfirm}>
              Yes, Delete Record
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-600">
          This progress photo for site{' '}
          <strong className="text-slate-900">{selectedRecord?.site?.name}</strong> taken on{' '}
          <strong className="text-slate-900">{formatDate(selectedRecord?.createdAt)}</strong> will be
          archived or deleted.
        </p>
      </Modal>
    </div>
  );
}
