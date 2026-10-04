'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Briefcase,
  ArrowLeft,
  Building2,
  HardHat,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Save,
  Clock,
  FileSpreadsheet,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import TenderIdSuggest from '@/components/projects/TenderIdSuggest';
import { useToast } from '@/components/providers/ToastProvider';
import { PROJECT_TYPES } from '@/lib/project-types';

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

export default function NewProjectPage() {
  const router = useRouter();
  const toast = useToast();

  // Reference options
  const [departments, setDepartments] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: PROJECT_TYPES[0],
    status: 'PLANNING',
    department: '',
    contractor: '', // Will hold Contractor.id
    progress: 0,
    tenderId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    budget: '',
    bOQs: '',
  });

  const [formErrors, setFormErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load departments and contractors
  const loadOptions = useCallback(async () => {
    setIsLoadingOptions(true);
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

      if (deptJson.success && deptJson.data) {
        setDepartments(deptJson.data);
        if (deptJson.data.length > 0 && !formData.department) {
          setFormData((prev) => ({ ...prev, department: deptJson.data[0].id }));
        }
      }

      if (contJson.success && contJson.data) {
        setContractors(contJson.data);
      }
    } catch (err) {
      console.error('Failed to load project options:', err);
      setGeneralError('Failed to load department or contractor lists. Please refresh.');
    } finally {
      setIsLoadingOptions(false);
    }
  }, [formData.department]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Form Validation
  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Project name is required.';
    if (!formData.department) errors.department = 'Please select an assigning department.';
    if (!formData.startDate) errors.startDate = 'Start date is required.';
    if (!formData.endDate) errors.endDate = 'End date is required.';

    if (formData.startDate && formData.endDate) {
      const s = new Date(formData.startDate);
      const e = new Date(formData.endDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        errors.endDate = 'Invalid date format.';
      } else if (s >= e) {
        errors.endDate = 'Start date must be strictly before end date.';
      }
    }

    const prog = Number(formData.progress);
    if (isNaN(prog) || prog < 0 || prog > 100) {
      errors.progress = 'Progress must be between 0 and 100.';
    }

    if (formData.budget !== '') {
      const b = parseFloat(formData.budget);
      if (isNaN(b) || b < 0) {
        errors.budget = 'Budget must be a positive number.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');

    if (!validateForm()) {
      setGeneralError('Please correct all validation errors highlighted below.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        type: formData.type || undefined,
        status: formData.status || 'PLANNING',
        department: formData.department,
        contractor: formData.contractor ? formData.contractor.trim() : undefined, // Strictly Contractor.id
        progress: Number(formData.progress),
        tenderId: formData.tenderId.trim() || undefined,
        startDate: formData.startDate,
        endDate: formData.endDate,
        budget: formData.budget !== '' ? parseFloat(formData.budget) : undefined,
        bOQs: formData.bOQs.trim() || undefined,
      };

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        toast.success(`Project "${formData.name.trim()}" created successfully.`);
        router.push('/projects');
      } else {
        const err = json.message || 'Failed to create project.';
        setGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Create project submission error:', err);
      setGeneralError('Network error while saving project.');
      toast.error('Network error while saving project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header with back button */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Create New Tender Project
            </h1>
            <p className="text-xs text-slate-500">
              Register project scope, department division, contractor partner, and operational schedule.
            </p>
          </div>
        </div>

        <Link href="/projects">
          <Button variant="outline" size="sm">
            Cancel
          </Button>
        </Link>
      </div>

      {/* General Error Banner */}
      {generalError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-900 shadow-sm animate-in fade-in">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Main Creation Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Identification & Classification */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-sky-600" />
              Project Identity & Scope
            </CardTitle>
            <CardDescription className="text-xs">
              Primary project nomenclature, tender bid references, and classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Project Name */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Project Title / Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. District Hospital, Block B"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`block w-full rounded-xl border ${
                    formErrors.name ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                  } bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.name}</p>
                )}
              </div>

              {/* Tender ID */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Tender Reference ID
                </label>
                <TenderIdSuggest
                  value={formData.tenderId}
                  onChange={(tenderId) => setFormData((current) => ({ ...current, tenderId }))}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                />
                <p className="mt-1 text-[11px] text-slate-500">Suggestions come from saved tenders marked Win.</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Project Scope & Technical Description
              </label>
              <textarea
                rows={3}
                placeholder="Scope of work, specifications, key quantities and site conditions…"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Project Domain / Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Initial Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  {PROJECT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Department & Contractor Assignment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-600" />
              Organizational & Partner Allocation
            </CardTitle>
            <CardDescription className="text-xs">
              Assign internal overseeing department and partner contracting company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Department Dropdown */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Responsible Department <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className={`block w-full rounded-xl border ${
                    formErrors.department ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                  } bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                >
                  <option value="">-- Choose Overseeing Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {formErrors.department && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.department}</p>
                )}
              </div>

              {/* Contractor Dropdown (Loaded from /api/contractors, displays Contractor.name, saves Contractor.id) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Partner Contractor (Optional)
                </label>
                <select
                  value={formData.contractor}
                  onChange={(e) => setFormData({ ...formData, contractor: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="">-- No Contractor Assigned Yet --</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phoneNo ? `(${c.phoneNo})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Selects from registered contractors. Saves Contractor.id into Project.contractor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Schedule, Budget & Progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" />
              Execution Schedule & Financials
            </CardTitle>
            <CardDescription className="text-xs">
              Project calendar deadlines, financial budget, and initial progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Start Date */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className={`block w-full rounded-xl border ${
                    formErrors.startDate ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                  } bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                />
                {formErrors.startDate && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.startDate}</p>
                )}
              </div>

              {/* End Date */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Estimated End Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className={`block w-full rounded-xl border ${
                    formErrors.endDate ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                  } bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                />
                {formErrors.endDate && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.endDate}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Budget */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Total Budget Allocation (INR)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 25000000"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.budget ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white pl-8 pr-4 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono`}
                  />
                </div>
                {formErrors.budget && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.budget}</p>
                )}
              </div>

              {/* Progress Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Initial Progress
                  </label>
                  <span className="font-bold text-sm text-sky-600">{formData.progress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.progress}
                  onChange={(e) => setFormData({ ...formData, progress: Number(e.target.value) })}
                  className="block w-full accent-sky-600 h-2 bg-slate-200 rounded-lg cursor-pointer mt-3"
                />
              </div>
            </div>

            {/* BOQs */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                BOQs Document Identifier
              </label>
              <input
                type="text"
                placeholder="e.g. BOQ-2026-PPT-01, Bill of Quantities schedule"
                value={formData.bOQs}
                onChange={(e) => setFormData({ ...formData, bOQs: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/projects">
            <Button variant="outline" size="md" disabled={isSubmitting}>
              Cancel
            </Button>
          </Link>
          <Button variant="primary" size="md" type="submit" isLoading={isSubmitting}>
            <Save className="h-4 w-4 mr-1.5" />
            <span>Create & Register Project</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
