'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Clock,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  UserCheck,
  UserX,
  Compass,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  CalendarDays,
  CalendarRange,
  Users,
  LogOut,
  LogIn,
  ShieldCheck,
  Flag,
  CircleDot,
  Copy,
  Check,
  Phone,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { localDateInput } from '@/lib/utils';
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

const ATTENDANCE_METHODS = ['GPS', 'MANUAL', 'BIOMETRIC', 'QR', 'FACIAL'];

export default function AttendancePage() {
  const { user } = useAuth();
  const toast = useToast();
  const isManagerOrAdmin = user?.role === 'A' || user?.role === 'M';
  const isAdmin = user?.role === 'A';
  const isEmployee = user?.role === 'E';

  // Active View Tab: 'today' | 'weekly' | 'monthly'
  const [activeView, setActiveView] = useState('today');

  // Core Data States
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filteredSummary, setFilteredSummary] = useState(null);

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedDate, setSelectedDate] = useState(localDateInput());
  const [selectedStatus, setSelectedStatus] = useState(''); // '' | 'ACTIVE' | 'COMPLETED' | 'FLAGGED'

  // Weekly & Monthly Date Range States
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week, etc.
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month

  // Alerts & Notifications
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Modals state
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [isCheckOutModalOpen, setIsCheckOutModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Active / Selected Record
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formGeneralError, setFormGeneralError] = useState('');

  // Check-In Form State
  const [checkInForm, setCheckInForm] = useState({
    employeeId: '',
    siteId: '',
    checkInTime: '',
    checkOutTime: '',
    method: 'GPS',
    gpsAccuracy: '4.5',
    isFlagged: false,
    checkInLat: '',
    checkInLng: '',
  });

  // Check-Out Form State
  const [checkOutForm, setCheckOutForm] = useState({
    employeeId: '',
    siteId: '',
    checkOutTime: '',
    method: 'GPS',
    gpsAccuracy: '4.8',
    isFlagged: false,
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    employeeId: '',
    siteId: '',
    checkInTime: '',
    checkOutTime: '',
    method: 'GPS',
    gpsAccuracy: '',
    isFlagged: false,
  });

  // Report Date Range State
  const [reportRange, setReportRange] = useState({
    startDate: localDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    endDate: localDateInput(),
    employeeId: '',
    siteId: '',
  });

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Formatters
  const formatDateTimeDisplay = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return (
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ', ' +
        d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      );
    } catch {
      return '—';
    }
  };

  const formatTimeOnly = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  // Compute Weekly and Monthly Date Limits based on active tab
  const activeDateParams = useMemo(() => {
    if (activeView === 'today') {
      return { date: selectedDate };
    }

    if (activeView === 'weekly') {
      const now = new Date();
      now.setDate(now.getDate() + weekOffset * 7);
      const dayOfWeek = now.getDay() || 7; // Sunday is 7 in ISO
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      return {
        startDate: localDateInput(monday),
        endDate: localDateInput(sunday),
      };
    }

    if (activeView === 'monthly') {
      const now = new Date();
      now.setMonth(now.getMonth() + monthOffset);
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      return {
        startDate: localDateInput(firstDay),
        endDate: localDateInput(lastDay),
      };
    }

    return {};
  }, [activeView, selectedDate, weekOffset, monthOffset]);

  // Fetch Employees and Sites for dropdowns
  const fetchAuxiliaryData = useCallback(async () => {
    if (user?.role === 'E') return;
    try {
      const headers = getAuthHeaders();
      const [empRes, siteRes] = await Promise.all([
        fetch('/api/employees?limit=100', { headers }),
        fetch('/api/sites?limit=100', { headers }),
      ]);
      const [empJson, siteJson] = await Promise.all([
        empRes.json(),
        siteRes.json(),
      ]);

      if (empJson.success) setEmployees(empJson.data || []);
      if (siteJson.success) setSites(siteJson.data || []);
    } catch (err) {
      console.error('Failed to load auxiliary attendance data:', err);
    }
  }, [user?.role]);

  // Fetch Attendance Records
  const fetchAttendance = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedEmployee.trim()) params.append('employeeId', selectedEmployee.trim());
      if (selectedSite.trim()) params.append('siteId', selectedSite.trim());
      if (selectedStatus.trim()) params.append('status', selectedStatus.trim());

      // Apply view-specific date params
      if (activeDateParams.date) params.append('date', activeDateParams.date);
      if (activeDateParams.startDate) params.append('startDate', activeDateParams.startDate);
      if (activeDateParams.endDate) params.append('endDate', activeDateParams.endDate);
      if (showInactive && isAdmin) params.append('includeInactive', 'true');

      const res = await fetch(`/api/attendance?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setAttendanceRecords(json.data || []);
        if (json.pagination) {
          setFilteredSummary(json.pagination.summary || null);
          setTotalRecords(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        }
      } else {
        setErrorMessage(json.message || 'Failed to retrieve attendance records.');
      }
    } catch (err) {
      console.error('Fetch attendance error:', err);
      setErrorMessage('Network error while retrieving attendance records.');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchQuery, selectedEmployee, selectedSite, selectedStatus, activeDateParams, showInactive, isAdmin]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  // KPI Calculations
  const stats = useMemo(() => {
    if (filteredSummary) return filteredSummary;
    const total = totalRecords;
    const activeCheckedIn = attendanceRecords.filter((r) => !r.checkOutTime).length;
    const flagged = attendanceRecords.filter((r) => r.isFlagged).length;

    // Total working hours sum
    const totalMinutes = attendanceRecords.reduce((acc, r) => acc + (r.workingMinutes || 0), 0);
    const totalHrs = Math.floor(totalMinutes / 60);
    const avgMinutesPerShift = attendanceRecords.length > 0 ? Math.round(totalMinutes / attendanceRecords.length) : 0;
    const avgHrs = Math.floor(avgMinutesPerShift / 60);
    const avgMins = avgMinutesPerShift % 60;

    return {
      total,
      activeCheckedIn,
      flagged,
      totalHoursText: `${totalHrs}h ${totalMinutes % 60}m`,
      avgHoursText: `${avgHrs}h ${avgMins}m`,
    };
  }, [attendanceRecords, totalRecords, filteredSummary]);

  // List of employees currently clocked in (open check-ins)
  const currentlyClockedInEmployees = useMemo(() => {
    return attendanceRecords.filter((r) => !r.checkOutTime && r.employee);
  }, [attendanceRecords]);

  // Method Badge Formatter
  const renderMethodBadge = (method) => {
    const m = method?.toUpperCase() || 'GPS';
    switch (m) {
      case 'GPS':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
            <Compass className="h-3 w-3" /> GPS Geo-Fence
          </span>
        );
      case 'BIOMETRIC':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 border border-sky-200">
            <ShieldCheck className="h-3 w-3" /> Biometric
          </span>
        );
      case 'QR':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200">
            <Scan className="h-3 w-3" /> QR Scan
          </span>
        );
      case 'MANUAL':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200">
            Manual Entry
          </span>
        );
    }
  };

  // GPS Accuracy Badge Formatter
  const renderGpsBadge = (accuracy) => {
    if (accuracy === null || accuracy === undefined || accuracy === '') {
      return <span className="text-slate-400 italic text-[11px]">—</span>;
    }
    const val = parseFloat(accuracy);
    if (val <= 15) {
      return (
        <span className="inline-flex items-center font-mono font-bold text-emerald-700 text-xs bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
          ± {val}m (High)
        </span>
      );
    }
    if (val <= 50) {
      return (
        <span className="inline-flex items-center font-mono font-bold text-amber-700 text-xs bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
          ± {val}m (Med)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center font-mono font-bold text-rose-700 text-xs bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
        ± {val}m (Low)
      </span>
    );
  };

  // Open Check-In Modal
  const openCheckInModal = () => {
    const nowLocal = formatDateForInput(new Date());
    setCheckInForm({
      employeeId: user?.role === 'E' ? user.id : '',
      siteId: user?.siteId || '',
      checkInTime: nowLocal,
      checkOutTime: '',
      method: 'GPS',
      gpsAccuracy: '4.8',
      isFlagged: false,
      checkInLat: '',
      checkInLng: '',
    });
    setFormErrors({});
    setFormGeneralError('');
    setIsCheckInModalOpen(true);
  };

  // Open Check-Out Modal
  const openCheckOutModal = (preselectedEmpId = '') => {
    const nowLocal = formatDateForInput(new Date());
    setCheckOutForm({
      employeeId: preselectedEmpId || (user?.role === 'E' ? user.id : ''),
      siteId: '',
      checkOutTime: nowLocal,
      method: 'GPS',
      gpsAccuracy: '5.1',
      isFlagged: false,
    });
    setFormErrors({});
    setFormGeneralError('');
    setIsCheckOutModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (record) => {
    setSelectedRecord(record);
    setEditForm({
      employeeId: record.employeeId || '',
      siteId: record.siteId || '',
      checkInTime: formatDateForInput(record.checkInTime),
      checkOutTime: formatDateForInput(record.checkOutTime),
      method: record.method || 'GPS',
      gpsAccuracy: record.gpsAccuracy !== null && record.gpsAccuracy !== undefined ? String(record.gpsAccuracy) : '',
      isFlagged: Boolean(record.isFlagged),
    });
    setFormErrors({});
    setFormGeneralError('');
    setIsEditModalOpen(true);
  };

  // Open View Modal
  const openViewModal = (record) => {
    setSelectedRecord(record);
    setIsViewModalOpen(true);
  };

  // Open Delete Modal
  const openDeleteModal = (record) => {
    setSelectedRecord(record);
    setIsDeleteModalOpen(true);
  };

  // Submit Check-In
  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    setFormGeneralError('');

    const errors = {};
    if (!checkInForm.employeeId) errors.employeeId = 'Employee selection is required.';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        employeeId: checkInForm.employeeId,
        siteId: checkInForm.siteId || null,
        checkInTime: checkInForm.checkInTime ? new Date(checkInForm.checkInTime).toISOString() : new Date().toISOString(),
        checkOutTime: checkInForm.checkOutTime ? new Date(checkInForm.checkOutTime).toISOString() : null,
        method: checkInForm.method || 'GPS',
        gpsAccuracy: checkInForm.gpsAccuracy !== '' ? parseFloat(checkInForm.gpsAccuracy) : null,
        isFlagged: Boolean(checkInForm.isFlagged),
        checkInLat: checkInForm.checkInLat !== '' ? parseFloat(checkInForm.checkInLat) : null,
        checkInLng: checkInForm.checkInLng !== '' ? parseFloat(checkInForm.checkInLng) : null,
      };

      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsCheckInModalOpen(false);
        const msg = `Check-in recorded for "${json.data.employee?.name || 'Employee'}" successfully.`;
        setSuccessMessage(msg);
        toast.success(msg);
        fetchAttendance();
      } else {
        const err = json.message || 'Failed to record check-in.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Check-in error:', err);
      setFormGeneralError('Network error while processing check-in.');
      toast.error('Network error while processing check-in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Check-Out
  const handleCheckOutSubmit = async (e) => {
    e.preventDefault();
    setFormGeneralError('');

    if (!checkOutForm.employeeId) {
      setFormErrors({ employeeId: 'Please select an active employee to check out.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        action: 'checkout',
        employeeId: checkOutForm.employeeId,
        siteId: checkOutForm.siteId || null,
        checkOutTime: checkOutForm.checkOutTime ? new Date(checkOutForm.checkOutTime).toISOString() : new Date().toISOString(),
        method: checkOutForm.method || 'GPS',
        gpsAccuracy: checkOutForm.gpsAccuracy !== '' ? parseFloat(checkOutForm.gpsAccuracy) : null,
        isFlagged: Boolean(checkOutForm.isFlagged),
      };

      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setIsCheckOutModalOpen(false);
        const msg = `Check-out completed for "${json.data.employee?.name || 'Employee'}".`;
        setSuccessMessage(msg);
        toast.success(msg);
        fetchAttendance();
      } else {
        const err = json.message || 'Failed to complete check-out.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Check-out error:', err);
      setFormGeneralError('Network error while processing check-out.');
      toast.error('Network error while processing check-out.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit Attendance Record
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setFormGeneralError('');

    setIsSubmitting(true);
    try {
      const payload = {
        employeeId: editForm.employeeId,
        siteId: editForm.siteId || null,
        checkInTime: editForm.checkInTime ? new Date(editForm.checkInTime).toISOString() : null,
        checkOutTime: editForm.checkOutTime ? new Date(editForm.checkOutTime).toISOString() : null,
        method: editForm.method || 'GPS',
        gpsAccuracy: editForm.gpsAccuracy !== '' ? parseFloat(editForm.gpsAccuracy) : null,
        isFlagged: Boolean(editForm.isFlagged),
      };

      const res = await fetch(`/api/attendance/${selectedRecord.id}`, {
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
        setSuccessMessage('Attendance record updated successfully.');
        toast.success('Attendance record updated successfully.');
        fetchAttendance();
      } else {
        const err = json.message || 'Failed to update attendance record.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Update attendance error:', err);
      setFormGeneralError('Network error while updating attendance record.');
      toast.error('Network error while updating attendance record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Flag Status quickly
  const toggleFlagStatus = async (record) => {
    try {
      const newStatus = !record.isFlagged;
      const res = await fetch(`/api/attendance/${record.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ isFlagged: newStatus }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const msg = newStatus ? 'Record flagged for verification.' : 'Flag cleared.';
        setSuccessMessage(msg);
        toast.info(msg);
        fetchAttendance();
      }
    } catch (e) {
      console.error('Toggle flag error:', e);
    }
  };

  // Submit Delete Record
  const handleDeleteSubmit = async () => {
    if (!selectedRecord) return;
    setIsSubmitting(true);

    try {
      const turningOn = selectedRecord.isActive === false;
      const res = await fetch(`/api/attendance/${selectedRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ isActive: turningOn }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setIsDeleteModalOpen(false);
        const verb = selectedRecord.isActive === false ? 'activated' : 'deactivated';
        setSuccessMessage(`Attendance record ${verb}. The record was kept.`);
        toast.success(`Attendance record ${verb}.`);
        fetchAttendance();
      } else {
        const err = json.message || 'Failed to delete attendance record.';
        setErrorMessage(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Delete attendance error:', err);
      setErrorMessage('Network error while deleting attendance record.');
      toast.error('Network error while deleting attendance record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export Attendance to CSV
  const exportToCSV = () => {
    if (attendanceRecords.length === 0) return;

    const headers = [
      'Employee Name',
      'Employee Code',
      'Site Name',
      'Check-in Time',
      'Check-out Time',
      'Working Hours',
      'Method',
      'GPS Accuracy (m)',
      'Flagged Anomaly',
    ];

    const rows = attendanceRecords.map((r) => [
      `"${r.employee?.name || 'Unknown'}"`,
      `"${r.employee?.employeeCode || '—'}"`,
      `"${r.site?.name || 'Unassigned'}"`,
      `"${r.checkInTime ? new Date(r.checkInTime).toISOString() : '—'}"`,
      `"${r.checkOutTime ? new Date(r.checkOutTime).toISOString() : 'Active'}"`,
      `"${r.workingHoursText}"`,
      `"${r.method || 'GPS'}"`,
      `"${r.gpsAccuracy ?? '—'}"`,
      `"${r.isFlagged ? 'YES' : 'NO'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `attendance_report_${localDateInput()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('');
    setSelectedEmployee('');
    setSelectedSite('');
    setSelectedStatus('');
    setSelectedDate(localDateInput());
    setWeekOffset(0);
    setMonthOffset(0);
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    searchQuery ||
    selectedEmployee ||
    selectedSite ||
    selectedStatus ||
    (activeView === 'today' && selectedDate !== localDateInput()) ||
    weekOffset !== 0 ||
    monthOffset !== 0
  );

  return (
    <div className="space-y-6 pb-20">
      <ModuleHeader
        icon={Clock}
        title={isEmployee ? 'My Attendance' : 'Attendance'}
        description={
          isEmployee
            ? 'Track your personal field check-ins, working hours, and shift history.'
            : 'Track field check-ins, geo-fenced site hours, working duration, and audit flags.'
        }
        help={<WorkflowGuide id="attendance" />}
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
                fetchAttendance();
                fetchAuxiliaryData();
              }}
              isLoading={isLoading}
              title="Reload attendance data"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              <span>Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReportModalOpen(true)}
              className="text-indigo-700 bg-indigo-50/70 border-indigo-200 hover:bg-indigo-100"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5 text-indigo-600" />
              <span>Attendance Report</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => openCheckOutModal()}
              className="text-amber-700 bg-amber-50/70 border-amber-300 hover:bg-amber-100"
            >
              <LogOut className="h-4 w-4 mr-1.5 text-amber-600" />
              <span>Check-Out</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={openCheckInModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <LogIn className="h-4 w-4 mr-1.5" />
              <span>Check-In</span>
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
              Total Check-Ins
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {stats.total}
              </span>
              <Clock className="h-5 w-5 text-sky-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">In current selection</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Currently Clocked In
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {stats.activeCheckedIn}
              </span>
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Active on field now</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Hours across filtered records
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 truncate">
                {stats.totalHoursText}
              </span>
              <TrendingUp className="h-5 w-5 text-indigo-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Avg {stats.avgHoursText} / shift</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90">
          <CardContent className="p-4 sm:p-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Flagged Anomalies
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900">
                {stats.flagged}
              </span>
              <Flag className="h-5 w-5 text-rose-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Records marked for review</span>
          </CardContent>
        </Card>
      </div>

      {/* VIEW SWITCHER TABS: Today View | Weekly View | Monthly View */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => {
              setActiveView('today');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeView === 'today'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 text-sky-600" />
            <span>Today View</span>
          </button>

          <button
            onClick={() => {
              setActiveView('weekly');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeView === 'weekly'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
            <span>Weekly View</span>
          </button>

          <button
            onClick={() => {
              setActiveView('monthly');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeView === 'monthly'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5 text-indigo-600" />
            <span>Monthly View</span>
          </button>
        </div>

        {/* View Range Navigation Controls */}
        <div className="flex items-center gap-2">
          {activeView === 'today' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {selectedDate !== localDateInput() && (
                <button
                  onClick={() => setSelectedDate(localDateInput())}
                  className="text-xs text-sky-600 hover:underline font-semibold"
                >
                  Today
                </button>
              )}
            </div>
          )}

          {activeView === 'weekly' && (
            <div className="flex items-center gap-1.5 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekOffset((o) => o - 1)}
                className="h-7 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="font-mono font-semibold text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                {activeDateParams.startDate} to {activeDateParams.endDate}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekOffset((o) => o + 1)}
                className="h-7 px-2"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="text-xs text-sky-600 hover:underline font-semibold ml-1"
                >
                  This Week
                </button>
              )}
            </div>
          )}

          {activeView === 'monthly' && (
            <div className="flex items-center gap-1.5 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMonthOffset((o) => o - 1)}
                className="h-7 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="font-mono font-semibold text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                {activeDateParams.startDate?.substring(0, 7)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMonthOffset((o) => o + 1)}
                className="h-7 px-2"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              {monthOffset !== 0 && (
                <button
                  onClick={() => setMonthOffset(0)}
                  className="text-xs text-sky-600 hover:underline font-semibold ml-1"
                >
                  This Month
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-slate-200/90 shadow-2xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search employee, site, code..."
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

            {/* Employee Filter (Managers & Admins only) */}
            {isManagerOrAdmin && (
              <div>
                <select
                  value={selectedEmployee}
                  onChange={(e) => {
                    setSelectedEmployee(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition"
                >
                  <option value="">All Employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.employeeCode ? `[${emp.employeeCode}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Site Filter */}
            <div>
              <select
                value={selectedSite}
                onChange={(e) => {
                  setSelectedSite(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition"
              >
                <option value="">All Operational Sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
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
                <option value="ACTIVE">Currently Clocked In</option>
                <option value="COMPLETED">Completed Shift</option>
                <option value="FLAGGED">Flagged Anomalies Only</option>
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
                  Showing {totalRecords} attendance log{totalRecords === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Data Table */}
      <Card className="border-slate-200/90 shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead className="w-[230px]">Employee</TableHead>
              <TableHead className="min-w-[170px]">Operational Site</TableHead>
              <TableHead className="min-w-[150px]">Check-In</TableHead>
              <TableHead className="min-w-[150px]">Check-Out</TableHead>
              <TableHead className="w-[130px]">Working Hours</TableHead>
              <TableHead className="w-[140px]">Method</TableHead>
              <TableHead className="w-[130px]">GPS Accuracy</TableHead>
              <TableHead className="text-center w-[110px]">Flag Status</TableHead>
              <TableHead className="text-right w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableLoadingState message="Loading attendance records…" rows={5} cols={9} />
            ) : attendanceRecords.length === 0 ? (
              <TableEmptyState
                colSpan={9}
                title="No Attendance Records Found"
                description={
                  hasActiveFilters
                    ? 'No attendance entries match your current search and filter parameters.'
                    : 'No attendance logs have been recorded for this period.'
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Clear Active Filters
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={openCheckInModal}>
                      <LogIn className="h-4 w-4 mr-1.5" />
                      {isEmployee ? 'Check In' : 'Record First Check-In'}
                    </Button>
                  )
                }
              />
            ) : (
              attendanceRecords.map((r) => (
                <TableRow key={r.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Employee */}
                  <TableCell className="font-semibold text-slate-900">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 text-xs font-bold shadow-2xs">
                        {r.employee?.name ? r.employee.name.charAt(0).toUpperCase() : 'E'}
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-slate-900 text-xs truncate">
                          {r.employee?.name || 'Unassigned Employee'}
                        </span>
                        {r.employee?.employeeCode && (
                          <span className="inline-block text-[10px] font-mono text-slate-400">
                            {r.employee.employeeCode}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Operational Site */}
                  <TableCell>
                    {r.site ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-800 text-xs truncate max-w-[160px]">
                          <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{r.site.name}</span>
                        </span>
                        {r.distanceFromSite != null && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                            r.siteAttendanceRadius != null && r.distanceFromSite <= r.siteAttendanceRadius
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : r.siteAttendanceRadius != null
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            <Compass className="h-2.5 w-2.5" />
                            {r.distanceFromSite}m away
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Unassigned Site</span>
                    )}
                  </TableCell>

                  {/* Check-In */}
                  <TableCell className="text-xs">
                    <div className="space-y-0.5">
                      <span className="font-mono font-bold text-slate-800 block">
                        {formatTimeOnly(r.checkInTime)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {r.checkInTime ? new Date(r.checkInTime).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}
                      </span>
                    </div>
                  </TableCell>

                  {/* Check-Out */}
                  <TableCell className="text-xs">
                    {r.checkOutTime ? (
                      <div className="space-y-0.5">
                        <span className="font-mono font-bold text-slate-800 block">
                          {formatTimeOnly(r.checkOutTime)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {new Date(r.checkOutTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Active Now
                      </span>
                    )}
                  </TableCell>

                  {/* Working Hours */}
                  <TableCell>
                    <span
                      className={`font-mono text-xs font-bold ${
                        r.isOngoing ? 'text-emerald-700' : 'text-slate-800'
                      }`}
                    >
                      {r.workingHoursText}
                    </span>
                  </TableCell>

                  {/* Method */}
                  <TableCell>{renderMethodBadge(r.method)}</TableCell>

                  {/* GPS Accuracy */}
                  <TableCell>{renderGpsBadge(r.gpsAccuracy)}</TableCell>

                  {/* Flag Status */}
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (isManagerOrAdmin) toggleFlagStatus(r);
                      }}
                      disabled={!isManagerOrAdmin}
                      title={
                        isManagerOrAdmin
                          ? (r.isFlagged ? 'Flagged anomaly - click to clear' : 'Click to flag anomaly')
                          : (r.isFlagged ? 'Flagged anomaly' : 'Not flagged; not a verification of accuracy')
                      }
                      className="transition transform active:scale-95 disabled:cursor-default"
                    >
                      {r.isFlagged ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200 shadow-2xs">
                          <Flag className="h-3 w-3 fill-rose-600 text-rose-600" />
                          Flagged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Not flagged
                        </span>
                      )}
                    </button>
                  </TableCell>

                  {/* Actions Column */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* If open check-in, quick check-out button */}
                      {!r.checkOutTime && (isManagerOrAdmin || r.employeeId === user?.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Clock Out Employee"
                          onClick={() => openCheckOutModal(r.employeeId)}
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      )}

                      {/* View Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View Attendance Dossier"
                        onClick={() => openViewModal(r)}
                      >
                        <Eye className="h-4 w-4 text-slate-500 hover:text-sky-600" />
                      </Button>

                      {/* Edit Button */}
                      {isManagerOrAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit Record"
                          onClick={() => openEditModal(r)}
                        >
                          <Pencil className="h-4 w-4 text-slate-500 hover:text-amber-600" />
                        </Button>
                      )}

                      {/* Delete Button */}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={r.isActive === false ? 'Activate Record' : 'Deactivate Record'}
                          onClick={() => openDeleteModal(r)}
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
        {!isLoading && attendanceRecords.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 px-4 py-3 gap-3 bg-slate-50/50">
            <div className="text-xs text-slate-500 font-medium">
              Showing page <span className="font-bold text-slate-900">{page}</span> of{' '}
              <span className="font-bold text-slate-900">{totalPages}</span> ({totalRecords} records total)
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

      {/* ================= CHECK-IN MODAL ================= */}
      <Modal
        isOpen={isCheckInModalOpen}
        onClose={() => setIsCheckInModalOpen(false)}
        title="Record Field Check-In"
        description="Clock-in an employee at a designated operational site with GPS accuracy and timestamp."
        maxWidth="max-w-xl"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCheckInModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCheckInSubmit}
              isLoading={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Confirm Check-In
            </Button>
          </>
        }
      >
        <form onSubmit={handleCheckInSubmit} className="space-y-4 text-xs">
          {formGeneralError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formGeneralError}</span>
            </div>
          )}

          {isEmployee ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800">
              Checking in as <span className="font-semibold">{user?.name || 'you'}</span>. The punch time is recorded by the server.
            </div>
          ) : (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Select Employee <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={checkInForm.employeeId}
              onChange={(e) => setCheckInForm({ ...checkInForm, employeeId: e.target.value })}
              className={`block w-full rounded-xl border ${
                formErrors.employeeId ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
              } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
            >
              <option value="">-- Choose Employee --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ''}
                </option>
              ))}
            </select>
          </div>
          )}

          {!isEmployee && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Operational Field Site
            </label>
            <select
              value={checkInForm.siteId}
              onChange={(e) => setCheckInForm({ ...checkInForm, siteId: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">-- Unassigned / General --</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.address ? `(${s.address})` : ''}
                </option>
              ))}
            </select>
          </div>
          )}

          {!isEmployee && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Check-In Timestamp */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Check-In Timestamp
              </label>
              <input
                type="datetime-local"
                value={checkInForm.checkInTime}
                onChange={(e) => setCheckInForm({ ...checkInForm, checkInTime: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Check-Out Timestamp (optional) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Check-Out Timestamp (Optional)
              </label>
              <input
                type="datetime-local"
                value={checkInForm.checkOutTime}
                onChange={(e) => setCheckInForm({ ...checkInForm, checkOutTime: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Verification Method */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Method
              </label>
              <select
                value={checkInForm.method}
                onChange={(e) => setCheckInForm({ ...checkInForm, method: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {ATTENDANCE_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* GPS Accuracy */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                GPS Accuracy (Meters)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 4.5"
                value={checkInForm.gpsAccuracy}
                onChange={(e) => setCheckInForm({ ...checkInForm, gpsAccuracy: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 font-mono focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {!isEmployee && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="checkInFlag"
              checked={checkInForm.isFlagged}
              onChange={(e) => setCheckInForm({ ...checkInForm, isFlagged: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            <label htmlFor="checkInFlag" className="text-xs text-slate-700 font-medium">
              Flag as audit anomaly (low precision, off-site, or irregular time)
            </label>
          </div>
          )}

          {/* Employee GPS Location */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Employee Check-In Location <span className="text-slate-400 font-normal normal-case">(optional — used to compute distance from site)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                placeholder="Latitude e.g. 26.1445"
                value={checkInForm.checkInLat}
                onChange={(e) => setCheckInForm({ ...checkInForm, checkInLat: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 font-mono focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude e.g. 91.7362"
                value={checkInForm.checkInLng}
                onChange={(e) => setCheckInForm({ ...checkInForm, checkInLng: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 font-mono focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Distance from site and location remarks are auto-computed and stored on save.
            </p>
          </div>
        </form>
      </Modal>

      {/* ================= CHECK-OUT MODAL ================= */}
      <Modal
        isOpen={isCheckOutModalOpen}
        onClose={() => setIsCheckOutModalOpen(false)}
        title="Complete Field Check-Out"
        description="Locates the active open check-in record for the selected employee and calculates completed working hours."
        maxWidth="max-w-xl"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCheckOutModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCheckOutSubmit}
              isLoading={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm Check-Out
            </Button>
          </>
        }
      >
        <form onSubmit={handleCheckOutSubmit} className="space-y-4 text-xs">
          {formGeneralError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formGeneralError}</span>
            </div>
          )}

          {isEmployee ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800">
              Checking out as <span className="font-semibold">{user?.name || 'you'}</span>. The punch time is recorded by the server.
            </div>
          ) : (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Select Clocked-In Employee <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={checkOutForm.employeeId}
              onChange={(e) => setCheckOutForm({ ...checkOutForm, employeeId: e.target.value })}
              className={`block w-full rounded-xl border ${
                formErrors.employeeId ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
              } bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20`}
            >
              <option value="">-- Select Active Employee --</option>
              {currentlyClockedInEmployees.length > 0 ? (
                currentlyClockedInEmployees.map((r) => (
                  <option key={r.employeeId} value={r.employeeId}>
                    {r.employee?.name} {r.employee?.employeeCode ? `[${r.employee.employeeCode}]` : ''} - Check-in: {formatTimeOnly(r.checkInTime)}
                  </option>
                ))
              ) : (
                employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.employeeCode ? `[${emp.employeeCode}]` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!isEmployee && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Check-Out Timestamp
              </label>
              <input
                type="datetime-local"
                value={checkOutForm.checkOutTime}
                onChange={(e) => setCheckOutForm({ ...checkOutForm, checkOutTime: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            )}

            {/* GPS Accuracy */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                GPS Accuracy (Meters)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 5.1"
                value={checkOutForm.gpsAccuracy}
                onChange={(e) => setCheckOutForm({ ...checkOutForm, gpsAccuracy: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 font-mono focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ================= EDIT ATTENDANCE MODAL ================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Attendance Entry"
        description="Update shift timestamps, site allocation, and audit flag status."
        maxWidth="max-w-xl"
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
        <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
          {formGeneralError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formGeneralError}</span>
            </div>
          )}

          {/* Employee Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Employee
            </label>
            <select
              value={editForm.employeeId}
              onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.employeeCode ? `[${emp.employeeCode}]` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Site Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Site
            </label>
            <select
              value={editForm.siteId}
              onChange={(e) => setEditForm({ ...editForm, siteId: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="">-- Unassigned --</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Check-In */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Check-In Time
              </label>
              <input
                type="datetime-local"
                value={editForm.checkInTime}
                onChange={(e) => setEditForm({ ...editForm, checkInTime: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            {/* Check-Out */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Check-Out Time
              </label>
              <input
                type="datetime-local"
                value={editForm.checkOutTime}
                onChange={(e) => setEditForm({ ...editForm, checkOutTime: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Method */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Method
              </label>
              <select
                value={editForm.method}
                onChange={(e) => setEditForm({ ...editForm, method: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                {ATTENDANCE_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* GPS Accuracy */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                GPS Accuracy (Meters)
              </label>
              <input
                type="number"
                step="0.1"
                value={editForm.gpsAccuracy}
                onChange={(e) => setEditForm({ ...editForm, gpsAccuracy: e.target.value })}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 font-mono focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="editFlag"
              checked={editForm.isFlagged}
              onChange={(e) => setEditForm({ ...editForm, isFlagged: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            <label htmlFor="editFlag" className="text-xs text-slate-700 font-medium">
              Flag as audit anomaly
            </label>
          </div>
        </form>
      </Modal>

      {/* ================= VIEW ATTENDANCE DOSSIER MODAL ================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Attendance Record Dossier"
        description="Detailed shift audit trail, working duration, verification method, and geo-fence accuracy."
        maxWidth="max-w-xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] font-mono text-slate-400">
              Attendance.id: {selectedRecord?.id?.substring(0, 10)}...
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
              {isManagerOrAdmin && selectedRecord && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsViewModalOpen(false);
                    openEditModal(selectedRecord);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit Record
                </Button>
              )}
            </div>
          </div>
        }
      >
        {selectedRecord && (
          <div className="space-y-4 text-xs">
            {/* Header Badge */}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white font-bold text-sm shadow-xs">
                  {selectedRecord.employee?.name ? selectedRecord.employee.name.charAt(0).toUpperCase() : 'E'}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Employee Profile
                  </span>
                  <h4 className="text-base font-extrabold text-slate-900">
                    {selectedRecord.employee?.name || 'Unassigned'}
                  </h4>
                  {selectedRecord.employee?.employeeCode && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Code: {selectedRecord.employee.employeeCode}
                    </span>
                  )}
                </div>
              </div>

              <div>
                {selectedRecord.isFlagged ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                    <Flag className="h-3 w-3 fill-rose-600 text-rose-600" />
                    Flagged Anomaly
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Not flagged
                  </span>
                )}
              </div>
            </div>

            {/* Shift & Duration Metrics Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Shift Timing & Calculated Duration
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Check-In</span>
                  <span className="font-mono font-bold text-sm text-slate-900 block mt-0.5">
                    {formatTimeOnly(selectedRecord.checkInTime)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {selectedRecord.checkInTime ? new Date(selectedRecord.checkInTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Check-Out</span>
                  {selectedRecord.checkOutTime ? (
                    <>
                      <span className="font-mono font-bold text-sm text-slate-900 block mt-0.5">
                        {formatTimeOnly(selectedRecord.checkOutTime)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {new Date(selectedRecord.checkOutTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-sm mt-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active (Ongoing)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-slate-700">
                <span className="font-medium">Total Working Duration:</span>
                <span className="font-mono font-extrabold text-sm text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                  {selectedRecord.workingHoursText}
                </span>
              </div>
            </div>

            {/* Site & Location Analysis */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Field Site & Location Analysis
              </span>

              {selectedRecord.site ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-sm text-slate-900">{selectedRecord.site.name}</h5>
                    <span className="text-[11px] font-mono text-slate-400">Site.id</span>
                  </div>
                  <p className="text-slate-600 flex items-start gap-1">
                    <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <span>{selectedRecord.site.address || 'No physical address on record'}</span>
                  </p>
                  {selectedRecord.site.coordinates && (
                    <p className="text-slate-500 font-mono text-[11px] flex items-center gap-1 pt-0.5">
                      <Compass className="h-3.5 w-3.5 text-slate-400" />
                      <span>Site GPS: {selectedRecord.site.coordinates}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 italic">No operational site attached to this shift.</p>
              )}

              {/* Location snapshot rows */}
              {(selectedRecord.siteLat != null || selectedRecord.checkInLat != null || selectedRecord.distanceFromSite != null) && (
                <div className="border-t border-slate-100 pt-2 space-y-1.5">
                  {selectedRecord.siteLat != null && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-sky-500" /> Site Coords (snapshot)
                      </span>
                      <span className="font-mono font-bold text-slate-700">
                        {selectedRecord.siteLat}, {selectedRecord.siteLng}
                      </span>
                    </div>
                  )}

                  {selectedRecord.checkInLat != null && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Compass className="h-3 w-3 text-emerald-500" /> Employee Location
                      </span>
                      <span className="font-mono font-bold text-slate-700">
                        {selectedRecord.checkInLat}, {selectedRecord.checkInLng}
                      </span>
                    </div>
                  )}

                  {selectedRecord.siteAttendanceRadius != null && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3 text-indigo-500" /> Attendance Radius
                      </span>
                      <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                        {selectedRecord.siteAttendanceRadius} m
                      </span>
                    </div>
                  )}

                  {selectedRecord.distanceFromSite != null && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-slate-400" /> Distance from Site
                      </span>
                      <span className={`font-mono font-bold px-1.5 py-0.5 rounded border text-[11px] ${
                        selectedRecord.siteAttendanceRadius != null && selectedRecord.distanceFromSite <= selectedRecord.siteAttendanceRadius
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : selectedRecord.siteAttendanceRadius != null
                          ? 'text-rose-700 bg-rose-50 border-rose-200'
                          : 'text-slate-700 bg-slate-50 border-slate-200'
                      }`}>
                        {selectedRecord.distanceFromSite} m
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Auto-generated location remarks */}
              {selectedRecord.locationRemarks && (
                <div className={`flex items-start gap-2 rounded-lg p-2.5 border text-[11px] ${
                  selectedRecord.locationRemarks.startsWith('Within')
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : selectedRecord.locationRemarks.startsWith('Outside')
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="font-medium">{selectedRecord.locationRemarks}</span>
                </div>
              )}
            </div>

            {/* Verification & Method Card */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Verification Method</span>
                <div>{renderMethodBadge(selectedRecord.method)}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">GPS Precision</span>
                <div>{renderGpsBadge(selectedRecord.gpsAccuracy)}</div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= ATTENDANCE REPORT DRAWER / MODAL ================= */}
      <Modal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title="Attendance Analytics & Export Report"
        description="Filter attendance logs across custom date ranges, view aggregate hours, and download audit CSV files."
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500 font-medium">
              Ready to export {attendanceRecords.length} records
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsReportModalOpen(false)}>
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={exportToCSV}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV Report
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Report Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-center">
              <span className="text-[10px] uppercase font-bold text-indigo-800 block">Total Shifts</span>
              <span className="text-xl font-extrabold font-mono text-indigo-900 mt-1 block">
                {stats.total}
              </span>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-center">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Total Work Hours</span>
              <span className="text-xl font-extrabold font-mono text-emerald-900 mt-1 block truncate">
                {stats.totalHoursText}
              </span>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-center">
              <span className="text-[10px] uppercase font-bold text-rose-800 block">Flagged Items</span>
              <span className="text-xl font-extrabold font-mono text-rose-900 mt-1 block">
                {stats.flagged}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h5 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
              CSV Export Specifications
            </h5>
            <p className="text-slate-600 leading-relaxed">
              Export includes Employee Name, Employee Code, Assigned Site, Exact Check-in Time, Check-out Time, Total Calculated Working Hours, Verification Method, GPS Precision (meters), and Flag Status.
            </p>
          </div>
        </div>
      </Modal>

      {/* ================= DELETE ATTENDANCE MODAL ================= */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={selectedRecord?.isActive === false ? 'Activate Attendance Record' : 'Deactivate Attendance Record'}
        description="A deactivated log stays in the database and is hidden from the list. An administrator can activate it again."
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
              onClick={handleDeleteSubmit}
              isLoading={isSubmitting}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {selectedRecord?.isActive === false ? 'Activate' : 'Deactivate'}
            </Button>
          </>
        }
      >
        {selectedRecord && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-rose-900 space-y-1">
              <span className="font-bold text-sm block">Confirm Deletion</span>
              <p>
                You are about to delete the shift record for{' '}
                <strong>{selectedRecord.employee?.name || 'Employee'}</strong> recorded on{' '}
                {selectedRecord.checkInTime ? new Date(selectedRecord.checkInTime).toLocaleDateString() : '—'}.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Employee:</span>
                <span className="font-bold text-slate-900">{selectedRecord.employee?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Site:</span>
                <span className="font-semibold text-slate-800">{selectedRecord.site?.name || 'Unassigned'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Working Duration:</span>
                <span className="font-mono font-bold text-slate-900">{selectedRecord.workingHoursText}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
