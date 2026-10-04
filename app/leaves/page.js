'use client';


import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  Check,
  XCircle,
  CheckCircle,
  Filter,
  User,
  Building2,
  FileText,
  AlertTriangle,
  Send,
  ShieldCheck,
  Copy,
  Layers,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
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

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function LeavesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isEmployee = user?.role === 'E';
  const isManagerOrAdmin = user?.role === 'A' || user?.role === 'M';
  const isAdmin = user?.role === 'A';

  // Active Tab Filter: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'
  const [activeTab, setActiveTab] = useState('PENDING');

  // Core Data States
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  // Alerts & Notifications
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modals state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Active / Selected Leave
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formGeneralError, setFormGeneralError] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Request Leave Form Data
  const [requestFormData, setRequestFormData] = useState({
    employeeId: '',
    leaveDate: '',
    duration: '1',
    reason: '',
  });

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

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

  // Fetch Employees for Managers/Admins dropdown
  const fetchEmployees = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    try {
      const res = await fetch('/api/employees?limit=100', {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setEmployees(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load employees for leave dropdown:', err);
    }
  }, [isManagerOrAdmin]);

  // Fetch Leave Requests
  const fetchLeaves = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      if (activeTab !== 'ALL') {
        params.append('status', activeTab);
      }

      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedDate) params.append('date', selectedDate);
      if (isManagerOrAdmin && selectedEmployee.trim()) {
        params.append('employeeId', selectedEmployee.trim());
      }
      if (showInactive && isAdmin) params.append('includeInactive', 'true');

      const res = await fetch(`/api/leaves?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setLeaves(json.data || []);
        if (json.pagination) {
          setTotalRecords(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        }
      } else {
        setErrorMessage(json.message || 'Failed to retrieve leave requests.');
      }
    } catch (err) {
      console.error('Fetch leaves error:', err);
      setErrorMessage('Network error while retrieving leave requests.');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, activeTab, searchQuery, selectedDate, selectedEmployee, isManagerOrAdmin, showInactive, isAdmin]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Tab Badge Counts
  const [tabCounts, setTabCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: 0 });

  const fetchTabCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/leaves?limit=all', {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const all = json.data || [];
        const pending = all.filter((l) => l.status === 'PENDING').length;
        const approved = all.filter((l) => l.status === 'APPROVED').length;
        const rejected = all.filter((l) => l.status === 'REJECTED').length;
        setTabCounts({ PENDING: pending, APPROVED: approved, REJECTED: rejected, ALL: all.length });
      }
    } catch (e) {
      console.error('Failed to calculate tab counts:', e);
    }
  }, []);

  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts, leaves]);

  // Status Badge Formatter
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200 shadow-2xs">
            <Clock className="h-3 w-3 text-amber-600 animate-pulse" />
            Pending Decision
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 shadow-2xs">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200 shadow-2xs">
            <XCircle className="h-3.5 w-3.5 text-rose-600" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {status}
          </span>
        );
    }
  };

  // Open Request Modal
  const openRequestModal = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    setRequestFormData({
      employeeId: user?.id || '',
      leaveDate: formatDateForInput(tomorrow),
      duration: '1',
      reason: '',
    });
    setFormErrors({});
    setFormGeneralError('');
    setIsRequestModalOpen(true);
  };

  // Open Approve Modal
  const openApproveModal = (leave) => {
    setSelectedLeave(leave);
    setIsApproveModalOpen(true);
  };

  // Open Reject Modal
  const openRejectModal = (leave) => {
    setSelectedLeave(leave);
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  // Open View Modal
  const openViewModal = (leave) => {
    setSelectedLeave(leave);
    setIsViewModalOpen(true);
  };

  // Open Delete / Cancel Modal
  const openDeleteModal = (leave) => {
    setSelectedLeave(leave);
    setIsDeleteModalOpen(true);
  };

  // Submit Leave Request
  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setFormGeneralError('');

    const errors = {};
    if (!requestFormData.leaveDate) errors.leaveDate = 'Leave date is required.';
    if (!requestFormData.reason.trim()) errors.reason = 'Please explain the reason for this leave request.';
    const dur = parseFloat(requestFormData.duration);
    if (isNaN(dur) || dur <= 0) errors.duration = 'Duration must be greater than 0.';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        employeeId: isManagerOrAdmin && requestFormData.employeeId ? requestFormData.employeeId : user?.id,
        leaveDate: requestFormData.leaveDate,
        duration: dur,
        reason: requestFormData.reason.trim(),
      };

      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsRequestModalOpen(false);
        setSuccessMessage('Leave request submitted successfully. Pending manager review.');
        toast.success('Leave request submitted successfully. Pending manager review.');
        fetchLeaves();
      } else {
        const err = json.message || 'Failed to submit leave request.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Request leave error:', err);
      setFormGeneralError('Network error while submitting leave request.');
      toast.error('Network error while submitting leave request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Approve Action
  const handleApproveConfirm = async () => {
    if (!selectedLeave) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/leaves/${selectedLeave.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ approved: true }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsApproveModalOpen(false);
        const msg = `Leave request for "${selectedLeave.employee?.name || 'Employee'}" has been Approved.`;
        setSuccessMessage(msg);
        toast.success(msg);
        fetchLeaves();
      } else {
        const err = json.message || 'Failed to approve leave request.';
        setErrorMessage(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Approve leave error:', err);
      setErrorMessage('Network error while approving leave request.');
      toast.error('Network error while approving leave request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reject Action
  const handleRejectConfirm = async () => {
    if (!selectedLeave) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/leaves/${selectedLeave.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          approved: false,
          rejectionReason: rejectionReason.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsRejectModalOpen(false);
        const msg = `Leave request for "${selectedLeave.employee?.name || 'Employee'}" has been Rejected.`;
        setSuccessMessage(msg);
        toast.success(msg);
        fetchLeaves();
      } else {
        const err = json.message || 'Failed to reject leave request.';
        setErrorMessage(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Reject leave error:', err);
      setErrorMessage('Network error while rejecting leave request.');
      toast.error('Network error while rejecting leave request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete / Cancel Leave
  const handleDeleteConfirm = async () => {
    if (!selectedLeave) return;
    setIsSubmitting(true);

    try {
      const turningOn = selectedLeave.isActive === false;
      const res = await fetch(`/api/leaves/${selectedLeave.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ isActive: turningOn }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setIsDeleteModalOpen(false);
        const verb = selectedLeave.isActive === false ? 'activated' : 'deactivated';
        setSuccessMessage(`Leave request ${verb}. The record was kept.`);
        toast.success(`Leave request ${verb}.`);
        fetchLeaves();
      } else {
        const err = json.message || 'Failed to delete leave request.';
        setErrorMessage(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Delete leave error:', err);
      setErrorMessage('Network error while deleting leave request.');
      toast.error('Network error while deleting leave request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear filters
  const resetFilters = () => {
    setSearchQuery('');
    setSelectedEmployee('');
    setSelectedDate('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(searchQuery || selectedEmployee || selectedDate);

  return (
    <div className="space-y-6 pb-20">
      <ModuleHeader
        icon={CalendarCheck}
        title="Leaves"
        description={
          isEmployee
            ? 'Review your leave history and submit new time-off requests.'
            : 'Manage employee time-off requests, review pending leaves, and track department schedules.'
        }
        help={<WorkflowGuide id="leaves" />}
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
                fetchLeaves();
                fetchTabCounts();
              }}
              isLoading={isLoading}
              title="Reload leave data"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              <span>Refresh</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={openRequestModal}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              <span>Request Leave</span>
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
              Total Requests
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {tabCounts.ALL}
              </span>
              <Calendar className="h-5 w-5 text-indigo-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              {isEmployee ? 'Your total requests' : 'All staff requests'}
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Pending Review
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {tabCounts.PENDING}
              </span>
              {tabCounts.PENDING > 0 && (
                <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Awaiting approval</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Approved Leaves
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {tabCounts.APPROVED}
              </span>
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Confirmed time-off</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Rejected Requests
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {tabCounts.REJECTED}
              </span>
              <XCircle className="h-5 w-5 text-rose-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Not approved</span>
          </CardContent>
        </Card>
      </div>

      {/* STATUS NAVIGATION TABS: Pending | Approved | Rejected | All */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200/80 w-full sm:w-fit">
        <button
          onClick={() => {
            setActiveTab('PENDING');
            setPage(1);
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'PENDING'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="h-3.5 w-3.5 text-amber-600" />
          <span>Pending</span>
          {tabCounts.PENDING > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-extrabold text-amber-800">
              {tabCounts.PENDING}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('APPROVED');
            setPage(1);
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'APPROVED'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
          <span>Approved</span>
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-extrabold text-emerald-800">
            {tabCounts.APPROVED}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('REJECTED');
            setPage(1);
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'REJECTED'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <XCircle className="h-3.5 w-3.5 text-rose-600" />
          <span>Rejected</span>
          <span className="rounded-full bg-rose-100 px-1.5 py-0.2 text-[10px] font-extrabold text-rose-800">
            {tabCounts.REJECTED}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('ALL');
            setPage(1);
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'ALL'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>All Requests</span>
          <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-extrabold text-slate-700">
            {tabCounts.ALL}
          </span>
        </button>
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
                placeholder={isEmployee ? 'Search reason...' : 'Search employee, code, reason...'}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
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

            {/* Employee Filter (Visible for Managers/Admins) */}
            {isManagerOrAdmin ? (
              <div>
                <select
                  value={selectedEmployee}
                  onChange={(e) => {
                    setSelectedEmployee(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                >
                  <option value="">All Staff Members</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.employeeCode ? `[${emp.employeeCode}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600">
                <User className="h-4 w-4 text-indigo-600" />
                <span>Viewing your personal leaves</span>
              </div>
            )}

            {/* Date Filter (leaveDate) */}
            <div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
              />
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
                  Showing {totalRecords} request{totalRecords === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leaves Data Table */}
      <Card className="border-slate-200/90 shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead className="w-[220px]">Employee</TableHead>
              <TableHead className="w-[140px]">Leave Date</TableHead>
              <TableHead className="w-[110px]">Duration</TableHead>
              <TableHead className="min-w-[240px]">Reason for Leave</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[130px]">Requested</TableHead>
              <TableHead className="text-right w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableLoadingState message="Loading leave requests…" rows={5} cols={7} />
            ) : leaves.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                title="No Leave Requests Found"
                description={
                  hasActiveFilters
                    ? 'No time-off requests match your active filters.'
                    : `No ${activeTab.toLowerCase()} leave requests on record.`
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Clear Active Filters
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={openRequestModal}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      Submit Leave Request
                    </Button>
                  )
                }
              />
            ) : (
              leaves.map((leave) => (
                <TableRow key={leave.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Employee */}
                  <TableCell className="font-semibold text-slate-900">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold shadow-2xs">
                        {leave.employee?.name ? leave.employee.name.charAt(0).toUpperCase() : 'E'}
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-slate-900 text-xs truncate">
                          {leave.employee?.name || 'Employee'}
                        </span>
                        {leave.employee?.employeeCode && (
                          <span className="inline-block text-[10px] font-mono text-slate-400">
                            {leave.employee.employeeCode}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Leave Date */}
                  <TableCell className="font-semibold text-slate-900 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{formatDateDisplay(leave.leaveDate)}</span>
                    </div>
                  </TableCell>

                  {/* Duration */}
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-800">
                      {leave.duration === 1 ? '1 Day' : leave.duration === 0.5 ? '0.5 Day' : `${leave.duration} Days`}
                    </span>
                  </TableCell>

                  {/* Reason */}
                  <TableCell className="text-slate-700 text-xs">
                    <span className="line-clamp-2 max-w-sm leading-relaxed" title={leave.reason}>
                      {leave.reason}
                    </span>
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell>{renderStatusBadge(leave.status)}</TableCell>

                  {/* Requested On */}
                  <TableCell className="text-slate-500 text-xs font-medium">
                    {formatDateDisplay(leave.createdAt)}
                  </TableCell>

                  {/* Actions Column */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Managers/Admins can Approve or Reject Pending leaves directly */}
                      {isManagerOrAdmin && leave.status === 'PENDING' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Approve Leave"
                            onClick={() => openApproveModal(leave)}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          >
                            <Check className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reject Leave"
                            onClick={() => openRejectModal(leave)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}

                      {/* View Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View Leave Dossier"
                        onClick={() => openViewModal(leave)}
                      >
                        <Eye className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                      </Button>

                      {/* Delete / Cancel Button (Employee on pending, or Manager) */}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={leave.isActive === false ? 'Activate Record' : 'Deactivate Record'}
                          onClick={() => openDeleteModal(leave)}
                        >
                          <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-600" />
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
        {!isLoading && leaves.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 px-4 py-3 gap-3 bg-slate-50/50">
            <div className="text-xs text-slate-500 font-medium">
              Showing page <span className="font-bold text-slate-900">{page}</span> of{' '}
              <span className="font-bold text-slate-900">{totalPages}</span> ({totalRecords} requests total)
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

      {/* ================= REQUEST LEAVE MODAL ================= */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Submit Leave Request"
        description="Specify your intended leave date, duration, and justification for management review."
        maxWidth="max-w-xl"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRequestModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRequestSubmit}
              isLoading={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Send className="h-4 w-4 mr-1.5" />
              Submit Request
            </Button>
          </>
        }
      >
        <form onSubmit={handleRequestSubmit} className="space-y-4 text-xs">
          {formGeneralError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formGeneralError}</span>
            </div>
          )}

          {/* Employee Selection (if Manager/Admin, can request for other staff) */}
          {isManagerOrAdmin && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Employee
              </label>
              <select
                value={requestFormData.employeeId}
                onChange={(e) => setRequestFormData({ ...requestFormData, employeeId: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={user?.id}>Self ({user?.name || 'You'})</option>
                {employees
                  .filter((emp) => emp.id !== user?.id)
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.employeeCode ? `[${emp.employeeCode}]` : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Leave Date */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Leave Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={requestFormData.leaveDate}
                onChange={(e) => setRequestFormData({ ...requestFormData, leaveDate: e.target.value })}
                className={`block w-full rounded-xl border ${
                  formErrors.leaveDate ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
              />
              {formErrors.leaveDate && (
                <p className="mt-1 text-xs text-rose-600">{formErrors.leaveDate}</p>
              )}
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Duration (Days) <span className="text-rose-500">*</span>
              </label>
              <select
                value={requestFormData.duration}
                onChange={(e) => setRequestFormData({ ...requestFormData, duration: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
              >
                <option value="0.5">0.5 Day (Half Day)</option>
                <option value="1">1 Full Day</option>
                <option value="2">2 Days</option>
                <option value="3">3 Days</option>
                <option value="5">5 Days (1 Working Week)</option>
                <option value="10">10 Days (2 Working Weeks)</option>
              </select>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Reason for Request <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder="Provide context (e.g. Annual leave, family commitment, medical appointment)..."
              value={requestFormData.reason}
              onChange={(e) => setRequestFormData({ ...requestFormData, reason: e.target.value })}
              className={`block w-full rounded-xl border ${
                formErrors.reason ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
              } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
            />
            {formErrors.reason && (
              <p className="mt-1 text-xs text-rose-600">{formErrors.reason}</p>
            )}
          </div>
        </form>
      </Modal>

      {/* ================= APPROVE MODAL ================= */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Approve Leave Request"
        description="Confirm managerial sign-off and approve this time-off request."
        maxWidth="max-w-md"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsApproveModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleApproveConfirm}
              isLoading={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="h-4 w-4 mr-1.5" />
              Confirm Approval
            </Button>
          </>
        }
      >
        {selectedLeave && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-emerald-900">
              <span className="font-bold text-sm block">Confirm Authorization</span>
              <p className="mt-1 leading-relaxed">
                You are about to authorize <strong>{selectedLeave.duration} day(s)</strong> of leave for{' '}
                <strong>{selectedLeave.employee?.name || 'Employee'}</strong>.
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Leave Date:</span>
                <span className="font-bold text-slate-900">{formatDateDisplay(selectedLeave.leaveDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration:</span>
                <span className="font-mono font-bold text-slate-900">{selectedLeave.duration} Day(s)</span>
              </div>
              <div className="pt-1 border-t border-slate-200/80">
                <span className="text-slate-500 block mb-0.5">Reason:</span>
                <p className="text-slate-800 italic bg-white p-2 rounded border border-slate-200">
                  {selectedLeave.reason}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= REJECT MODAL ================= */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Leave Request"
        description="Decline this time-off request with an optional explanation."
        maxWidth="max-w-md"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRejectModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRejectConfirm}
              isLoading={isSubmitting}
            >
              <X className="h-4 w-4 mr-1.5" />
              Confirm Rejection
            </Button>
          </>
        }
      >
        {selectedLeave && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-rose-900">
              <span className="font-bold text-sm block">Manager Rejection Notice</span>
              <p className="mt-1 leading-relaxed">
                You are declining the leave request for{' '}
                <strong>{selectedLeave.employee?.name || 'Employee'}</strong> on{' '}
                {formatDateDisplay(selectedLeave.leaveDate)}.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Rejection Note / Feedback (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Explain the reason for rejection (e.g. Critical project deadline, staff shortage)..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ================= VIEW LEAVE DOSSIER MODAL ================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Leave Request Dossier"
        description="The request, its dates and who approved it."
        maxWidth="max-w-xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] font-mono text-slate-400">
              Leave.id: {selectedLeave?.id?.substring(0, 10)}...
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
              {isManagerOrAdmin && selectedLeave?.status === 'PENDING' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setIsViewModalOpen(false);
                      openApproveModal(selectedLeave);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Approve
                  </Button>

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setIsViewModalOpen(false);
                      openRejectModal(selectedLeave);
                    }}
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {selectedLeave && (
          <div className="space-y-4 text-xs">
            {/* Header Badge */}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-xs">
                  {selectedLeave.employee?.name ? selectedLeave.employee.name.charAt(0).toUpperCase() : 'E'}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Staff Member
                  </span>
                  <h4 className="text-base font-extrabold text-slate-900">
                    {selectedLeave.employee?.name || 'Employee'}
                  </h4>
                  {selectedLeave.employee?.employeeCode && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Code: {selectedLeave.employee.employeeCode}
                    </span>
                  )}
                </div>
              </div>

              <div>{renderStatusBadge(selectedLeave.status)}</div>
            </div>

            {/* Schedule Details Card */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-indigo-600" /> Requested Date
                </span>
                <span className="font-bold text-sm text-slate-900 block pt-1">
                  {formatDateDisplay(selectedLeave.leaveDate)}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-indigo-600" /> Duration
                </span>
                <span className="font-mono font-bold text-sm text-slate-900 block pt-1">
                  {selectedLeave.duration} Day(s)
                </span>
              </div>
            </div>

            {/* Reason */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Purpose & Justification
              </span>
              <p className="text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                {selectedLeave.reason}
              </p>
            </div>

            {/* Timestamps */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-3">
              <span>Submitted On: {formatDateDisplay(selectedLeave.createdAt)}</span>
              <span>Last Updated: {formatDateDisplay(selectedLeave.updatedAt)}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= DELETE / CANCEL MODAL ================= */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={selectedLeave?.isActive === false ? 'Activate Leave Record' : 'Deactivate Leave Record'}
        description="A deactivated leave stays in the database and is hidden from the list. An administrator can activate it again."
        maxWidth="max-w-md"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirm}
              isLoading={isSubmitting}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {selectedLeave?.isActive === false ? 'Activate' : 'Deactivate'}
            </Button>
          </>
        }
      >
        {selectedLeave && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-rose-900 space-y-1">
              <span className="font-bold text-sm block">Action Confirmation</span>
              <p>
                You are about to remove the request for{' '}
                <strong>{selectedLeave.employee?.name || 'Employee'}</strong> on{' '}
                {formatDateDisplay(selectedLeave.leaveDate)} ({selectedLeave.duration} day(s)).
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
