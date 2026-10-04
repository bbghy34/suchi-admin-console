'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Users,
  HardHat,
  MapPin,
  Clock,
  CalendarClock,
  Activity,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  Phone,
  LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
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

// Currency formatter for Indian Rupees
function formatINR(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
  const num = Number(amount);
  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(2)} Cr`;
  } else if (num >= 100000) {
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
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return 'Invalid date';
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

export default function DashboardPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [loadedFor, setLoadedFor] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const activeRequest = useRef(null);

  // Live database state
  const [dashboardData, setDashboardData] = useState({
    kpis: {
      totalEmployees: 0,
      totalContractors: 0,
      totalProjects: 0,
      activeProjects: 0,
      totalSites: 0,
      todayAttendance: 0,
      pendingLeaves: 0,
    },
    recentProjects: [],
    recentAttendance: [],
    pendingLeaves: [],
    projectProgress: {
      projects: [],
      averageProgress: 0,
      completedProjectsCount: 0,
      activeProjectsCount: 0,
      planningProjectsCount: 0,
      totalProjectsCount: 0,
    },
    contractorProjectSummary: [],
  });
  const [unauthorizedNotice, setUnauthorizedNotice] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('unauthorized') === 'true') {
        setUnauthorizedNotice(true);
      }
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (isAuthLoading || !user?.id) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 20_000);
    setIsLoadingData(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/dashboard', { headers, signal: controller.signal, cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data?.kpis) {
        throw new Error(json.message || 'Unable to load your dashboard. Please try again.');
      }
      if (controller.signal.aborted) return;
      setDashboardData(json.data);
      setLoadedFor(user.id);
      setUpdatedAt(new Date());
    } catch (err) {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
      setError(controller.signal.reason === 'timeout'
        ? 'Loading took too long. Please try again.'
        : err.message || 'Unable to load your dashboard. Please try again.');
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsLoadingData(false);
      }
    }
  }, [isAuthLoading, user?.id]);

  useEffect(() => {
    if (!isAuthLoading && user?.id) loadDashboardData();
    return () => activeRequest.current?.abort();
  }, [isAuthLoading, user?.id, loadDashboardData]);

  // Wait for real data before presenting counts or empty states.
  if (isAuthLoading || (user && loadedFor !== user.id)) {
    return <div className="space-y-5">
      <ModuleHeader icon={LayoutDashboard} title="Dashboard" description="Your latest work and attendance overview." />
      {error && !isLoadingData ? <div role="alert" className="rounded-xl border border-mat-border bg-mat-surface p-5 space-y-3">
        <p className="text-sm text-mat-on">{error}</p>
        <Button variant="outline" onClick={loadDashboardData}>Try again</Button>
      </div> : <div role="status" aria-live="polite" className="rounded-xl border border-mat-border bg-mat-surface p-6">
        <div className="flex items-center gap-3 text-sm text-mat-muted"><RefreshCw className="h-4 w-4 animate-spin" />Loading your dashboard…</div>
      </div>}
    </div>;
  }
  if (!user) {
    return <div className="space-y-4"><ModuleHeader icon={LayoutDashboard} title="Dashboard" description="Sign in to view your dashboard." />
      <Link href="/login"><Button>Sign in</Button></Link>
    </div>;
  }

  const {
    kpis,
    recentProjects,
    recentAttendance,
    pendingLeaves,
    projectProgress,
    contractorProjectSummary,
  } = dashboardData;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Welcome Banner */}
      <ModuleHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="People on the books, work underway, and the one queue that needs a decision."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            isLoading={isLoadingData}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoadingData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        }
      />

      {updatedAt ? <p className="text-xs text-mat-dim" role="status">{isLoadingData ? 'Refreshing your dashboard…' : `Updated ${formatTime(updatedAt)}`}</p> : null}

      {/* Error Alert Banner */}
      {error && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl p-4" style={{ background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.25)', color: '#ef9a9a' }}>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" style={{ color: '#ef5350' }} />
            <div className="text-sm">
              <span className="font-semibold">Could not refresh:</span> {error} Previously loaded data is still shown.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            style={{ color: '#ef5350', borderColor: 'rgba(239,83,80,0.4)' }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Unauthorized Redirect Alert Notice */}
      {unauthorizedNotice && (
        <div className="flex items-center justify-between gap-3 rounded-xl p-4" style={{ background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.25)', color: '#ef9a9a' }}>
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" style={{ color: '#ef5350' }} />
            <div className="text-sm">
              <span className="font-semibold">Access Restricted (403):</span> You attempted to access a section that requires elevated permissions. You have been safely returned to your authorized dashboard.
            </div>
          </div>
          <button
            onClick={() => setUnauthorizedNotice(false)}
            className="text-xs font-bold hover:underline shrink-0"
            style={{ color: '#ef5350' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Conditional Dashboard: Employee Portal View vs Executive Operations View */}
      {(user?.role === 'E' || user?.role === 'AA' || dashboardData?.isEmployee) ? (
        <div className="space-y-8">
          {/* Employee KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-mat-dim">Today's Shift</span>
                  <div className="flex h-8 w-8 rounded-lg items-center justify-center" style={{ background: 'rgba(102,187,106,0.12)', color: '#66bb6a' }}>
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-bold text-mat-on">
                  {kpis.todayStatus || 'Not Checked In'}
                </div>
                <p className="mt-1 text-xs text-mat-dim">
                  {kpis.checkedInTime ? `Checked in: ${formatTime(kpis.checkedInTime)}` : 'No punch recorded today'}
                </p>
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-mat-dim">Monthly Shifts</span>
                  <div className="flex h-8 w-8 rounded-lg items-center justify-center" style={{ background: 'rgba(41,182,246,0.12)', color: '#29b6f6' }}>
                    <Activity className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold text-mat-on font-mono">
                  {kpis.monthlyAttendance || 0}
                </div>
                <p className="mt-1 text-xs text-mat-dim">Attendance records this month</p>
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-mat-dim">Pending Leaves</span>
                  <div className="flex h-8 w-8 rounded-lg items-center justify-center" style={{ background: 'rgba(255,167,38,0.12)', color: '#ffa726' }}>
                    <CalendarClock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold text-mat-on font-mono">
                  {kpis.pendingLeaves || 0}
                </div>
                <p className="mt-1 text-xs text-mat-dim">Awaiting management approval</p>
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-mat-dim">Approved Leaves</span>
                  <div className="flex h-8 w-8 rounded-lg items-center justify-center" style={{ background: 'rgba(92,107,192,0.12)', color: '#7986cb' }}>
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold text-mat-on font-mono">
                  {kpis.approvedLeaves || 0}
                </div>
                <p className="mt-1 text-xs text-mat-dim">Authorized time-off requests</p>
              </CardContent>
            </Card>
          </div>

          {/* Employee Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/attendance">
              <div className="rounded-xl p-4 transition-colors flex items-center justify-between group" style={{ border: '1px solid rgba(102,187,106,0.25)', background: 'rgba(102,187,106,0.06)' }} onMouseOver={e=>e.currentTarget.style.background='rgba(102,187,106,0.1)'} onMouseOut={e=>e.currentTarget.style.background='rgba(102,187,106,0.06)'}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold shadow-sm shadow-emerald-600/30">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-mat-on">My Attendance</h4>
                    <p className="text-xs text-mat-dim">View attendance and check-ins from the mobile app</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" style={{ color: '#66bb6a' }} />
              </div>
            </Link>

            <Link href="/leaves">
              <div className="rounded-xl p-4 transition-colors flex items-center justify-between group" style={{ border: '1px solid rgba(41,182,246,0.25)', background: 'rgba(41,182,246,0.06)' }} onMouseOver={e=>e.currentTarget.style.background='rgba(41,182,246,0.1)'} onMouseOut={e=>e.currentTarget.style.background='rgba(41,182,246,0.06)'}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold" style={{ background: '#0288d1', boxShadow: '0 2px 8px rgba(2,136,209,0.3)' }}>
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-mat-on">Request Leave</h4>
                    <p className="text-xs text-mat-dim">Submit planned leave applications</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" style={{ color: '#29b6f6' }} />
              </div>
            </Link>

            <Link href="/profile">
              <div className="rounded-xl p-4 transition-colors flex items-center justify-between group" style={{ border: '1px solid rgba(92,107,192,0.25)', background: 'rgba(92,107,192,0.06)' }} onMouseOver={e=>e.currentTarget.style.background='rgba(92,107,192,0.1)'} onMouseOut={e=>e.currentTarget.style.background='rgba(92,107,192,0.06)'}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold" style={{ background: '#5c6bc0', boxShadow: '0 2px 8px rgba(92,107,192,0.3)' }}>
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-mat-on">My Profile</h4>
                    <p className="text-xs text-mat-dim">Update personal contact &amp; KYC data</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" style={{ color: '#7986cb' }} />
              </div>
            </Link>
          </div>

          {/* Tables: Recent Attendance & Leaves */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* My Recent Attendance */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--md-border)', background: 'var(--md-surface)' }}>
              <div className="flex items-center justify-between p-4 sm:p-5" style={{ borderBottom: '1px solid var(--md-border)' }}>
                <h3 className="font-bold text-mat-on flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" style={{ color: '#29b6f6' }} />
                  Recent Attendance Logs
                </h3>
                <Link href="/attendance" className="text-xs font-semibold" style={{ color: '#7986cb' }}>View All</Link>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Check-In</TableHead>
                    <TableHead>Check-Out</TableHead>
                    <TableHead>Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!recentAttendance || recentAttendance.length === 0) ? (
                    <TableEmptyState message="No attendance logs recorded yet." colSpan={4} />
                  ) : (
                    recentAttendance.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell className="font-medium text-xs">{formatDate(rec.checkInTime)}</TableCell>
                        <TableCell className="text-xs">{formatTime(rec.checkInTime)}</TableCell>
                        <TableCell className="text-xs">{formatTime(rec.checkOutTime)}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-mat-muted">
                          {rec.workingHoursText || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* My Recent Leaves */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--md-border)', background: 'var(--md-surface)' }}>
              <div className="flex items-center justify-between p-4 sm:p-5" style={{ borderBottom: '1px solid var(--md-border)' }}>
                <h3 className="font-bold text-mat-on flex items-center gap-2 text-sm">
                  <CalendarClock className="h-4 w-4" style={{ color: '#ffa726' }} />
                  My Leave Requests
                </h3>
                <Link href="/leaves" className="text-xs font-semibold" style={{ color: '#7986cb' }}>View All</Link>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!dashboardData.recentLeaves || dashboardData.recentLeaves.length === 0) ? (
                    <TableEmptyState message="No leave requests filed yet." colSpan={4} />
                  ) : (
                    dashboardData.recentLeaves.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium text-xs">{formatDate(l.leaveDate)}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate" title={l.reason}>{l.reason}</TableCell>
                        <TableCell className="text-xs">{l.duration} day(s)</TableCell>
                        <TableCell className="text-xs">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold`}
                            style={
                              l.status === 'APPROVED'
                                ? { background: 'rgba(102,187,106,0.12)', color: '#66bb6a' }
                                : l.status === 'REJECTED'
                                ? { background: 'rgba(239,83,80,0.12)', color: '#ef5350' }
                                : { background: 'rgba(255,167,38,0.12)', color: '#ffa726' }
                            }
                          >
                            {l.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 7 Required Primary Metrics Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-7">
            {/* 1. Total Employees */}
            <Link href="/employees" className="group">
          <Card className="h-full border-mat-border transition-colors duration-200 hover:border-[#7986cb]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-mat-muted">
                  Employees
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ background: 'rgba(92,107,192,0.15)', color: '#7986cb' }}>
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-mat-on">
                {isLoadingData ? (
                  <div className="h-7 w-12 rounded bg-mat-surface3 animate-pulse" />
                ) : (
                  kpis.totalEmployees
                )}
              </div>
              <p className="mt-1 text-[11px] text-mat-dim">On the team</p>
            </CardContent>
          </Card>
        </Link>

        {/* 2. Total Contractors */}
        <Link href="/contractors" className="group">
          <Card className="h-full border-mat-border transition-colors duration-200 hover:border-[#7986cb]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-mat-muted">
                  Contractors
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(92,107,192,0.15)', color: '#7986cb' }}>
                  <HardHat className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-mat-on">
                {isLoadingData ? (
                  <div className="h-7 w-12 rounded bg-mat-surface3 animate-pulse" />
                ) : (
                  kpis.totalContractors
                )}
              </div>
              <p className="mt-1 text-[11px] text-mat-dim">On record</p>
            </CardContent>
          </Card>
        </Link>

        {/* 3. Total Projects */}
        <Link href="/projects" className="group">
          <Card className="h-full border-mat-border transition-colors duration-200 hover:border-[#7986cb]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-mat-muted">
                  Projects
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(92,107,192,0.15)', color: '#7986cb' }}>
                  <Briefcase className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-mat-on">
                {isLoadingData ? (
                  <div className="h-7 w-12 rounded bg-mat-surface3 animate-pulse" />
                ) : (
                  kpis.totalProjects
                )}
              </div>
              <p className="mt-1 text-[11px] text-mat-dim">All projects</p>
            </CardContent>
          </Card>
        </Link>

        {/* 4. Active Projects */}
        <Link href="/projects" className="group">
          <Card className="h-full border-mat-border transition-colors duration-200 hover:border-[#7986cb]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-mat-muted">
                  Active projects
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ background: 'rgba(102,187,106,0.12)', color: '#66bb6a' }}>
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: '#81c784' }}>
                {isLoadingData ? (
                  <div className="h-7 w-12 rounded bg-mat-surface3 animate-pulse" />
                ) : (
                  kpis.activeProjects
                )}
              </div>
              <p className="mt-1 text-[11px] text-emerald-600 font-medium">Currently underway</p>
            </CardContent>
          </Card>
        </Link>

        {/* 5. Total Sites */}
        <Link href="/sites" className="group">
          <Card className="h-full border-mat-border transition-colors duration-200 hover:border-[#7986cb]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-mat-muted">
                  Sites
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(92,107,192,0.15)', color: '#7986cb' }}>
                  <MapPin className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-mat-on">
                {isLoadingData ? (
                  <div className="h-7 w-12 rounded bg-mat-surface3 animate-pulse" />
                ) : (
                  kpis.totalSites
                )}
              </div>
              <p className="mt-1 text-[11px] text-mat-dim">Work locations</p>
            </CardContent>
          </Card>
        </Link>

        {/* 6. Today's Attendance */}
        <Link href="/attendance" className="group">
          <Card className="h-full border-mat-border transition-colors duration-200 hover:border-[#7986cb]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-mat-muted">
                  Check-ins today
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(92,107,192,0.15)', color: '#7986cb' }}>
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-mat-on">
                {isLoadingData ? (
                  <div className="h-7 w-12 rounded bg-mat-surface3 animate-pulse" />
                ) : (
                  kpis.todayAttendance
                )}
              </div>
              <p className="mt-1 text-[11px] text-mat-dim">From the phone app</p>
            </CardContent>
          </Card>
        </Link>

        {/* 7. Pending Leaves */}
        <Link href="/leaves" className="group">
          <Card className="h-full border-mat-border transition-colors duration-200 hover:border-[#7986cb]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-mat-muted">
                  Leave requests
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ background: 'rgba(255,152,0,0.12)', color: '#ffa726' }}>
                  <CalendarClock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: '#ffcc80' }}>
                {isLoadingData ? (
                  <div className="h-7 w-12 rounded bg-mat-surface3 animate-pulse" />
                ) : (
                  <>
                    <span>{kpis.pendingLeaves}</span>
                    {kpis.pendingLeaves > 0 && (
                      <span className="text-[10px] uppercase font-bold bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                        Action
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="mt-1 text-[11px] text-mat-dim">Waiting for approval</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Middle Section: Project Progress & Contractor Project Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Project Progress (7 columns on large screens) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="h-full border-mat-border shadow-sm flex flex-col">
            <CardHeader className="p-5 border-b border-mat-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-mat-on flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-sky-600" />
                    Project Progress Overview
                  </CardTitle>
                  <CardDescription className="text-xs text-mat-muted mt-0.5">
                    How far each open project has moved.
                  </CardDescription>
                </div>
                <Link href="/projects">
                  <Button variant="ghost" size="sm" className="text-xs font-semibold text-sky-700">
                    All Projects
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>

              {/* Progress Key Stats Bar */}
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg p-3 text-center" style={{ background: 'var(--md-sidebar)', border: '1px solid var(--md-border)' }}>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-mat-dim">Avg Completion</span>
                  <div className="text-lg font-bold text-mat-on">
                    {isLoadingData ? '--%' : `${projectProgress.averageProgress}%`}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-mat-dim">In Progress</span>
                  <div className="text-lg font-bold text-emerald-600">
                    {isLoadingData ? '--' : projectProgress.activeProjectsCount}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-mat-dim">Planning</span>
                  <div className="text-lg font-bold text-sky-600">
                    {isLoadingData ? '--' : projectProgress.planningProjectsCount}
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5 flex-1 flex flex-col justify-between">
              {isLoadingData ? (
                <div className="space-y-4 py-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2 animate-pulse">
                      <div className="flex justify-between">
                        <div className="h-4 w-48 rounded bg-mat-surface3" />
                        <div className="h-4 w-12 rounded bg-mat-surface3" />
                      </div>
                      <div className="h-2 w-full rounded bg-mat-surface3" />
                    </div>
                  ))}
                </div>
              ) : projectProgress.projects.length === 0 ? (
                <div className="py-8 text-center text-xs text-mat-dim">
                  No projects currently found in database.
                </div>
              ) : (
                <div className="space-y-4">
                  {projectProgress.projects.slice(0, 4).map((p) => {
                    const progressVal = Math.min(100, Math.max(0, p.progress || 0));
                    return (
                      <div key={p.id} className="rounded-lg p-3 transition-colors" style={{ background: 'var(--md-surface2)', border: '1px solid var(--md-border)' }} onMouseOver={e => e.currentTarget.style.borderColor='var(--md-border-strong)'} onMouseOut={e => e.currentTarget.style.borderColor='var(--md-border)'}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="font-semibold text-mat-on truncate max-w-[280px]">
                            {p.name}
                          </div>
                          <span className="font-bold text-mat-on">{progressVal}%</span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--md-surface3)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${progressVal}%`, background: '#7986cb' }}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-mat-muted">
                          <span className="truncate max-w-[180px]">
                            {p.contractor !== 'Unassigned' ? p.contractor : p.department}
                          </span>
                          <span className="font-medium text-mat-muted">
                            {formatINR(p.budget)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Contractor Project Summary (5 columns on large screens) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="h-full border-mat-border shadow-sm flex flex-col">
            <CardHeader className="p-5 border-b border-mat-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-mat-on flex items-center gap-2">
                    <HardHat className="h-4 w-4 text-amber-600" />
                    Contractor Project Summary
                  </CardTitle>
                  <CardDescription className="text-xs text-mat-muted mt-0.5">
                    Who is carrying work, and how much of it.
                  </CardDescription>
                </div>
                <Link href="/contractors">
                  <Button variant="ghost" size="sm" className="text-xs font-semibold text-amber-700">
                    Directory
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>

            <CardContent className="p-5 flex-1 flex flex-col justify-between">
              {isLoadingData ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--md-surface2)' }} />
                  ))}
                </div>
              ) : contractorProjectSummary.length === 0 ? (
                <div className="py-8 text-center text-xs text-mat-dim">
                  No contractors found in database.
                </div>
              ) : (
                <div className="space-y-3">
                  {contractorProjectSummary.slice(0, 4).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg p-3 transition-all"
                      style={{ background: 'var(--md-surface2)', border: '1px solid var(--md-border)' }}
                      onMouseOver={e => e.currentTarget.style.borderColor='var(--md-border-strong)'}
                      onMouseOut={e => e.currentTarget.style.borderColor='var(--md-border)'}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs font-bold text-mat-on">{c.name}</div>
                          {c.phoneNo !== 'N/A' && (
                            <div className="text-[11px] text-mat-dim flex items-center gap-1 mt-0.5">
                              <Phone className="h-2.5 w-2.5" />
                              {c.phoneNo}
                            </div>
                          )}
                        </div>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums" style={{ background: 'var(--md-surface2)', color: 'var(--md-muted)' }}>
                          {c.totalProjects} {c.totalProjects === 1 ? 'Project' : 'Projects'}
                        </span>
                      </div>

                      {/* Financial Value & Active Projects */}
                      <div className="mt-2.5 flex items-center justify-between text-[11px] pt-2" style={{ borderTop: '1px solid var(--md-border)', color: 'var(--md-muted)' }}>
                        <span>Total Portfolio:</span>
                        <span className="font-semibold text-mat-on">{formatINR(c.totalBudget)}</span>
                      </div>

                      {c.projectNames && c.projectNames.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {c.projectNames.slice(0, 2).map((pName, idx) => (
                            <span
                              key={idx}
                              className="inline-block max-w-[200px] truncate rounded px-1.5 py-0.5 text-[9px] font-medium"
                              style={{ background: 'var(--md-surface3)', color: 'var(--md-muted)', border: '1px solid var(--md-border-strong)' }}
                            >
                              {pName}
                            </span>
                          ))}
                          {c.projectNames.length > 2 && (
                            <span className="text-[9px] text-mat-dim self-center">
                              +{c.projectNames.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Recent Projects Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-mat-on flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-sky-600" />
              Recent Projects & Tenders
            </h2>
            <p className="text-xs text-mat-muted">
              Latest records, with the tender id under the name.
            </p>
          </div>
          <Link href="/projects">
            <Button variant="outline" size="sm">
              <span>View All Projects</span>
              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project / Tender</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Contractor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          {isLoadingData ? (
            <TableLoadingState rows={4} cols={7} />
          ) : recentProjects.length === 0 ? (
            <TableEmptyState
              title="No projects found in database"
              description="Create a project to start tracking its progress, sites and budget."
              colSpan={7}
              action={
                <Link href="/projects">
                  <Button size="sm" variant="primary">
                    <Plus className="h-4 w-4 mr-1.5" />
                    <span>Create Project</span>
                  </Button>
                </Link>
              }
            />
          ) : (
            <TableBody>
              {recentProjects.map((item) => {
                const statusKey = String(item.status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
                const isCompleted = statusKey === 'COMPLETED' || item.progress >= 100;
                const isActive = !isCompleted && ['ACTIVE', 'IN_PROGRESS', 'ONGOING'].includes(statusKey);
                const badgeStyle = isCompleted
                  ? { background: 'rgba(102,187,106,0.12)', color: '#66bb6a', border: '1px solid rgba(102,187,106,0.25)' }
                  : isActive
                  ? { background: 'rgba(41,182,246,0.12)', color: '#29b6f6', border: '1px solid rgba(41,182,246,0.25)' }
                  : { background: 'var(--md-surface3)', color: 'var(--md-muted)', border: '1px solid var(--md-border-strong)' };

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold text-mat-on">
                      <div>
                        <span>{item.name}</span>
                        {item.tenderId && item.tenderId !== 'N/A' && (
                          <span className="block text-[11px] font-mono text-mat-dim">
                            {item.tenderId}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-mat-muted">{item.department}</TableCell>
                    <TableCell className="text-xs text-mat-muted">{item.contractor}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold" style={badgeStyle}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: 'var(--md-surface3)' }}>
                          <div
                            className="h-full bg-sky-600 rounded-full"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-mat-muted">{item.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-xs text-mat-on">
                      {formatINR(item.budget)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/projects`}>
                        <Button variant="ghost" size="sm" className="text-xs">
                          Details
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          )}
        </Table>
      </div>

      {/* Bottom Grid: Recent Attendance & Pending Leaves */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Attendance */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-mat-on flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-600" />
                Recent Attendance Check-Ins
              </h2>
              <p className="text-xs text-mat-muted">
                The latest punches from the field.
              </p>
            </div>
            <Link href="/attendance">
              <Button variant="ghost" size="sm" className="text-xs font-semibold text-cyan-700">
                View All
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Site Location</TableHead>
                <TableHead>Check-In</TableHead>
                <TableHead>Method</TableHead>
              </TableRow>
            </TableHeader>

            {isLoadingData ? (
              <TableLoadingState rows={3} cols={4} />
            ) : recentAttendance.length === 0 ? (
              <TableEmptyState
                title="No attendance records yet"
                description="Field staff check-ins via biometric scanners or mobile GPS will record here in real time."
                colSpan={4}
                action={
                  <Link href="/attendance">
                    <Button size="sm" variant="outline">
                      Open Attendance Module
                    </Button>
                  </Link>
                }
              />
            ) : (
              <TableBody>
                {recentAttendance.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell>
                      <div className="font-semibold text-xs text-mat-on">
                        {rec.employeeName}
                      </div>
                      <div className="text-[10px] text-mat-dim font-mono">
                        {rec.employeeCode} • {rec.department}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-mat-muted">
                      {rec.siteName}
                    </TableCell>
                    <TableCell className="text-xs text-mat-muted font-mono">
                      {formatTime(rec.checkInTime)}
                    </TableCell>
                    <TableCell>
                      <span className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--md-surface3)', color: 'var(--md-muted)', border: '1px solid var(--md-border-strong)' }}>
                        {rec.method}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>

        {/* Pending Leaves */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-mat-on flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-orange-600" />
                Pending Leaves for Approval
              </h2>
              <p className="text-xs text-mat-muted">
                Requests still waiting for a yes or a no.
              </p>
            </div>
            <Link href="/leaves">
              <Button variant="ghost" size="sm" className="text-xs font-semibold text-orange-700">
                View All
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Leave Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>

            {isLoadingData ? (
              <TableLoadingState rows={3} cols={5} />
            ) : pendingLeaves.length === 0 ? (
              <TableEmptyState
                title="Zero pending leave requests"
                description="All leave requests have been reviewed and signed off. Outstanding requests will appear here."
                colSpan={5}
                action={
                  <Link href="/leaves">
                    <Button size="sm" variant="outline">
                      Go to Leaves Module
                    </Button>
                  </Link>
                }
              />
            ) : (
              <TableBody>
                {pendingLeaves.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-semibold text-xs text-mat-on">
                        {l.employeeName}
                      </div>
                      <div className="text-[10px] text-mat-dim">
                        {l.employeeCode} • {l.designation}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-mat-muted whitespace-nowrap">
                      {formatDate(l.leaveDate)}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-mat-muted">
                      {l.duration} {l.duration === 1 ? 'Day' : 'Days'}
                    </TableCell>
                    <TableCell className="text-xs text-mat-muted max-w-[150px] truncate" title={l.reason}>
                      {l.reason}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href="/leaves">
                        <Button variant="outline" size="sm" className="text-[11px] h-7 px-2 border-orange-200 text-orange-700 hover:bg-orange-50">
                          Review
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

