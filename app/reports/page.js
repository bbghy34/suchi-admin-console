'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Clock,
  Briefcase,
  HardHat,
  Users,
  CalendarCheck,
  FileSpreadsheet,
  Download,
  Printer,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Building2,
  MapPin,
  CheckCircle2,
  XCircle,
  Hourglass,
  ArrowUpDown,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
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
import { useToast } from '@/components/providers/ToastProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { CLIENT } from '@/config/client';

// Currency formatter for Indian Rupees
function formatINR(amount, compact = true) {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
  const num = Number(amount);
  if (compact && num >= 10000000) {
    return `₹${(num / 10000000).toFixed(2)} Cr`;
  } else if (compact && num >= 100000) {
    return `₹${(num / 100000).toFixed(2)} Lakh`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

// Date formatter
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return 'Invalid Date';
  }
}

// Time formatter
function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return '--:--';
  }
}

const REPORT_PREF = {
  attendance: 'reportAttendance',
  project: 'reportProject',
  contractor: 'reportContractor',
  employee: 'reportEmployee',
  leave: 'reportLeave',
};

const REPORT_FILTERS = {
  attendance: { dates: true, status: 'attendance', department: true, site: true },
  project: { dates: true, status: 'project', department: true, contractor: true },
  contractor: {},
  employee: { department: true, site: true },
  leave: { dates: true, status: 'leave', department: true, employee: true },
};

const REPORT_TABS = [
  { id: 'attendance', label: 'Attendance Report', icon: Clock, color: 'text-cyan-600 bg-cyan-50' },
  { id: 'project', label: 'Project Report', icon: Briefcase, color: 'text-sky-600 bg-sky-50' },
  { id: 'contractor', label: 'Contractor Report', icon: HardHat, color: 'text-amber-600 bg-amber-50' },
  { id: 'employee', label: 'Employee Report', icon: Users, color: 'text-indigo-600 bg-indigo-50' },
  { id: 'leave', label: 'Leave Report', icon: CalendarCheck, color: 'text-orange-600 bg-orange-50' },
];

export default function ReportsPage() {
  const toast = useToast();
  const { prefs } = usePreferences();
  const money = (amount) => formatINR(amount, prefs.reportCompactAmounts);
  const [activeTab, setActiveTab] = useState('attendance');
  const [isLoading, setIsLoading] = useState(true);
  const loadSequence = useRef(0);
  const [error, setError] = useState(null);

  // Raw fetched datasets
  const [reportData, setReportData] = useState({
    attendance: [],
    project: [],
    contractor: [],
    employee: [],
    leave: [],
  });

  const [summary, setSummary] = useState({
    attendance: { totalRecords: 0, completedPunches: 0, activePunches: 0, totalHours: 0 },
    project: { totalProjects: 0, activeProjects: 0, totalBudget: 0, avgProgress: 0 },
    contractor: { totalContractors: 0, contractorsWithProjects: 0, totalPortfolioBudget: 0 },
    employee: { totalEmployees: 0, totalAttendances: 0, totalLeaves: 0 },
    leave: { totalLeaves: 0, approved: 0, pending: 0, rejected: 0 },
  });

  const [filterOptions, setFilterOptions] = useState({
    departments: [],
    contractors: [],
    sites: [],
    employees: [],
  });

  // Filter States
  const [datePreset, setDatePreset] = useState('ALL'); // 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [selectedContractor, setSelectedContractor] = useState('ALL');
  const [selectedSite, setSelectedSite] = useState('ALL');
  const [selectedEmployee, setSelectedEmployee] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const visibleTabs = REPORT_TABS.filter((tab) => prefs[REPORT_PREF[tab.id]] !== false);
  const visibleIds = visibleTabs.map((tab) => tab.id).join(',');
  const allowedFilters = REPORT_FILTERS[activeTab] || {};

  useEffect(() => {
    const ids = visibleIds.split(',').filter(Boolean);
    if (ids.length && !ids.includes(activeTab)) setActiveTab(ids[0]);
  }, [visibleIds, activeTab]);

  // Apply Date Presets
  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    const toDateInput = (d) => {
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${month}-${day}`;
    };

    if (preset === 'TODAY') {
      const todayStr = toDateInput(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'WEEK') {
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      setStartDate(toDateInput(weekAgo));
      setEndDate(toDateInput(now));
    } else if (preset === 'MONTH') {
      const monthAgo = new Date(now.getTime() - 30 * 86400000);
      setStartDate(toDateInput(monthAgo));
      setEndDate(toDateInput(now));
    } else if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Reset All Filters
  const resetFilters = () => {
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
    setSelectedStatus('ALL');
    setSelectedDepartment('ALL');
    setSelectedContractor('ALL');
    setSelectedSite('ALL');
    setSelectedEmployee('ALL');
    setSearchQuery('');
  };

  // Fetch Report Data from Database
  const fetchReports = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('reportType', activeTab);
      const allowed = REPORT_FILTERS[activeTab] || {};
      if (allowed.dates && startDate) params.append('startDate', startDate);
      if (allowed.dates && endDate) params.append('endDate', endDate);
      if (allowed.department && selectedDepartment !== 'ALL') params.append('departmentId', selectedDepartment);
      if (allowed.contractor && selectedContractor !== 'ALL') params.append('contractorId', selectedContractor);
      if (allowed.site && selectedSite !== 'ALL') params.append('siteId', selectedSite);
      if (allowed.employee && selectedEmployee !== 'ALL') params.append('employeeId', selectedEmployee);
      if (allowed.status && selectedStatus !== 'ALL') params.append('status', selectedStatus);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/reports?${params.toString()}`);
      const json = await res.json();
      if (sequence !== loadSequence.current) return;

      if (!res.ok || !json.success) {
        throw new Error(json.message || `Failed with status ${res.status}`);
      }

      setReportData((prev) => ({
        ...prev,
        [activeTab]: json.data.data[activeTab] || [],
      }));

      if (json.data.summary) {
        setSummary(json.data.summary);
      }

      if (json.data.filters) {
        setFilterOptions(json.data.filters);
      }
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      console.error('Failed to load reports:', err);
      setError(err.message || 'Unable to retrieve live reports from database.');
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, [
    activeTab,
    startDate,
    endDate,
    selectedDepartment,
    selectedContractor,
    selectedSite,
    selectedEmployee,
    selectedStatus,
    searchQuery,
  ]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Client-side quick filter / search refinement
  const currentTableData = useMemo(() => {
    return reportData[activeTab] || [];
  }, [reportData, activeTab]);

  // Export CSV Functionality
  const exportToCSV = () => {
    const data = currentTableData;
    if (!data || data.length === 0) {
      alert('No records available to export.');
      return;
    }

    let headers = [];
    let rows = [];

    if (activeTab === 'attendance') {
      headers = ['Employee Name', 'Employee Code', 'Department', 'Site Location', 'Date', 'Check-In', 'Check-Out', 'Working Hours', 'Status', 'Method'];
      rows = data.map((r) => [
        `"${r.employee}"`,
        `"${r.employeeCode}"`,
        `"${r.department}"`,
        `"${r.site}"`,
        `"${formatDate(r.date)}"`,
        `"${formatTime(r.checkIn)}"`,
        `"${r.checkOut ? formatTime(r.checkOut) : 'Ongoing'}"`,
        `"${r.workingHours}"`,
        `"${r.status}"`,
        `"${r.method}"`,
      ]);
    } else if (activeTab === 'project') {
      headers = ['Project Name', 'Tender ID', 'Department', 'Contractor', 'Status', 'Progress (%)', 'Budget (INR)', 'Start Date', 'End Date'];
      rows = data.map((r) => [
        `"${r.project}"`,
        `"${r.tenderId}"`,
        `"${r.department}"`,
        `"${r.contractor}"`,
        `"${r.status}"`,
        `${r.progress}%`,
        `"${money(r.budget)}"`,
        `"${formatDate(r.startDate)}"`,
        `"${formatDate(r.endDate)}"`,
      ]);
    } else if (activeTab === 'contractor') {
      headers = ['Contractor Name', 'Phone Number', 'Total Projects', 'Active Projects', 'Completed Projects', 'Total Project Budget (INR)', 'Description'];
      rows = data.map((r) => [
        `"${r.contractor}"`,
        `"${r.phone}"`,
        r.totalProjects,
        r.activeProjects,
        r.completedProjects,
        `"${money(r.totalBudget)}"`,
        `"${(r.description || '').replace(/"/g, '""')}"`,
      ]);
    } else if (activeTab === 'employee') {
      headers = ['Employee Name', 'Employee Code', 'Email', 'Phone', 'Department', 'Designation', 'Total Attendances', 'Hours Logged', 'Total Leaves', 'Approved Leaves', 'Pending Leaves', 'Status'];
      rows = data.map((r) => [
        `"${r.employee}"`,
        `"${r.employeeCode}"`,
        `"${r.email}"`,
        `"${r.phone}"`,
        `"${r.department}"`,
        `"${r.designation}"`,
        r.totalAttendances,
        r.totalHoursLogged,
        r.totalLeaves,
        r.approvedLeaves,
        r.pendingLeaves,
        `"${r.status}"`,
      ]);
    } else if (activeTab === 'leave') {
      headers = ['Employee Name', 'Employee Code', 'Department', 'Designation', 'Leave Date', 'Duration (Days)', 'Reason', 'Status', 'Application Date'];
      rows = data.map((r) => [
        `"${r.employee}"`,
        `"${r.employeeCode}"`,
        `"${r.department}"`,
        `"${r.designation}"`,
        `"${formatDate(r.leaveDate)}"`,
        r.duration,
        `"${(r.reason || '').replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${formatDate(r.createdAt)}"`,
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${CLIENT.shortName}_${activeTab}_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report Exported', `Generated CSV file for ${activeTab} data.`);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <ModuleHeader
        icon={FileSpreadsheet}
        title="Reports"
        description="Attendance, project, contractor, employee and leave reports, ready to filter and export."
        help={<WorkflowGuide id="reports" />}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchReports}
              isLoading={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="hidden sm:inline-flex"
            >
              <Printer className="h-4 w-4 mr-1.5" />
              <span>Print</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={exportToCSV}
              disabled={currentTableData.length === 0}
            >
              <Download className="h-4 w-4 mr-1.5" />
              <span>Export CSV</span>
            </Button>
          </>
        }
      />

      {/* Error State Banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <div className="text-sm">
              <span className="font-semibold">Query Execution Error:</span> {error}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReports}
            className="border-rose-300 text-rose-800 hover:bg-rose-100"
          >
            Retry Query
          </Button>
        </div>
      )}

      {/* 5 Primary Report Tab Switcher */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedStatus('ALL');
              }}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span className={`p-1 rounded-md ${tab.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {visibleTabs.length === 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6 text-sm text-slate-500">
            Every report is hidden. Turn at least one back on in Settings.
          </CardContent>
        </Card>
      )}

      {/* Dynamic KPI Summary Cards for Active Report */}
      {prefs.reportSummary && visibleTabs.length > 0 && (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {activeTab === 'attendance' && (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Logged Punches
                </span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {isLoading ? '--' : summary.attendance.totalRecords}
                </div>
                <p className="mt-1 text-xs text-slate-400">Attendance records</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Completed Shifts
                </span>
                <div className="mt-1 text-2xl font-extrabold text-emerald-600">
                  {isLoading ? '--' : summary.attendance.completedPunches}
                </div>
                <p className="mt-1 text-xs text-emerald-600">Checked out properly</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Active in Field
                </span>
                <div className="mt-1 text-2xl font-extrabold text-cyan-600">
                  {isLoading ? '--' : summary.attendance.activePunches}
                </div>
                <p className="mt-1 text-xs text-cyan-600">Ongoing shifts</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Working Hours
                </span>
                <div className="mt-1 text-2xl font-extrabold text-indigo-700">
                  {isLoading ? '--' : `${summary.attendance.totalHours} hrs`}
                </div>
                <p className="mt-1 text-xs text-slate-400">Calculated durations</p>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'project' && (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Projects
                </span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {isLoading ? '--' : summary.project.totalProjects}
                </div>
                <p className="mt-1 text-xs text-slate-400">Database tenders</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Active Execution
                </span>
                <div className="mt-1 text-2xl font-extrabold text-emerald-600">
                  {isLoading ? '--' : summary.project.activeProjects}
                </div>
                <p className="mt-1 text-xs text-emerald-600">Active / In Progress</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Tender Budget
                </span>
                <div className="mt-1 text-2xl font-extrabold text-sky-700">
                  {isLoading ? '--' : money(summary.project.totalBudget)}
                </div>
                <p className="mt-1 text-xs text-slate-400">Allocated budget sum</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Avg Milestone Progress
                </span>
                <div className="mt-1 text-2xl font-extrabold text-indigo-700">
                  {isLoading ? '--%' : `${summary.project.avgProgress}%`}
                </div>
                <p className="mt-1 text-xs text-slate-400">Across all projects</p>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'contractor' && (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Contractors
                </span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {isLoading ? '--' : summary.contractor.totalContractors}
                </div>
                <p className="mt-1 text-xs text-slate-400">Registered entities</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  With Assigned Tenders
                </span>
                <div className="mt-1 text-2xl font-extrabold text-amber-600">
                  {isLoading ? '--' : summary.contractor.contractorsWithProjects}
                </div>
                <p className="mt-1 text-xs text-amber-600">Engaged contractors</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm lg:col-span-2">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Contracted Portfolio
                </span>
                <div className="mt-1 text-2xl font-extrabold text-emerald-700">
                  {isLoading ? '--' : money(summary.contractor.totalPortfolioBudget)}
                </div>
                <p className="mt-1 text-xs text-slate-400">Cumulative budget allocated to vendor partners</p>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'employee' && (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Staff
                </span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {isLoading ? '--' : summary.employee.totalEmployees}
                </div>
                <p className="mt-1 text-xs text-slate-400">Personnel count</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Punches Logged
                </span>
                <div className="mt-1 text-2xl font-extrabold text-indigo-600">
                  {isLoading ? '--' : summary.employee.totalAttendances}
                </div>
                <p className="mt-1 text-xs text-indigo-600">Cumulative attendances</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm lg:col-span-2">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Leaves Filed
                </span>
                <div className="mt-1 text-2xl font-extrabold text-orange-600">
                  {isLoading ? '--' : summary.employee.totalLeaves}
                </div>
                <p className="mt-1 text-xs text-slate-400">Absence applications on file</p>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'leave' && (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Applications
                </span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {isLoading ? '--' : summary.leave.totalLeaves}
                </div>
                <p className="mt-1 text-xs text-slate-400">Total leaves recorded</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Approved
                </span>
                <div className="mt-1 text-2xl font-extrabold text-emerald-600">
                  {isLoading ? '--' : summary.leave.approved}
                </div>
                <p className="mt-1 text-xs text-emerald-600">Signed off</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Pending Review
                </span>
                <div className="mt-1 text-2xl font-extrabold text-amber-600">
                  {isLoading ? '--' : summary.leave.pending}
                </div>
                <p className="mt-1 text-xs text-amber-600">Awaiting approval</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Rejected
                </span>
                <div className="mt-1 text-2xl font-extrabold text-rose-600">
                  {isLoading ? '--' : summary.leave.rejected}
                </div>
                <p className="mt-1 text-xs text-rose-600">Declined leaves</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      )}

      {/* Comprehensive Filter Bar & Date Range Selection */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-3.5">
          {/* Top Row: Search + Quick Date Presets */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={`Search in ${REPORT_TABS.find((t) => t.id === activeTab)?.label}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {allowedFilters.dates && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Date Range:
              </span>
              {['ALL', 'TODAY', 'WEEK', 'MONTH', 'CUSTOM'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyDatePreset(preset)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    datePreset === preset
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset === 'ALL'
                    ? 'All Time'
                    : preset === 'TODAY'
                    ? 'Today'
                    : preset === 'WEEK'
                    ? 'Last 7 Days'
                    : preset === 'MONTH'
                    ? 'Last 30 Days'
                    : 'Custom'}
                </button>
              ))}
            </div>
            )}
          </div>

          {(allowedFilters.dates || allowedFilters.status || allowedFilters.department || allowedFilters.site || allowedFilters.contractor || allowedFilters.employee) && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5 pt-2 border-t border-slate-100 text-xs">
            {allowedFilters.dates && (
            <div className="flex items-center gap-1.5 col-span-1 sm:col-span-2 lg:col-span-2">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">End date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
            )}

            {allowedFilters.status && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none bg-white"
              >
                <option value="ALL">All statuses</option>
                {allowedFilters.status === 'attendance' && (
                  <>
                    <option value="ACTIVE">Active in field</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="FLAGGED">Flagged</option>
                  </>
                )}
                {allowedFilters.status === 'project' && (
                  <>
                    <option value="ACTIVE">Active</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="PLANNING">Planning</option>
                    <option value="COMPLETED">Completed</option>
                  </>
                )}
                {allowedFilters.status === 'leave' && (
                  <>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </>
                )}
              </select>
            </div>
            )}

            {allowedFilters.department && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none bg-white"
              >
                <option value="ALL">All departments</option>
                {filterOptions.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            )}

            {allowedFilters.site && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Site</label>
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none bg-white"
              >
                <option value="ALL">All sites</option>
                {filterOptions.sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            )}

            {allowedFilters.contractor && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Contractor</label>
              <select
                value={selectedContractor}
                onChange={(e) => setSelectedContractor(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none bg-white"
              >
                <option value="ALL">All contractors</option>
                {filterOptions.contractors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            )}

            {allowedFilters.employee && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Staff</label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none bg-white"
              >
                <option value="ALL">All staff</option>
                {filterOptions.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.employeeCode})</option>
                ))}
              </select>
            </div>
            )}
          </div>
          )}
        </CardContent>
      </Card>

      {/* 1. ATTENDANCE REPORT TABLE */}
      {activeTab === 'attendance' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              {isLoading && !currentTableData.length ? 'Loading report…' : <>Showing <strong>{currentTableData.length}</strong> attendance records</>}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Working hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            {isLoading ? (
              <TableLoadingState message="Loading report rows…" rows={5} cols={7} />
            ) : currentTableData.length === 0 ? (
              <TableEmptyState
                title="No attendance records found"
                description="Try broadening your date selection, site filter, or search term."
                colSpan={7}
                action={
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    Reset Filters
                  </Button>
                }
              />
            ) : (
              <TableBody>
                {currentTableData.map((rec) => {
                  const isCompleted = rec.status === 'COMPLETED';
                  const isFlagged = rec.status === 'FLAGGED';
                  const statusClass = isFlagged
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : isCompleted
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : 'bg-cyan-100 text-cyan-800 border-cyan-200';

                  return (
                    <TableRow key={rec.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{rec.employee}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {rec.employeeCode} • {rec.department}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-700">{rec.site}</TableCell>
                      <TableCell className="text-slate-700 whitespace-nowrap">
                        {formatDate(rec.date)}
                      </TableCell>
                      <TableCell className="font-mono text-slate-800">
                        {formatTime(rec.checkIn)}
                      </TableCell>
                      <TableCell className="font-mono text-slate-800">
                        {rec.checkOut ? formatTime(rec.checkOut) : (
                          <span className="text-cyan-700 italic">In Progress</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {rec.workingHours}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${statusClass}`}>
                          {rec.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            )}
          </Table>
        </div>
      )}

      {/* 2. PROJECT REPORT TABLE */}
      {activeTab === 'project' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              {isLoading && !currentTableData.length ? 'Loading report…' : <>Showing <strong>{currentTableData.length}</strong> projects & tenders</>}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Contractor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
              </TableRow>
            </TableHeader>

            {isLoading ? (
              <TableLoadingState message="Loading report rows…" rows={5} cols={8} />
            ) : currentTableData.length === 0 ? (
              <TableEmptyState
                title="No projects match criteria"
                description="Try clearing the status or contractor filter to view all project tenders."
                colSpan={8}
                action={
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    Reset Filters
                  </Button>
                }
              />
            ) : (
              <TableBody>
                {currentTableData.map((p) => {
                  const isCompleted = p.status === 'COMPLETED' || p.progress >= 100;
                  const isActive = p.status === 'ACTIVE' || p.status === 'IN_PROGRESS';
                  const badgeClass = isCompleted
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : isActive
                    ? 'bg-sky-100 text-sky-800 border-sky-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200';

                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{p.project}</div>
                        {p.tenderId && p.tenderId !== 'N/A' && (
                          <span className="text-[11px] font-mono text-slate-400">
                            {p.tenderId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 text-xs">{p.department}</TableCell>
                      <TableCell className="text-slate-600 text-xs">{p.contractor}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${badgeClass}`}>
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full bg-sky-600 rounded-full"
                              style={{ width: `${Math.min(100, p.progress)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-700">{p.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900 whitespace-nowrap">
                        {money(p.budget)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        {formatDate(p.startDate)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        {formatDate(p.endDate)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            )}
          </Table>
        </div>
      )}

      {/* 3. CONTRACTOR REPORT TABLE */}
      {activeTab === 'contractor' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              {isLoading && !currentTableData.length ? 'Loading report…' : <>Showing <strong>{currentTableData.length}</strong> contractor entities</>}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contractor</TableHead>
                <TableHead>Total Projects</TableHead>
                <TableHead>Active Projects</TableHead>
                <TableHead>Completed Projects</TableHead>
                <TableHead>Total Project Budget</TableHead>
              </TableRow>
            </TableHeader>

            {isLoading ? (
              <TableLoadingState message="Loading report rows…" rows={4} cols={5} />
            ) : currentTableData.length === 0 ? (
              <TableEmptyState
                title="No contractor records found"
                description="No contractor matches the active search query."
                colSpan={5}
                action={
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    Reset Filters
                  </Button>
                }
              />
            ) : (
              <TableBody>
                {currentTableData.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-bold text-slate-900">{c.contractor}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {c.phone !== 'N/A' && `Ph: ${c.phone}`}
                        {c.description && ` • ${c.description}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800">
                        {c.totalProjects} {c.totalProjects === 1 ? 'Project' : 'Projects'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {c.activeProjects} Active
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-slate-600">
                      {c.completedProjects} Completed
                    </TableCell>
                    <TableCell className="font-extrabold text-sm text-slate-900">
                      {money(c.totalBudget)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}

      {/* 4. EMPLOYEE REPORT TABLE */}
      {activeTab === 'employee' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              {isLoading && !currentTableData.length ? 'Loading report…' : <>Showing <strong>{currentTableData.length}</strong> staff personnel</>}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Attendances</TableHead>
                <TableHead>Hours Logged</TableHead>
                <TableHead>Leave Summary</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            {isLoading ? (
              <TableLoadingState message="Loading report rows…" rows={4} cols={7} />
            ) : currentTableData.length === 0 ? (
              <TableEmptyState
                title="No employees found"
                description="Try clearing department filter or search criteria."
                colSpan={7}
                action={
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    Reset Filters
                  </Button>
                }
              />
            ) : (
              <TableBody>
                {currentTableData.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{e.employee}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {e.employeeCode} {e.email !== 'N/A' && `• ${e.email}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{e.department}</TableCell>
                    <TableCell className="text-xs text-slate-600">{e.designation}</TableCell>
                    <TableCell className="text-xs font-bold text-indigo-700">
                      {e.totalAttendances} check-ins
                    </TableCell>
                    <TableCell className="text-xs font-medium text-slate-800">
                      {e.totalHoursLogged} hrs
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">{e.totalLeaves}</span> filed (
                      <span className="text-emerald-600">{e.approvedLeaves} appv</span>,{' '}
                      <span className="text-amber-600">{e.pendingLeaves} pend</span>)
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        {e.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}

      {/* 5. LEAVE REPORT TABLE */}
      {activeTab === 'leave' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              {isLoading && !currentTableData.length ? 'Loading report…' : <>Showing <strong>{currentTableData.length}</strong> leave requests</>}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Leave Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Applied On</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            {isLoading ? (
              <TableLoadingState message="Loading report rows…" rows={4} cols={6} />
            ) : currentTableData.length === 0 ? (
              <TableEmptyState
                title="No leave requests match filter"
                description="All leave applications for this criteria have been resolved or none exist."
                colSpan={6}
                action={
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    Reset Filters
                  </Button>
                }
              />
            ) : (
              <TableBody>
                {currentTableData.map((l) => {
                  const isApproved = l.status === 'APPROVED';
                  const isPending = l.status === 'PENDING';
                  const badgeClass = isApproved
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : isPending
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-rose-100 text-rose-800 border-rose-200';

                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{l.employee}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {l.employeeCode} • {l.department}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-800 whitespace-nowrap">
                        {formatDate(l.leaveDate)}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-slate-800">
                        {l.duration} {l.duration === 1 ? 'Day' : 'Days'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-xs truncate" title={l.reason}>
                        {l.reason}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(l.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${badgeClass}`}>
                          {l.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            )}
          </Table>
        </div>
      )}
    </div>
  );
}
