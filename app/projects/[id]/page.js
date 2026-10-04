'use client';

import { useState, useEffect, useCallback, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  ArrowLeft,
  Building2,
  HardHat,
  Calendar,
  IndianRupee,
  TrendingUp,
  MapPin,
  FileSpreadsheet,
  Clock,
  Pencil,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Phone,
  User,
  ExternalLink,
  ShieldCheck,
  Layers,
  FileText,
  AlertTriangle,
  ChevronRight,
  Info,
  X,
  Copy,
  Check,
  Compass,
  Mail,
  Award,
  CircleDot,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { isSafeResourceUrl } from '@/lib/security';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import TenderIdSuggest from '@/components/projects/TenderIdSuggest';
import Modal from '@/components/ui/Modal';
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

export default function ProjectDetailsPage({ params }) {
  // In Next.js 15 App Router, params is a Promise
  const resolvedParams = use(params);
  const projectId = resolvedParams?.id;

  const router = useRouter();
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'A' || user?.role === 'M';

  // Core Project & Related States
  const [project, setProject] = useState(null);
  const [resolvedContractor, setResolvedContractor] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedField, setCopiedField] = useState('');

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    type: '',
    status: '',
    department: '',
    contractor: '',
    progress: 0,
    tenderId: '',
    startDate: '',
    endDate: '',
    budget: '',
    bOQs: '',
  });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [editFormGeneralError, setEditFormGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-dismiss success messages
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Copy helper
  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(''), 2500);
  };

  // Formatters
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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Timeline analysis calculation
  const timelineDetails = useMemo(() => {
    if (!project?.startDate || !project?.endDate) {
      return {
        duration: '—',
        totalDays: 0,
        elapsedDays: 0,
        remainingDays: null,
        statusText: 'Timeline not specified',
        statusColor: 'bg-slate-100 text-slate-700 border-slate-200',
        elapsedPercent: 0,
      };
    }

    const start = new Date(project.startDate);
    const end = new Date(project.endDate);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return {
        duration: '—',
        totalDays: 0,
        elapsedDays: 0,
        remainingDays: null,
        statusText: 'Invalid schedule dates',
        statusColor: 'bg-rose-50 text-rose-700 border-rose-200',
        elapsedPercent: 0,
      };
    }

    const totalMs = end.getTime() - start.getTime();
    const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));
    const elapsedMs = now.getTime() - start.getTime();
    const elapsedDays = Math.ceil(elapsedMs / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    let elapsedPercent = 0;
    let statusText = 'Scheduled';
    let statusColor = 'bg-amber-50 text-amber-700 border-amber-200';

    if (now < start) {
      elapsedPercent = 0;
      statusText = `Commencing in ${Math.abs(elapsedDays)} days`;
      statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (now > end) {
      elapsedPercent = 100;
      statusText = `Schedule window ended (${Math.abs(remainingDays)} days ago)`;
      statusColor = 'bg-rose-50 text-rose-700 border-rose-200';
    } else {
      elapsedPercent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
      statusText = `On Schedule (${remainingDays} days remaining)`;
      statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }

    const months = Math.floor(totalDays / 30);
    const remainingDaysInMonth = totalDays % 30;
    const duration =
      months > 0
        ? `${totalDays} calendar days (~${months} mo${remainingDaysInMonth > 0 ? ` ${remainingDaysInMonth}d` : ''})`
        : `${totalDays} calendar days`;

    return {
      duration,
      totalDays,
      elapsedDays,
      remainingDays,
      statusText,
      statusColor,
      elapsedPercent,
    };
  }, [project?.startDate, project?.endDate]);

  // Helper for Status Badge with rich styling
  const renderStatusBadge = (status) => {
    const s = status?.toUpperCase();
    switch (s) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-300/80 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Active Execution
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-700 border border-sky-300/80 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
            In Progress
          </span>
        );
      case 'PLANNING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-300/80 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Planning Phase
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-300/80 shadow-2xs">
            <CheckCircle2 className="h-3 w-3 text-indigo-600" />
            Completed & Commissioned
          </span>
        );
      case 'ON_HOLD':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 border border-slate-300 shadow-2xs">
            <CircleDot className="h-2 w-2 text-slate-500" />
            On Hold
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-300/80 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
            {status || 'Unknown Status'}
          </span>
        );
    }
  };

  // Fetch Project Details and load Contractor using Project.contractor → Contractor.id
  const fetchProjectDetails = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        const projData = json.data;
        setProject(projData);

        // Load contractor using Project.contractor → Contractor.id
        const directContractorRel = projData.contractorRel || (typeof projData.contractor === 'object' ? projData.contractor : null);
        const contractorId = projData.contractorId || (typeof projData.contractor === 'string' ? projData.contractor : directContractorRel?.id);

        if (directContractorRel) {
          setResolvedContractor(directContractorRel);
        } else if (contractorId) {
          // If contractorId exists but relation wasn't populated, fetch directly via Contractor.id
          try {
            const contractorRes = await fetch(`/api/contractors/${contractorId}`, {
              headers: getAuthHeaders(),
            });
            const contractorJson = await contractorRes.json();
            if (contractorRes.ok && contractorJson.success) {
              setResolvedContractor(contractorJson.data);
            } else {
              setResolvedContractor(null);
            }
          } catch (cErr) {
            console.warn('Failed to load contractor by Contractor.id:', cErr);
            setResolvedContractor(null);
          }
        } else {
          setResolvedContractor(null);
        }
      } else {
        setErrorMessage(json.message || 'Project not found or failed to load.');
      }
    } catch (err) {
      console.error('Fetch project details error:', err);
      setErrorMessage('Network connection error while retrieving project details.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load auxiliary options for edit modal
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [deptRes, contRes] = await Promise.all([
        fetch('/api/departments', { headers }),
        fetch('/api/contractors?limit=100', { headers }),
      ]);
      const [deptJson, contJson] = await Promise.all([
        deptRes.json(),
        contRes.json(),
      ]);
      if (deptJson.success) setDepartments(deptJson.data || []);
      if (contJson.success) setContractors(contJson.data || []);
    } catch (err) {
      console.error('Failed to load auxiliary options:', err);
    }
  }, []);

  useEffect(() => {
    fetchProjectDetails();
    fetchAuxiliaryData();
  }, [fetchProjectDetails, fetchAuxiliaryData]);

  // Open Edit Modal with Prepopulated data
  const openEditModal = () => {
    if (!project) return;
    setEditFormData({
      name: project.name || '',
      description: project.description || '',
      type: project.type || '',
      status: project.status || 'ACTIVE',
      department: project.departmentId || project.department?.id || '',
      contractor: project.contractorId || (typeof project.contractor === 'string' ? project.contractor : project.contractor?.id) || '',
      progress: project.progress !== null && project.progress !== undefined ? project.progress : 0,
      tenderId: project.tenderId || '',
      startDate: formatDateForInput(project.startDate),
      endDate: formatDateForInput(project.endDate),
      budget: project.budget !== null && project.budget !== undefined ? String(project.budget) : '',
      bOQs: project.bOQs || '',
    });
    setEditFormErrors({});
    setEditFormGeneralError('');
    setIsEditModalOpen(true);
  };

  // Submit Edit Project
  const handleEditSubmit = async (e) => {
    e.preventDefault();
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
        contractor: editFormData.contractor ? editFormData.contractor.trim() : null, // Saves Contractor.id into Project.contractor
        progress: prog,
        tenderId: editFormData.tenderId.trim() || null,
        startDate: editFormData.startDate,
        endDate: editFormData.endDate,
        budget: editFormData.budget !== '' ? parseFloat(editFormData.budget) : null,
        bOQs: editFormData.bOQs.trim() || null,
      };

      const res = await fetch(`/api/projects/${projectId}`, {
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
        setSuccessMessage('Project details updated successfully.');
        fetchProjectDetails();
      } else {
        setEditFormGeneralError(json.message || 'Failed to update project.');
      }
    } catch (err) {
      console.error('Update project error:', err);
      setEditFormGeneralError('Network error while saving project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <RefreshCw className="h-9 w-9 animate-spin text-sky-600" />
        <div className="text-center">
          <h3 className="text-base font-semibold text-slate-800">Loading Project Dossier</h3>
          <p className="text-xs text-slate-500 mt-1">Retrieving complete project details and contractor relationships...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !project) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Project Record Not Found</h2>
        <p className="text-sm text-slate-500">
          {errorMessage || 'The requested project could not be found or has been removed from the system.'}
        </p>
        <div className="pt-2">
          <Link href="/projects">
            <Button variant="primary" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              <span>Back to Projects Directory</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const prog = project.progress !== null && project.progress !== undefined ? project.progress : 0;

  // Milestone stages definition for Section 6 Progress
  const milestones = [
    { name: 'Phase 1: Planning & Pre-Tender', target: 25, range: '0% - 25%', desc: 'Tender scoping, budget approval, and specification sign-off' },
    { name: 'Phase 2: Mobilization & Procurement', target: 50, range: '26% - 50%', desc: 'Equipment mobilization, contractor staging, and site setup' },
    { name: 'Phase 3: Execution & Construction', target: 75, range: '51% - 75%', desc: 'Site work, civil works and installation' },
    { name: 'Phase 4: Inspection & Commissioning', target: 100, range: '76% - 100%', desc: 'Quality audit, bathymetric validation, and handover' },
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div className="flex items-start gap-3">
          <Link
            href="/projects"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs mt-0.5"
            title="Return to Projects Directory"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400">
              <Link href="/projects" className="hover:text-sky-600 transition">
                Projects
              </Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-mono text-slate-600">
                {project.tenderId || project.id.substring(0, 8)}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl mt-1">
              {project.name}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProjectDetails}
            isLoading={isLoading}
            title="Reload latest project data"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            <span>Refresh</span>
          </Button>

          {isManagerOrAdmin && (
            <Button variant="primary" size="sm" onClick={openEditModal}>
              <Pencil className="h-4 w-4 mr-1.5" />
              <span>Edit Project</span>
            </Button>
          )}
        </div>
      </div>

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
            aria-label="Dismiss alert"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Overview Banner: Status, Classification, Budget & Progress */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-md">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Project Status Badge */}
              {renderStatusBadge(project.status)}

              {project.type && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200 border border-slate-700 shadow-xs">
                  <Layers className="h-3.5 w-3.5 text-sky-400" />
                  {project.type}
                </span>
              )}

              {project.tenderId && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-mono font-medium text-sky-300 border border-slate-700 shadow-xs">
                  Tender: {project.tenderId}
                </span>
              )}
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              {project.description || 'No formal scope narrative recorded for this tender project.'}
            </p>
          </div>

          <div className="flex items-center gap-6 border-t lg:border-t-0 lg:border-l border-slate-700/80 pt-4 lg:pt-0 lg:pl-8 shrink-0 w-full lg:w-auto justify-between lg:justify-end">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Allocated Budget
              </span>
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {formatCurrency(project.budget)}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Current Progress
              </span>
              <span className="text-2xl font-bold font-mono text-sky-400">
                {prog}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 8 SECTIONS ORDERED PRECISELY:                                             */}
      {/* 1. Project Information                                                    */}
      {/* 2. Department                                                             */}
      {/* 3. Contractor (Loaded using Project.contractor → Contractor.id)            */}
      {/* 4. Timeline                                                               */}
      {/* 5. Budget                                                                 */}
      {/* 6. Progress (With Visual Progress Bar)                                    */}
      {/* 7. Sites                                                                  */}
      {/* 8. BOQs                                                                   */}
      {/* ========================================================================= */}

      {/* Row 1: Section 1 (Project Information) & Section 2 (Department) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1: Project Information */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <Briefcase className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900">1. Project Information</CardTitle>
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Identity & Scope</span>
            </div>
            <CardDescription className="text-xs">
              Core system registry attributes, status badges, and project classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-xs flex-1">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Project Name:</span>
              <span className="font-bold text-slate-900 text-right text-sm">{project.name}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Project Status:</span>
              <div>{renderStatusBadge(project.status)}</div>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Tender Reference ID:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                  {project.tenderId || '—'}
                </span>
                {project.tenderId && (
                  <button
                    onClick={() => copyToClipboard(project.tenderId, 'tenderId')}
                    className="text-slate-400 hover:text-sky-600 transition p-1"
                    title="Copy Tender ID"
                  >
                    {copiedField === 'tenderId' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Domain Classification:</span>
              <span className="font-semibold text-slate-800">{project.type || 'Standard Works'}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Database Entity ID:</span>
              <span className="font-mono text-[11px] text-slate-500 truncate max-w-[200px]" title={project.id}>
                {project.id}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Registered On:</span>
              <span className="text-slate-700 font-medium">{formatDateDisplay(project.createdAt)}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Last Modified:</span>
              <span className="text-slate-700 font-medium">{formatDateDisplay(project.updatedAt)}</span>
            </div>

            <div className="pt-2">
              <span className="text-slate-500 font-medium block mb-1.5">Project Scope Summary:</span>
              <p className="text-slate-700 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 leading-relaxed text-xs">
                {project.description || 'No detailed scope summary recorded for this project.'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: Department */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <Building2 className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900">2. Department</CardTitle>
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Internal Governance</span>
            </div>
            <CardDescription className="text-xs">
              Internal organizational unit accountable for oversight, staffing, and deliverables.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs flex-1">
            {project.departmentRel ? (
              <div className="space-y-3.5">
                <div className="flex items-start gap-3.5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-base shadow-xs">
                    {project.departmentRel.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{project.departmentRel.name}</h4>
                      <span className="inline-flex items-center rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                        Assigned
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Dept ID: {project.departmentRel.id}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold block">
                    Department Mandate & Description
                  </span>
                  <p className="text-slate-700 leading-relaxed">
                    {project.departmentRel.description || 'No detailed mandate description registered for this department.'}
                  </p>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-slate-100 text-slate-600">
                  <span className="font-medium">Head of Department (HOD):</span>
                  <span className="font-semibold text-slate-900">
                    {project.departmentRel.HOD ? project.departmentRel.HOD : 'Not assigned'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-slate-100 text-slate-600">
                  <span className="font-medium">Department Created:</span>
                  <span className="text-slate-700">
                    {formatDateDisplay(project.departmentRel.createdAt)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
                <Building2 className="h-8 w-8 text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700 text-sm">No Department Assigned</p>
                <p className="text-slate-400 text-xs mt-1 max-w-xs">
                  This project is currently not associated with an internal department.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Section 3 (Contractor) & Section 4 (Timeline) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 3: Contractor (Loaded using: Project.contractor → Contractor.id) */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <HardHat className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900">3. Contractor</CardTitle>
              </div>
              <span className="text-[11px] font-mono font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Project.contractor → Contractor.id
              </span>
            </div>
            <CardDescription className="text-xs">
              Primary external contracting firm loaded using the relational key Project.contractor → Contractor.id.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs flex-1">
            {resolvedContractor ? (
              <div className="space-y-3.5">
                {/* Contractor Name */}
                <div className="flex items-start gap-3.5 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white font-bold text-base shadow-xs">
                    {resolvedContractor.name ? resolvedContractor.name.charAt(0).toUpperCase() : 'C'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider block">
                          Contractor Name
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 truncate">{resolvedContractor.name}</h4>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="h-3 w-3" />
                        Verified Partner
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono mt-1">
                      Contractor.id: {resolvedContractor.id}
                    </p>
                  </div>
                </div>

                {/* Phone */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                    <Phone className="h-3 w-3 text-sky-600" /> Phone
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {resolvedContractor.phoneNo || resolvedContractor.phone || 'No phone number registered'}
                    </span>
                    {(resolvedContractor.phoneNo || resolvedContractor.phone) && (
                      <a
                        href={`tel:${resolvedContractor.phoneNo || resolvedContractor.phone}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition"
                      >
                        <Phone className="h-3 w-3" />
                        <span>Call</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Description & Scope Capability
                  </span>
                  <p className="text-slate-700 leading-relaxed text-xs">
                    {resolvedContractor.description || 'No specialization description recorded on file for this contractor.'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400 border-t border-slate-100">
                  <span>Contractor Member Since:</span>
                  <span className="text-slate-600 font-medium">
                    {formatDateDisplay(resolvedContractor.createdAt)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
                <HardHat className="h-8 w-8 text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700 text-sm">No Contractor Assigned</p>
                <p className="text-slate-400 text-xs mt-1 max-w-xs">
                  This project has no external contractor linked. Assign a contractor from the Contractors directory.
                </p>
                {isManagerOrAdmin && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={openEditModal}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Assign Contractor
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 4: Timeline */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Calendar className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900">4. Timeline</CardTitle>
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${timelineDetails.statusColor}`}>
                {timelineDetails.statusText}
              </span>
            </div>
            <CardDescription className="text-xs">
              Project contract schedule dates, operational duration, and timeline metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs flex-1">
            {/* Start and End Date Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-sky-600" /> Start Date
                </span>
                <span className="font-bold text-sm text-slate-900 block">
                  {formatDateDisplay(project.startDate)}
                </span>
                <span className="text-[11px] text-slate-400">Scheduled Commencement</span>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <Clock className="h-3 w-3 text-emerald-600" /> End Date
                </span>
                <span className="font-bold text-sm text-slate-900 block">
                  {formatDateDisplay(project.endDate)}
                </span>
                <span className="text-[11px] text-slate-400">Target Completion</span>
              </div>
            </div>

            {/* Total Duration Details */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Calculated Project Window:</span>
                <span className="font-bold text-slate-900 text-sm">{timelineDetails.duration}</span>
              </div>

              {/* Mini Timeline Elapsed Track */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Schedule Timeline Elapsed</span>
                  <span className="font-semibold text-slate-800">{timelineDetails.elapsedPercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${timelineDetails.elapsedPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-slate-100 text-slate-500">
              <span>Days Elapsed:</span>
              <span className="font-mono font-semibold text-slate-800">
                {timelineDetails.elapsedDays > 0 ? `${timelineDetails.elapsedDays} days` : '0 days (Not started)'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-slate-100 text-slate-500">
              <span>Days Remaining:</span>
              <span className="font-mono font-semibold text-slate-800">
                {timelineDetails.remainingDays !== null ? `${timelineDetails.remainingDays} days` : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Section 5 (Budget) & Section 6 (Progress) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 5: Budget */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <IndianRupee className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900">5. Budget</CardTitle>
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Financial Allocation</span>
            </div>
            <CardDescription className="text-xs">
              Contract financial resources, total approved allocation cap, and accounting metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs flex-1">
            {/* Main Budget Display Card */}
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                    Total Allocated Budget Cap
                  </span>
                  <span className="text-2xl font-extrabold font-mono text-emerald-700 mt-1 block">
                    {formatCurrency(project.budget)}
                  </span>
                </div>
                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800">
                  INR (₹)
                </span>
              </div>
              <p className="text-[11px] text-emerald-700/90 mt-2">
                Approved spending limit for materials, equipment hire and contract work.
              </p>
            </div>

            {/* Financial Breakdown Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Est. Daily Allowance
                </span>
                <span className="font-mono font-bold text-sm text-slate-800">
                  {project.budget && timelineDetails.totalDays > 0
                    ? formatCurrency(Math.round(project.budget / timelineDetails.totalDays)) + ' / day'
                    : '—'}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Est. Monthly Run-Rate
                </span>
                <span className="font-mono font-bold text-sm text-slate-800">
                  {project.budget && timelineDetails.totalDays > 0
                    ? formatCurrency(Math.round(project.budget / (timelineDetails.totalDays / 30))) + ' / mo'
                    : '—'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between py-1.5 border-t border-slate-100 text-slate-500">
              <span>Financial Status:</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Capital Allocation Approved
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-t border-slate-100 text-slate-500">
              <span>Disbursement Currency:</span>
              <span className="font-mono font-semibold text-slate-800">Indian Rupee (₹)</span>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 6: Progress (With Visual Project Progress Bar) */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900">6. Progress</CardTitle>
              </div>
              <span className="text-sm font-mono font-extrabold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
                {prog}% Completed
              </span>
            </div>
            <CardDescription className="text-xs">
              Visual project milestone tracking and field execution progress bar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs flex-1">
            {/* VISUAL PROJECT PROGRESS BAR */}
            <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5 text-sky-600" />
                  Engineering Execution Progress
                </span>
                <span className="font-mono font-extrabold text-sky-600">{prog}%</span>
              </div>

              {/* Visual Progress Bar Track */}
              <div className="relative h-4 w-full rounded-full bg-slate-200/90 overflow-hidden p-0.5 shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${
                    prog >= 100
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                      : prog >= 75
                      ? 'bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500'
                      : prog >= 50
                      ? 'bg-gradient-to-r from-sky-500 to-indigo-500'
                      : prog >= 25
                      ? 'bg-gradient-to-r from-amber-500 to-sky-500'
                      : 'bg-gradient-to-r from-amber-400 to-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, prog))}%` }}
                />
              </div>

              {/* Progress Milestones Markers */}
              <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-1">
                <span>0% Start</span>
                <span>25% Plan</span>
                <span>50% Mobilize</span>
                <span>75% Execute</span>
                <span>100% Commission</span>
              </div>
            </div>

            {/* Detailed Stage Cards */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {milestones.map((m, idx) => {
                const isPassed = prog >= m.target;
                const isCurrent = prog < m.target && (idx === 0 || prog >= milestones[idx - 1].target);
                return (
                  <div
                    key={m.name}
                    className={`rounded-xl p-2.5 border transition-all ${
                      isPassed
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                        : isCurrent
                        ? 'bg-sky-50/80 border-sky-300 ring-1 ring-sky-300 text-sky-900'
                        : 'bg-slate-50/50 border-slate-100 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] truncate">{m.name.split(':')[0]}</span>
                      {isPassed ? (
                        <CheckCircle className="h-3 w-3 text-emerald-600 shrink-0" />
                      ) : (
                        <span className="text-[10px] font-mono font-semibold">{m.range}</span>
                      )}
                    </div>
                    <p className="text-[10px] mt-1 leading-tight line-clamp-2 text-slate-600">
                      {m.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Section 7 (Sites) */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                <MapPin className="h-4 w-4" />
              </div>
              <CardTitle className="text-base font-bold text-slate-900">
                7. Sites ({project.sites?.length || 0})
              </CardTitle>
            </div>
            <span className="text-xs font-semibold text-slate-500">Field Operational Locations</span>
          </div>
          <CardDescription className="text-xs">
            Work sites linked to this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-xs">
          {project.sites && project.sites.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {project.sites.map((site) => (
                <div
                  key={site.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5 hover:border-slate-300 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-bold text-sm text-slate-900 truncate">{site.name}</h5>
                    <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 border border-sky-100 shrink-0">
                      {site.status || 'Active Site'}
                    </span>
                  </div>

                  <p className="text-slate-600 flex items-start gap-1.5 text-xs">
                    <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <span className="leading-snug">{site.address || 'No physical address registered'}</span>
                  </p>

                  {site.coordinates && (
                    <p className="text-slate-500 flex items-center gap-1.5 text-[11px] font-mono">
                      <Compass className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>GPS: {site.coordinates}</span>
                    </p>
                  )}

                  {site.manager && (
                    <div className="border-t border-slate-100 pt-2.5 text-[11px] space-y-0.5">
                      <span className="block text-slate-400 text-[10px] uppercase font-bold">
                        Site Manager
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{site.manager.name}</span>
                        {site.manager.employeeCode && (
                          <span className="font-mono text-slate-400 text-[10px]">
                            {site.manager.employeeCode}
                          </span>
                        )}
                      </div>
                      {site.manager.phone && (
                        <p className="text-slate-500 font-mono flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-400" />
                          <span>{site.manager.phone}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
              <MapPin className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 text-sm">No Operational Sites Mapped</p>
              <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                No sites are linked to this project yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 5: Section 8 (BOQs) */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <CardTitle className="text-base font-bold text-slate-900">
                8. BOQs ({project.boqRecords?.length || (project.bOQs ? 1 : 0)})
              </CardTitle>
            </div>
            <span className="text-xs font-semibold text-slate-500">Bill of Quantities & Materials</span>
          </div>
          <CardDescription className="text-xs">
            Material quantification schedules, estimation documents, and contract rate analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-xs">
          {project.bOQs || (project.boqRecords && project.boqRecords.length > 0) ? (
            <div className="space-y-4">
              {/* Primary BOQ string code */}
              {project.bOQs && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                        Primary BOQ Reference Code
                      </span>
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {project.bOQs}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                    Active Schedule
                  </span>
                </div>
              )}

              {/* Linked Database BOQs */}
              {project.boqRecords && project.boqRecords.length > 0 && (
                <div className="space-y-2.5">
                  <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold block">
                    Detailed BOQ Records in Database
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {project.boqRecords.map((boq) => (
                      <div
                        key={boq.id}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 hover:border-slate-300 transition"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {boq.boqCode || 'BOQ Record'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDateDisplay(boq.createdAt)}
                          </span>
                        </div>

                        {boq.docsLinks && isSafeResourceUrl(boq.docsLinks) && (
                          <div className="pt-1">
                            <a
                              href={boq.docsLinks}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-medium truncate max-w-full text-xs"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">{boq.docsLinks}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
              <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 text-sm">No BOQ Schedules Registered</p>
              <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                No bill of quantities or estimation schedules are attached to this project record.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================= EDIT PROJECT MODAL ================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Project Details"
        description={`Update project scope, partner contractor, schedule, and budget for ${project.name}`}
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
              Save Changes
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
            {/* Department */}
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
            </div>

            {/* Contractor (Saves Contractor.id into Project.contractor) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Partner Contractor (Project.contractor → Contractor.id)
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
                Saves selected Contractor.id into Project.contractor.
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
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
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
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
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

            {/* BOQs */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                BOQs Document Code
              </label>
              <textarea
                rows={2}
                value={editFormData.bOQs}
                onChange={(e) => setEditFormData({ ...editFormData, bOQs: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
