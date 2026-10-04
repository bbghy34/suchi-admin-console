'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Mail,
  Phone,
  Building2,
  Award,
  Shield,
  MapPin,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  FileCheck,
  RefreshCw,
  Landmark,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ModuleHeader from '@/components/layout/ModuleHeader';
import { useToast } from '@/components/providers/ToastProvider';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { validatePhone } from '@/lib/validation';

/** Show only the last four digits of a bank account number. */
function maskAccount(value) {
  const text = String(value || '').replace(/\s+/g, '');
  if (!text) return '';
  if (text.length <= 4) return '•'.repeat(text.length);
  return `•••• ${text.slice(-4)}`;
}

function profileFields(data = {}) {
  let bank = data.bankDetails;
  if (typeof bank === 'string') {
    const legacy = bank;
    try { bank = JSON.parse(bank); } catch { bank = null; }
    if (!bank || typeof bank !== 'object' || Array.isArray(bank)) bank = { bankName: legacy };
  }
  if (!bank || typeof bank !== 'object') bank = {};
  return Object.fromEntries(['phone','address','emergencyNo','pan','aadhar','uan','bankName','accountNumber','ifscCode','branchName'].map(key => [key, String((['bankName','accountNumber','ifscCode','branchName'].includes(key) ? bank[key] : data[key]) ?? '')]));
}

function profileErrors(data) {
  const errors = {};
  for (const key of ['phone','emergencyNo']) {
    const message = validatePhone(data[key]);
    if (message) errors[key] = message;
  }
  return errors;
}

export default function ProfilePage() {
  const { user, refreshUser, isLoading: authLoading } = useAuth();
  const toast = useToast();
  const [profileData, setProfileData] = useState(null);
  const [formData, setFormData] = useState({
    phone: '',
    address: '',
    emergencyNo: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branchName: '',
    pan: '',
    aadhar: '',
    uan: '',
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [savedForm, setSavedForm] = useState(null);
  const [saveError, setSaveError] = useState('');
  // The bank account number stays masked until the user shows it or edits it.
  const [showAccount, setShowAccount] = useState(false);
  const saving = useRef(false);
  const isDirty = savedForm && Object.keys(formData).some(key => formData[key] !== savedForm[key]);

  const loadProfile = useCallback(async (signal) => {
    if (!user?.id) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/employees/${user.id}`, { credentials: 'same-origin', cache: 'no-store', signal: signal || AbortSignal.timeout(15000) });
      const json = await res.json();
      if (signal?.aborted) return;
      if (res.ok && json.success && json.data) {
        setProfileData(json.data);
        const fields = profileFields(json.data);
        setFormData(fields);
        setSavedForm(fields);
        setErrors({});
        setSaveError('');
      } else {
        setLoadError(json.message || 'Failed to load profile');
      }
    } catch (err) {
      if (signal?.aborted && signal.reason?.name !== 'TimeoutError') return;
      setLoadError(err.name === 'TimeoutError' ? 'Loading your profile took too long. Please retry.' : 'Error connecting to server to load profile.');
    } finally {
      if (!signal?.aborted || signal.reason?.name === 'TimeoutError') setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Profile request timed out', 'TimeoutError')), 15000);
    void loadProfile(controller.signal).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [loadProfile, user?.id]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSaveError('');
    setFormData((prev) => ({ ...prev, [name]: name === 'ifscCode' || name === 'pan' ? value.toUpperCase() : value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?.id || saving.current || !isDirty) return;
    const newErrors = profileErrors(formData);

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error('Validation Error', 'Please correct the highlighted contact information fields.');
      return;
    }

    saving.current = true;
    setIsSaving(true);
    setSaveError('');
    setErrors({});

    try {
      const headers = { 'Content-Type': 'application/json' };

      const hasBankData =
        formData.bankName.trim() ||
        formData.accountNumber.trim() ||
        formData.ifscCode.trim() ||
        formData.branchName.trim();
      const bankDetails = hasBankData
        ? {
            bankName: formData.bankName.trim(),
            accountNumber: formData.accountNumber.trim(),
            ifscCode: formData.ifscCode.trim().toUpperCase(),
            branchName: formData.branchName.trim(),
          }
        : null;

      const payload = {
        ...formData,
        bankDetails,
      };
      delete payload.bankName;
      delete payload.accountNumber;
      delete payload.ifscCode;
      delete payload.branchName;

      const res = await fetch(`/api/employees/${user.id}`, {
        method: 'PUT',
        headers,
        credentials: 'same-origin',
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Profile Updated', 'Your profile details have been successfully saved.');
        const updated = json.data || { ...profileData, ...payload };
        setProfileData(prev => ({ ...prev, ...updated }));
        const fields = profileFields(updated);
        setFormData(fields);
        setSavedForm(fields);
        if (refreshUser) void refreshUser();
      } else {
        const message = json.message || 'Failed to save changes.';
        setSaveError(message);
        toast.error('Update Failed', message);
      }
    } catch (err) {
      const message = ['TimeoutError','AbortError'].includes(err.name) ? 'The save response took too long. Your changes are still here; reload your profile to check whether they were saved before retrying.' : 'Could not save your profile. Your changes are still here; please retry.';
      setSaveError(message);
      toast.error('Save not confirmed', message);
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  if (!authLoading && !user?.id) return <ErrorState title="Sign in to view your profile" message="Your session is unavailable. Sign in again to continue." />;

  if (isLoading || !user?.id) {
    return <LoadingState message="Loading your profile..." description="Fetching your employee record and assignment details." />;
  }

  if (loadError) {
    return (
      <div className="py-8">
        <ErrorState
          title="Could Not Load Profile"
          message={loadError}
          onRetry={() => loadProfile()}
        />
      </div>
    );
  }

  const roleLabel =
    profileData?.role === 'A' ? 'Administrator' : profileData?.role === 'AA' ? 'Accountant' : profileData?.role === 'M' ? 'Manager' : profileData?.role === 'T' ? 'Tender' : 'Staff Employee';

  const roleBadgeColor =
    profileData?.role === 'A'
      ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
      : profileData?.role === 'M'
      ? 'bg-sky-100 text-sky-800 border-sky-200'
      : 'bg-emerald-100 text-emerald-800 border-emerald-200';

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <ModuleHeader
        icon={User}
        title="My Profile"
        description="Your role and department, and the contact details you can change."
        actions={
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${roleBadgeColor}`}>
            <Shield className="h-3.5 w-3.5" />
            {roleLabel} ({profileData?.role})
          </span>
        }
      />

      {/* Profile Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-slate-200/90 shadow-xs">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-bold text-2xl shadow-md shadow-sky-500/20">
              {profileData?.name?.charAt(0) || 'U'}
            </div>
            <CardTitle className="mt-4 text-lg font-bold">{profileData?.name}</CardTitle>
            <CardDescription className="text-xs">{profileData?.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2 text-xs">
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-slate-500">Employee Code</span>
              <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                {profileData?.employeeCode || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Department</span>
              <span className="font-semibold text-slate-800 text-right truncate max-w-[160px]" title={profileData?.department?.name}>
                {profileData?.department?.name || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Designation</span>
              <span className="font-semibold text-slate-800 text-right truncate max-w-[160px]" title={profileData?.designation?.title}>
                {profileData?.designation?.title || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Assigned Site</span>
              <span className="font-semibold text-slate-800 text-right truncate max-w-[160px]">
                {profileData?.site?.name || 'Headquarters / Floating'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Join Date</span>
              <span className="font-semibold text-slate-800">
                {profileData?.joinDate ? new Date(profileData.joinDate).toLocaleDateString('en-IN') : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {profileData?.status === false ? 'Inactive' : 'Active'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Editable Personal Contact Information */}
        <Card className="md:col-span-2 border-slate-200/90 shadow-xs">
          <form onSubmit={handleSave} aria-busy={isSaving}>
            <fieldset disabled={isSaving} className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">Personal Contact & KYC Information</CardTitle>
              <CardDescription className="text-xs">
                Update your active contact numbers, home address, emergency contacts, and banking records
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="profile-phone" className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      name="phone"
                      inputMode="tel"
                      autoComplete="tel"
                      aria-invalid={!!errors.phone}
                      aria-describedby={errors.phone ? "profile-phone-error" : undefined}
                      id="profile-phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="+91 98765 43210"
                      className={`w-full rounded-xl border pl-9 pr-3 py-2 text-xs focus:ring-1 ${
                        errors.phone
                          ? 'border-rose-300 text-rose-900 focus:border-rose-500 focus:ring-rose-500 bg-rose-50/20'
                          : 'border-slate-300 focus:border-sky-500 focus:ring-sky-500'
                      }`}
                    />
                  </div>
                  {errors.phone && <p id="profile-phone-error" role="alert" className="mt-1 text-[11px] text-rose-600">{errors.phone}</p>}
                </div>

                <div>
                  <label htmlFor="profile-emergencyNo" className="block text-xs font-semibold text-slate-700 mb-1">Emergency Contact Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      name="emergencyNo"
                      inputMode="tel"
                      autoComplete="tel"
                      aria-invalid={!!errors.emergencyNo}
                      aria-describedby={errors.emergencyNo ? "profile-emergencyNo-error" : undefined}
                      id="profile-emergencyNo"
                      value={formData.emergencyNo}
                      onChange={handleInputChange}
                      placeholder="+91 98765 00000"
                      className={`w-full rounded-xl border pl-9 pr-3 py-2 text-xs focus:ring-1 ${
                        errors.emergencyNo
                          ? 'border-rose-300 text-rose-900 focus:border-rose-500 focus:ring-rose-500 bg-rose-50/20'
                          : 'border-slate-300 focus:border-sky-500 focus:ring-sky-500'
                      }`}
                    />
                  </div>
                  {errors.emergencyNo && <p id="profile-emergencyNo-error" role="alert" className="mt-1 text-[11px] text-rose-600">{errors.emergencyNo}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="profile-address" className="block text-xs font-semibold text-slate-700 mb-1">Permanent / Residential Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <textarea
                    name="address"
                      id="profile-address"
                    rows={2}
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Full residential address..."
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                  Banking & Tax Identification
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="profile-pan" className="block text-xs font-semibold text-slate-700 mb-1">PAN Card</label>
                    <input
                      type="text"
                      name="pan"
                      id="profile-pan"
                      value={formData.pan}
                      onChange={handleInputChange}
                      placeholder="ABCDE1234F"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs uppercase font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-aadhar" className="block text-xs font-semibold text-slate-700 mb-1">Aadhaar Number</label>
                    <input
                      type="text"
                      name="aadhar"
                      id="profile-aadhar"
                      value={formData.aadhar}
                      onChange={handleInputChange}
                      placeholder="1234 5678 9012"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-uan" className="block text-xs font-semibold text-slate-700 mb-1">UAN / PF Number</label>
                    <input
                      type="text"
                      name="uan"
                      id="profile-uan"
                      value={formData.uan}
                      onChange={handleInputChange}
                      placeholder="100987654321"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl p-3.5 space-y-3" style={{ background: 'var(--md-surface2)', border: '1px solid var(--md-border)' }}>
                  <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--md-border)' }}>
                    <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: 'color-mix(in srgb, var(--md-primary) 18%, transparent)', color: 'var(--md-primary-hover)' }}>
                      <Landmark className="w-3.5 h-3.5" />
                    </span>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Bank Account Details</label>
                    <span className="ml-auto text-[11px]" style={{ color: 'var(--md-dim)' }}>Used for salary and payments</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="profile-bankName" className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                      <input
                        type="text"
                        name="bankName"
                      id="profile-bankName"
                        value={formData.bankName}
                        onChange={handleInputChange}
                        placeholder="e.g. State Bank of India"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-accountNumber" className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="accountNumber"
                          id="profile-accountNumber"
                          value={showAccount ? formData.accountNumber : maskAccount(formData.accountNumber)}
                          readOnly={!showAccount}
                          onFocus={() => setShowAccount(true)}
                          onBlur={() => setShowAccount(false)}
                          onChange={handleInputChange}
                          placeholder="e.g. 50100234567890"
                          autoComplete="off"
                          inputMode="numeric"
                          aria-describedby="profile-accountNumber-hint"
                          className="w-full rounded-xl border border-slate-300 py-2 pl-3 pr-9 text-xs font-mono tracking-wide focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                        />
                        {formData.accountNumber ? (
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setShowAccount((value) => !value)}
                            aria-label={showAccount ? 'Hide account number' : 'Show account number'}
                            aria-pressed={showAccount}
                            className="absolute inset-y-0 right-0 grid w-9 place-items-center text-slate-400 hover:text-slate-700"
                          >
                            {showAccount ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        ) : null}
                      </div>
                      <p id="profile-accountNumber-hint" className="mt-1 text-[11px]" style={{ color: 'var(--md-dim)' }}>
                        {showAccount ? 'Shown while you edit.' : 'Masked. Select the field or the eye to see or change it.'}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="profile-ifscCode" className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
                      <input
                        type="text"
                        name="ifscCode"
                      id="profile-ifscCode"
                        value={formData.ifscCode}
                        onChange={handleInputChange}
                        placeholder="e.g. SBIN0001234"
                        maxLength={11}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono uppercase focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-branchName" className="block text-xs font-semibold text-slate-700 mb-1">Branch Name</label>
                      <input
                        type="text"
                        name="branchName"
                      id="profile-branchName"
                        value={formData.branchName}
                        onChange={handleInputChange}
                        placeholder="e.g. Downtown Branch"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            </fieldset>

            <CardFooter className="flex-wrap justify-end">
              <div className="mr-auto text-xs" aria-live="polite">{saveError ? <p role="alert" className="text-rose-700">{saveError}</p> : isDirty ? 'You have unsaved changes.' : 'Your profile is up to date.'}</div>
              <Button type="button" variant="secondary" size="sm" disabled={isSaving || !isDirty} onClick={() => { setFormData({...savedForm}); setErrors({}); setSaveError(''); }}>Cancel changes</Button>
              <Button type="submit" variant="primary" size="sm" disabled={isSaving || !isDirty}>
                {isSaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1.5" />
                    <span>Save Profile Changes</span>
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
