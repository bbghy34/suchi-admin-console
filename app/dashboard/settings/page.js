'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Lock,
  LogOut,
  CheckCircle2,
  User,
  Clock,
  Monitor,
  RotateCcw,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import ModuleHeader from '@/components/layout/ModuleHeader';
import LoadingState from '@/components/ui/LoadingState';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import PasswordField from '@/components/ui/PasswordField';
import { passwordProblem } from '@/lib/password-policy.mjs';

const getAuthHeaders = () => {
  return { 'Content-Type': 'application/json' };
};

function SettingSwitch({ id, label, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3.5 last:border-b-0">
      <div className="min-w-0 pr-2">
        <label htmlFor={id} className="text-sm font-semibold text-slate-900">
          {label}
        </label>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="mt-0.5 inline-flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-full p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c6bc0] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)]"
        style={{ background: checked ? 'var(--md-primary)' : 'var(--md-border-strong)' }}
      >
        <span
          aria-hidden="true"
          className="block h-5 w-5 rounded-full shadow-sm transition-transform duration-200"
          style={{
            background: '#fff',
            transform: checked ? 'translateX(1.25rem)' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout, isLoading } = useAuth();
  const { prefs, setPref, resetPrefs } = usePreferences();
  const toast = useToast();

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handlePasswordChange = (field) => (value) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
    if (passwordErrors[field]) {
      setPasswordErrors((prev) => ({ ...prev, [field]: '' }));
    }
    setPasswordSuccess(false);
  };

  const validatePasswordForm = () => {
    const errors = {};
    if (!passwordForm.currentPassword) errors.currentPassword = 'Current password is required.';
    const problem = passwordProblem(passwordForm.newPassword);
    if (!passwordForm.newPassword) errors.newPassword = 'New password is required.';
    else if (problem) errors.newPassword = problem;
    else if (passwordForm.newPassword === passwordForm.currentPassword)
      errors.newPassword = 'New password must differ from current password.';
    if (!passwordForm.confirmPassword) errors.confirmPassword = 'Please confirm your new password.';
    else if (passwordForm.newPassword !== passwordForm.confirmPassword)
      errors.confirmPassword = 'Passwords do not match.';
    return errors;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const errors = validatePasswordForm();
    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    setIsSavingPassword(true);
    setPasswordErrors({});
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(passwordForm),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.field) setPasswordErrors({ [json.field]: json.message });
        else toast.error('Password not changed', json.message || 'Something went wrong.');
        return;
      }

      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password updated', 'Sign in again with the new password.');
      // A moment to read the confirmation; the session is already closed.
      setTimeout(() => window.location.assign('/login'), 1200);
    } catch {
      toast.error('Network Error', 'Could not connect to server. Please try again.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    if (prefs.confirmSignOut && !window.confirm('Sign out of this account?')) return;
    if (isSigningOut) return;
    setIsSigningOut(true);
    try { await logout(); } finally { setIsSigningOut(false); }
  };

  if (isLoading) return <LoadingState message="Loading settings…" description="Checking your account and available preferences." />;
  if (!user) return <p role="alert">Your session has ended. <Link href="/login" className="underline">Sign in again</Link> to manage settings.</p>;

  const roleName = user?.role === 'A' ? 'Administrator' : user?.role === 'AA' ? 'Accountant' : user?.role === 'M' ? 'Manager' : user?.role === 'T' ? 'Tender' : 'Employee';
  const roleColor = user?.role === 'A'
    ? 'bg-rose-100 text-rose-800 border-rose-200'
    : user?.role === 'M'
    ? 'bg-sky-100 text-sky-800 border-sky-200'
    : 'bg-emerald-100 text-emerald-800 border-emerald-200';

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <ModuleHeader
        icon={Settings}
        title="Settings"
        description="Browser preferences and account sign-in. Edit contact details in My Profile."
        help={<WorkflowGuide id="settings" />}
      />

      <nav aria-label="Settings sections" className="flex flex-wrap gap-4 text-sm font-semibold">
        <a href="#workspace-settings" className="text-mat-primary underline underline-offset-4">Workspace preferences</a>
        <a href="#account-settings" className="text-mat-primary underline underline-offset-4">Account and password</a>
        <Link href="/profile" className="text-mat-primary underline underline-offset-4">Edit my profile</Link>
      </nav>
      <Card id="workspace-settings" className="scroll-mt-24 border-slate-200/90 shadow-sm">
        <CardHeader className="p-6 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">Workspace</CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-0.5">
            Changes apply immediately—no Save button needed. Preferences are stored in this browser and shared by people who sign in here.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <p className="pt-2 text-xs font-semibold text-slate-500">Appearance</p>
          <SettingSwitch
            id="pref-theme"
            label="Dark theme"
            description="Indigo on a dark surface. Turn this off for a light workspace."
            checked={prefs.theme === 'dark'}
            onChange={(on) => setPref('theme', on ? 'dark' : 'light')}
          />
          <SettingSwitch
            id="pref-density"
            label="Compact layout"
            description="Reduces page padding and the height of table rows."
            checked={prefs.density === 'compact'}
            onChange={(on) => setPref('density', on ? 'compact' : 'comfortable')}
          />
          <SettingSwitch
            id="pref-text"
            label="Larger text"
            description="Increases the size of labels, tables, and form fields."
            checked={prefs.textSize === 'large'}
            onChange={(on) => setPref('textSize', on ? 'large' : 'default')}
          />
          <SettingSwitch
            id="pref-motion"
            label="Reduce motion"
            description="Stops animations and short transitions across the workspace."
            checked={prefs.reduceMotion}
            onChange={(on) => setPref('reduceMotion', on)}
          />

          <p className="pt-4 text-xs font-semibold text-slate-500">Interface</p>
          <SettingSwitch
            id="pref-help"
            label="Page help"
            description="Shows the Help control at the top of each page."
            checked={prefs.showHelp}
            onChange={(on) => setPref('showHelp', on)}
          />
          <SettingSwitch
            id="pref-rows"
            label="Striped tables"
            description="Shades every other row so long lists are easier to scan."
            checked={prefs.stripedRows}
            onChange={(on) => setPref('stripedRows', on)}
          />
          {user?.role === 'A' && (
            <SettingSwitch
              id="pref-stock"
              label="Stock alerts"
              description="Shows the low-stock notice in the top bar when a material is at its minimum."
              checked={prefs.showStockAlerts}
              onChange={(on) => setPref('showStockAlerts', on)}
            />
          )}
          <p className="pt-4 text-xs font-semibold text-slate-500">General</p>
          <SettingSwitch
            id="pref-signout"
            label="Confirm before sign out"
            description="Asks before ending the session from the top bar or from this page."
            checked={prefs.confirmSignOut}
            onChange={(on) => setPref('confirmSignOut', on)}
          />

          {(user?.role === 'A' || user?.role === 'M') && (
            <>
              <p className="pt-4 text-xs font-semibold text-slate-500">Panel</p>
              <SettingSwitch
                id="pref-tender-portal"
                label="Tender portal in the sidebar"
                description="Hidden until this is on. The page stays available at its address."
                checked={prefs.showTenderPortal}
                onChange={(on) => setPref('showTenderPortal', on)}
              />
              {user?.role === 'A' && (
                <SettingSwitch
                  id="pref-tender-upload"
                  label="Tender upload in the sidebar"
                  description="Hidden until this is on. Administrators can still open the upload page directly."
                  checked={prefs.showTenderUpload}
                  onChange={(on) => setPref('showTenderUpload', on)}
                />
              )}

              <p className="pt-4 text-xs font-semibold text-slate-500">Reports</p>
              <SettingSwitch
                id="pref-report-attendance"
                label="Attendance report"
                description="Shows the attendance tab on Reports."
                checked={prefs.reportAttendance}
                onChange={(on) => setPref('reportAttendance', on)}
              />
              <SettingSwitch
                id="pref-report-project"
                label="Project report"
                description="Shows the project tab on Reports."
                checked={prefs.reportProject}
                onChange={(on) => setPref('reportProject', on)}
              />
              <SettingSwitch
                id="pref-report-contractor"
                label="Contractor report"
                description="Shows the contractor tab on Reports."
                checked={prefs.reportContractor}
                onChange={(on) => setPref('reportContractor', on)}
              />
              <SettingSwitch
                id="pref-report-employee"
                label="Employee report"
                description="Shows the employee tab on Reports."
                checked={prefs.reportEmployee}
                onChange={(on) => setPref('reportEmployee', on)}
              />
              <SettingSwitch
                id="pref-report-leave"
                label="Leave report"
                description="Shows the leave tab on Reports."
                checked={prefs.reportLeave}
                onChange={(on) => setPref('reportLeave', on)}
              />
              <SettingSwitch
                id="pref-report-compact"
                label="Compact amounts"
                description="Shows large figures as lakh and crore. Turn off for the full rupee amount."
                checked={prefs.reportCompactAmounts}
                onChange={(on) => setPref('reportCompactAmounts', on)}
              />
              <SettingSwitch
                id="pref-report-summary"
                label="Report summary cards"
                description="Shows the totals above each report table."
                checked={prefs.reportSummary}
                onChange={(on) => setPref('reportSummary', on)}
              />
            </>
          )}
          <div className="flex justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!window.confirm('Reset all browser preferences, including appearance, sidebar, reports and sign-out confirmation?')) return;
                resetPrefs();
                toast.success('Preferences reset', 'All browser preferences have been restored to their defaults.');
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset all preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      <div id="account-settings" className="scroll-mt-24 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Account Info Panel */}
        <div className="space-y-4">
          <Card className="border-slate-200/90 shadow-sm">
            <CardContent className="p-5">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white text-2xl font-bold shadow-md">
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-base">{user?.name || 'Unknown User'}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{user?.email || '—'}</p>
                  <span className={`mt-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleColor}`}>
                    {roleName}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-2.5 text-sm border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <User className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-medium text-slate-900 truncate">{user?.name}</span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Monitor className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-slate-500 text-xs">
                    Employee code:{' '}
                    <span className="font-mono font-semibold text-slate-700">
                      {user?.employeeCode || 'Not assigned'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-slate-500 text-xs">Session active</span>
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Session Management Card */}
          <Card className="border-rose-100 shadow-sm bg-rose-50/40">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                  <LogOut className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">Sign out</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    End your current session and return to the login screen.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                isLoading={isSigningOut}
                loadingLabel="Signing out…"
                className="mt-4 w-full border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                Sign out of this device
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Change Password Card */}
        <div className="lg:col-span-2">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Password</CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Changing it signs you out on every device. Sign in again with the new password.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <form onSubmit={handleChangePassword}>
              <CardContent className="p-6 space-y-5">
                {passwordSuccess && (
                  <div role="status" className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="font-medium">Password changed. Taking you to sign in…</span>
                  </div>
                )}

                <PasswordField
                  id="currentPassword"
                  label="Current password"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordChange('currentPassword')}
                  placeholder="Your current password"
                  autoComplete="current-password"
                  error={passwordErrors.currentPassword}
                />

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <PasswordField
                    id="newPassword"
                    label="New password"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange('newPassword')}
                    placeholder="At least 8 characters"
                    error={passwordErrors.newPassword}
                    showStrength
                  />
                  <PasswordField
                    id="confirmPassword"
                    label="Confirm new password"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange('confirmPassword')}
                    placeholder="Type it again"
                    error={passwordErrors.confirmPassword}
                  />
                </div>

                <p className="text-xs leading-5 text-slate-500">
                  A long phrase is easier to remember and harder to guess than a short mix of symbols. Don't reuse a password from another site.
                </p>
              </CardContent>

              <CardFooter className="justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSavingPassword}
                  loadingLabel="Updating password…"
                  disabled={isSavingPassword || passwordSuccess}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Update password
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
