'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  UserX,
  UserCheck,
  Building2,
  Award,
  MapPin,
  Calendar,
  Mail,
  Phone,
  Shield,
  Briefcase,
  CreditCard,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  KeyRound,
  User,
  ExternalLink,
  Landmark,
  Cloud,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { isSafeResourceUrl, getSafeImageUrl } from '@/lib/security';
import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ProfileImageUpload from '@/components/ui/ProfileImageUpload';
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
import { CLIENT } from '@/config/client';
import PasswordField from '@/components/ui/PasswordField';
import { passwordProblem } from '@/lib/password-policy.mjs';

const INITIAL_FORM_DATA = {
  employeeCode: '',
  name: '',
  email: '',
  phone: '',
  dob: '',
  gender: '',
  address: '',
  profileImageUrl: '',
  siteId: '',
  joinDate: new Date().toISOString().split('T')[0],
  status: 'true',
  password: '',
  role: 'M',
  deptId: '',
  firmId: '',
  designationId: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  pan: '',
  aadhar: '',
  uan: '',
  emergencyNo: '',
  createdBy: '',
  updatedBy: '',
};

const EMPTY_RESET = { next: '', confirm: '' };

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function EmployeesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'A';
  const isManagerOrAdmin = user?.role === 'A' || user?.role === 'M';

  // Core Data States
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [sites, setSites] = useState([]);
  const [firms, setFirms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');
  const [selectedDesigFilter, setSelectedDesigFilter] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('true');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('');

  // Alerts & Notifications
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);

  // Active selected employee for details/actions
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Form states
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [formErrors, setFormErrors] = useState({});
  const [formGeneralError, setFormGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const isUploadingImageRef = useRef(false);
  const [editSaveProgress, setEditSaveProgress] = useState(0);
  const [editSaveStage, setEditSaveStage] = useState('');
  const [resetPassword, setResetPassword] = useState(EMPTY_RESET);
  const [resetErrors, setResetErrors] = useState({});
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [formActiveTab, setFormActiveTab] = useState('basic');

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Load auxiliary reference data (departments, designations, sites, firms)
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [deptRes, desigRes, sitesRes, firmsRes] = await Promise.all([
        fetch('/api/departments', { headers }),
        fetch('/api/designations', { headers }),
        fetch('/api/sites', { headers }),
        fetch('/api/firms', { headers }),
      ]);

      const [deptJson, desigJson, sitesJson, firmsJson] = await Promise.all([
        deptRes.json(),
        desigRes.json(),
        sitesRes.json(),
        firmsRes.json(),
      ]);

      if (deptJson.success) setDepartments(deptJson.data || []);
      if (desigJson.success) setDesignations(desigJson.data || []);
      if (sitesJson.success) setSites(sitesJson.data || []);
      if (firmsJson.success) setFirms(firmsJson.data || []);
    } catch (err) {
      console.error('Failed to load auxiliary options:', err);
    }
  }, []);

  // Fetch employees with server-side filters & pagination
  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));

      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedDeptFilter) params.set('department', selectedDeptFilter);
      if (selectedDesigFilter) params.set('designation', selectedDesigFilter);
      if (selectedStatusFilter) params.set('status', selectedStatusFilter);
      if (selectedRoleFilter) params.set('role', selectedRoleFilter);

      const res = await fetch(`/api/employees?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setEmployees(json.data || []);
        if (json.pagination) {
          setTotalRecords(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        }
      } else {
        setErrorMessage(json.message || 'Failed to load employees');
      }
    } catch (err) {
      console.error('Fetch employees error:', err);
      setErrorMessage('Network connection error while retrieving employees.');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchQuery, selectedDeptFilter, selectedDesigFilter, selectedStatusFilter, selectedRoleFilter]);

  // Initial load
  useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Reset page to 1 when filters change
  const handleFilterChange = (setter, val) => {
    setter(val);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedDeptFilter('');
    setSelectedDesigFilter('');
    setSelectedStatusFilter('');
    setSelectedRoleFilter('');
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(searchQuery) ||
    Boolean(selectedDeptFilter) ||
    Boolean(selectedDesigFilter) ||
    Boolean(selectedStatusFilter) ||
    Boolean(selectedRoleFilter);

  // Helper to format ISO date to YYYY-MM-DD for date inputs
  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // Helper to format date for display
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

  // Form Validation
  const validateForm = (isEdit = false) => {
    const errors = {};
    if (!formData.employeeCode.trim()) {
      errors.employeeCode = 'Employee code is required.';
    }
    if (!formData.name.trim()) {
      errors.name = 'Full name is required.';
    }
    if (!formData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }
    if (!formData.deptId) {
      errors.deptId = 'Please select a department.';
    }
    if (!formData.designationId) {
      errors.designationId = 'Please select a designation.';
    }
    if (!formData.joinDate) {
      errors.joinDate = 'Date of joining is required.';
    }
    if (!formData.role) {
      errors.role = 'Role assignment is required.';
    }
    if (!isEdit) {
      const passwordIssue = passwordProblem(formData.password);
      if (passwordIssue) errors.password = formData.password ? passwordIssue : 'Initial password is required.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Modal Openers
  const openAddModal = () => {
    setFormData({
      ...INITIAL_FORM_DATA,
      deptId: departments[0]?.id || '',
      designationId: designations[0]?.id || '',
    });
    setFormErrors({});
    setFormGeneralError('');
    setFormActiveTab('basic');
    setIsAddModalOpen(true);
  };

  const openEditModal = (emp) => {
    setSelectedEmployee(emp);

    let parsedBank = { bankName: '', accountNumber: '', ifscCode: '', branchName: '' };
    if (emp.bankDetails) {
      if (typeof emp.bankDetails === 'object') {
        parsedBank = {
          bankName: emp.bankDetails.bankName || '',
          accountNumber: emp.bankDetails.accountNumber || '',
          ifscCode: emp.bankDetails.ifscCode || '',
          branchName: emp.bankDetails.branchName || '',
        };
      } else if (typeof emp.bankDetails === 'string') {
        try {
          const parsed = JSON.parse(emp.bankDetails);
          if (typeof parsed === 'object' && parsed !== null) {
            parsedBank = {
              bankName: parsed.bankName || '',
              accountNumber: parsed.accountNumber || '',
              ifscCode: parsed.ifscCode || '',
              branchName: parsed.branchName || '',
            };
          } else {
            parsedBank.bankName = emp.bankDetails;
          }
        } catch {
          parsedBank.bankName = emp.bankDetails;
        }
      }
    }

    setFormData({
      employeeCode: emp.employeeCode || '',
      name: emp.name || '',
      email: emp.email || '',
      phone: emp.phone !== null && emp.phone !== undefined ? String(emp.phone) : '',
      dob: formatDateForInput(emp.dob),
      gender: emp.gender || '',
      address: emp.address ? (typeof emp.address === 'object' ? JSON.stringify(emp.address) : emp.address) : '',
      profileImageUrl: emp.profileImageUrl || '',
      siteId: emp.siteId || '',
      joinDate: formatDateForInput(emp.joinDate),
      status: emp.status !== undefined && emp.status !== null ? String(emp.status) : 'true',
      password: '', // Blank by default, updated only if typed
      role: emp.role && emp.role !== 'E' ? emp.role : 'M',
      deptId: emp.deptId || '',
      firmId: emp.firmId || '',
      designationId: emp.designationId || '',
      bankName: parsedBank.bankName,
      accountNumber: parsedBank.accountNumber,
      ifscCode: parsedBank.ifscCode,
      branchName: parsedBank.branchName,
      pan: emp.pan || '',
      aadhar: emp.aadhar !== null && emp.aadhar !== undefined ? String(emp.aadhar) : '',
      uan: emp.uan || '',
      emergencyNo: emp.emergencyNo !== null && emp.emergencyNo !== undefined ? String(emp.emergencyNo) : '',
      createdBy: emp.createdBy || '',
      updatedBy: emp.updatedBy || '',
    });
    setFormErrors({});
    setFormGeneralError('');
    setResetPassword(EMPTY_RESET);
    setResetErrors({});
    setFormActiveTab('basic');
    setIsEditModalOpen(true);
  };

  const openViewModal = (emp) => {
    setSelectedEmployee(emp);
    setIsViewModalOpen(true);
  };

  const openDeactivateModal = (emp) => {
    setSelectedEmployee(emp);
    setFormGeneralError('');
    setIsDeactivateModalOpen(true);
  };

  // Create Employee Handler
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormGeneralError('');

    if (isUploadingImage) {
      setFormGeneralError('Please wait for the profile image to finish uploading to the storage bucket.');
      return;
    }

    if (!validateForm(false)) {
      setFormGeneralError('Please complete all required fields highlighted in red.');
      return;
    }

    setIsSubmitting(true);
    try {
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
        : undefined;

      const payload = {
        employeeCode: formData.employeeCode.trim(),
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        deptId: formData.deptId || undefined,
        firmId: formData.firmId || undefined,
        designationId: formData.designationId || undefined,
        joinDate: formData.joinDate,
        status: formData.status,
        phone: formData.phone.trim() || undefined,
        dob: formData.dob || undefined,
        gender: formData.gender || undefined,
        address: formData.address.trim() || undefined,
        profileImageUrl: formData.profileImageUrl.trim() || undefined,
        siteId: formData.siteId || undefined,
        bankDetails,
        pan: formData.pan.trim() || undefined,
        aadhar: formData.aadhar.trim() || undefined,
        uan: formData.uan.trim() || undefined,
        emergencyNo: formData.emergencyNo.trim() || undefined,
        createdBy: user?.id || formData.createdBy.trim() || undefined,
        updatedBy: user?.id || formData.updatedBy.trim() || undefined,
      };

      const res = await fetch('/api/employees', {
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
        const msg = `Employee "${formData.name}" (Code: ${formData.employeeCode}) created successfully.`;
        setSuccessMessage(msg);
        toast.success(msg);
        fetchEmployees();
      } else {
        const err = json.message || 'Failed to create employee.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      console.error('Submit Add Employee error:', err);
      setFormGeneralError('Network error while saving employee.');
      toast.error('Network error while saving employee.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Employee Handler
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setFormGeneralError('');

    if (!validateForm(true)) {
      setFormGeneralError('Please correct the highlighted fields before saving.');
      return;
    }

    setIsSubmitting(true);
    setEditSaveProgress(15);
    setEditSaveStage('Initializing profile update...');

    let progressTimer = null;

    try {
      // If image is currently uploading to Google Cloud, wait for it with progress feedback
      if (isUploadingImageRef.current) {
        setEditSaveStage('Uploading profile image to storage...');
        setEditSaveProgress(35);
        while (isUploadingImageRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      setEditSaveStage('Syncing the profile image with storage...');
      setEditSaveProgress(50);

      // Smooth progress ticker up to 90% while DB update processes
      progressTimer = setInterval(() => {
        setEditSaveProgress((prev) => {
          if (prev < 88) return prev + 3;
          return prev;
        });
      }, 150);

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
        employeeCode: formData.employeeCode.trim(),
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        deptId: formData.deptId || null,
        firmId: formData.firmId || null,
        designationId: formData.designationId || null,
        joinDate: formData.joinDate,
        status: formData.status,
        phone: formData.phone.trim() || null,
        dob: formData.dob || null,
        gender: formData.gender || null,
        address: formData.address.trim() || null,
        profileImageUrl: formData.profileImageUrl.trim() || null,
        siteId: formData.siteId || null,
        bankDetails,
        pan: formData.pan.trim() || null,
        aadhar: formData.aadhar.trim() || null,
        uan: formData.uan.trim() || null,
        emergencyNo: formData.emergencyNo.trim() || null,
        updatedBy: user?.id || formData.updatedBy.trim() || null,
      };

      setEditSaveStage('Saving updated profile in database...');
      setEditSaveProgress(78);

      const res = await fetch(`/api/employees/${selectedEmployee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (progressTimer) clearInterval(progressTimer);

      if (res.ok && json.success) {
        setEditSaveProgress(100);
        setEditSaveStage('Profile updated successfully!');
        await new Promise((resolve) => setTimeout(resolve, 450));
        setIsEditModalOpen(false);
        const msg = `Employee profile for "${formData.name}" updated successfully.`;
        setSuccessMessage(msg);
        toast.success(msg);
        fetchEmployees();
      } else {
        const err = json.message || 'Failed to update employee.';
        setFormGeneralError(err);
        toast.error(err);
      }
    } catch (err) {
      if (progressTimer) clearInterval(progressTimer);
      console.error('Submit Edit Employee error:', err);
      setFormGeneralError('Network error while updating employee.');
      toast.error('Network error while updating employee.');
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsSubmitting(false);
      setEditSaveProgress(0);
      setEditSaveStage('');
    }
  };

  // Administrator password reset: its own action, separate from Save Changes.
  const handleResetPassword = async () => {
    if (!selectedEmployee || isResettingPassword) return;
    const errors = {};
    const issue = passwordProblem(resetPassword.next);
    if (issue) errors.next = issue;
    if (!resetPassword.confirm) errors.confirm = 'Type the new password again.';
    else if (resetPassword.next !== resetPassword.confirm) errors.confirm = 'The two passwords do not match.';
    setResetErrors(errors);
    if (Object.keys(errors).length) return;

    setIsResettingPassword(true);
    try {
      const res = await fetch(`/api/employees/${selectedEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ password: resetPassword.next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setResetErrors({ next: json.message || 'Could not update the password.' });
        return;
      }
      setResetPassword(EMPTY_RESET);
      toast.success('Password updated', `${selectedEmployee.name} is signed out everywhere and signs in with the new password.`);
    } catch {
      setResetErrors({ next: 'Network error. The password was not changed.' });
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Deactivate Employee (Soft Delete) or Reactivate
  const handleToggleStatus = async () => {
    if (!selectedEmployee) return;
    setIsSubmitting(true);
    setFormGeneralError('');

    try {
      const isCurrentlyActive =
        selectedEmployee.status === true ||
        selectedEmployee.status === 'true' ||
        selectedEmployee.status === 'active' ||
        selectedEmployee.status === 'ACTIVE';

      if (isCurrentlyActive) {
        // DELETE endpoint performs soft-deactivation (status='false')
        const res = await fetch(`/api/employees/${selectedEmployee.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        const json = await res.json();

        if (res.ok && json.success) {
          setIsDeactivateModalOpen(false);
          const msg = `Employee "${selectedEmployee.name}" deactivated successfully.`;
          setSuccessMessage(msg);
          toast.success(msg);
          fetchEmployees();
        } else {
          const err = json.message || 'Failed to deactivate employee.';
          setFormGeneralError(err);
          toast.error(err);
        }
      } else {
        // Reactivate via PUT
        const res = await fetch(`/api/employees/${selectedEmployee.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ status: 'true' }),
        });
        const json = await res.json();

        if (res.ok && json.success) {
          setIsDeactivateModalOpen(false);
          const msg = `Employee "${selectedEmployee.name}" reactivated successfully.`;
          setSuccessMessage(msg);
          toast.success(msg);
          fetchEmployees();
        } else {
          const err = json.message || 'Failed to reactivate employee.';
          setFormGeneralError(err);
          toast.error(err);
        }
      }
    } catch (err) {
      console.error('Toggle status error:', err);
      setFormGeneralError('Network error while processing request.');
      toast.error('Network error while processing request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for Status Badge
  const renderStatusBadge = (statusVal) => {
    const isActive =
      statusVal === true ||
      statusVal === 'true' ||
      statusVal === 'active' ||
      statusVal === 'ACTIVE' ||
      statusVal === '1';

    if (isActive) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Inactive
      </span>
    );
  };

  // Helper for Role Badge
  const renderRoleBadge = (roleCode) => {
    switch (roleCode) {
      case 'A':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
            <Shield className="h-3 w-3 text-rose-600" />
            Admin
          </span>
        );
      case 'AA':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">
            <Shield className="h-3 w-3 text-teal-600" />
            Accountant
          </span>
        );
      case 'M':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
            <Briefcase className="h-3 w-3 text-amber-600" />
            Manager
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200">
            <User className="h-3 w-3 text-sky-600" />
            Staff
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        icon={Users}
        title="Employees"
        description="Everyone who signs in: roles, departments, sites and passwords."
        help={<WorkflowGuide id="employees" />}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchEmployees();
                fetchAuxiliaryData();
              }}
              isLoading={isLoading}
              title="Reload employee records"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              <span>Refresh</span>
            </Button>

            <Button variant="primary" size="sm" onClick={openAddModal}>
              <Plus className="h-4 w-4 mr-1.5" />
              <span>Add Employee</span>
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

      {/* Global Error Banner */}
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

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 items-center">
            {/* Search Input */}
            <div className="relative lg:col-span-4">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Search by code, name, email, phone..."
                value={searchQuery}
                onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            {/* Department Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedDeptFilter}
                onChange={(e) => handleFilterChange(setSelectedDeptFilter, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Designation Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedDesigFilter}
                onChange={(e) => handleFilterChange(setSelectedDesigFilter, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All Designations</option>
                {designations.map((desig) => (
                  <option key={desig.id} value={desig.id}>
                    {desig.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Role Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedRoleFilter}
                onChange={(e) => handleFilterChange(setSelectedRoleFilter, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All Roles</option>
                <option value="A">Admin (A)</option>
                <option value="AA">Accountant (AA)</option>
                <option value="M">Manager (M)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedStatusFilter}
                onChange={(e) => handleFilterChange(setSelectedStatusFilter, e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All Statuses</option>
                <option value="true">Active Only</option>
                <option value="false">Inactive Only</option>
              </select>
            </div>
          </div>

          {/* Filter Status / Reset row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>
                {isLoading && !employees.length ? 'Loading employees…' : <>
                Showing <strong className="text-slate-900">{employees.length}</strong> of{' '}
                <strong className="text-slate-900">{totalRecords}</strong> employees recorded
                </>}
              </span>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 font-semibold underline underline-offset-2 ml-2"
                >
                  <X className="h-3 w-3" />
                  Reset all filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employee Data Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Designation</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead>Join Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        {isLoading ? (
          <TableLoadingState message="Loading employees…" rows={6} cols={9} />
        ) : employees.length === 0 ? (
          <TableEmptyState
            title={hasActiveFilters ? 'No matching employees' : 'No employees recorded yet'}
            description={
              hasActiveFilters
                ? 'No workforce records match your active search and filter criteria.'
                : `Get started by creating the first employee profile in ${CLIENT.name}.`
            }
            icon={Users}
            colSpan={9}
            action={
              !hasActiveFilters && (
                <Button size="sm" variant="primary" onClick={openAddModal}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  <span>Register Employee</span>
                </Button>
              )
            }
          />
        ) : (
          <TableBody>
            {employees.map((emp) => {
              const isEmpActive =
                emp.status === true ||
                emp.status === 'true' ||
                emp.status === 'active' ||
                emp.status === 'ACTIVE';

              return (
                <TableRow key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Code */}
                  <TableCell>
                    <span className="inline-block font-mono text-xs font-semibold text-slate-800 bg-slate-100/90 px-2 py-1 rounded-md border border-slate-200">
                      {emp.employeeCode}
                    </span>
                  </TableCell>

                  {/* Name + Role Badge */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {emp.profileImageUrl && isSafeResourceUrl(emp.profileImageUrl) ? (
                        <img
                          src={getSafeImageUrl(emp.profileImageUrl)}
                          alt={emp.name}
                          className="h-8 w-8 rounded-full object-cover border border-slate-200 shadow-xs"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-semibold text-xs shadow-xs">
                          {emp.name ? emp.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-slate-900 block leading-snug">
                          {emp.name}
                        </span>
                        <div className="mt-0.5">{renderRoleBadge(emp.role)}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Email */}
                  <TableCell className="text-slate-600">
                    <span className="truncate max-w-[180px] block font-medium" title={emp.email}>
                      {emp.email}
                    </span>
                  </TableCell>

                  {/* Phone */}
                  <TableCell className="text-slate-600">
                    {emp.phone ? (
                      <span className="font-mono text-xs text-slate-700">{emp.phone}</span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Not provided</span>
                    )}
                  </TableCell>

                  {/* Department */}
                  <TableCell>
                    {emp.department ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-800 text-xs">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        {emp.department.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Unassigned</span>
                    )}
                  </TableCell>

                  {/* Designation */}
                  <TableCell>
                    {emp.designation ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-800 text-xs">
                        <Award className="h-3.5 w-3.5 text-amber-500" />
                        {emp.designation.title}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Unassigned</span>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell className="text-center">{renderStatusBadge(emp.status)}</TableCell>

                  {/* Join Date */}
                  <TableCell className="text-slate-600 text-xs">
                    {formatDateDisplay(emp.joinDate)}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* View Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View Full Profile"
                        onClick={() => openViewModal(emp)}
                      >
                        <Eye className="h-4 w-4 text-slate-500 hover:text-sky-600" />
                      </Button>

                      {/* Edit Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit Profile"
                        onClick={() => openEditModal(emp)}
                      >
                        <Pencil className="h-4 w-4 text-slate-500 hover:text-amber-600" />
                      </Button>

                      {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={isEmpActive ? 'Deactivate Employee' : 'Reactivate Employee'}
                        onClick={() => openDeactivateModal(emp)}
                        className={isEmpActive ? 'hover:text-rose-600' : 'hover:text-emerald-600'}
                      >
                        {isEmpActive ? (
                          <UserX className="h-4 w-4 text-rose-500" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-emerald-600" />
                        )}
                      </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        )}
      </Table>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalPages}</span> (Total{' '}
            <span className="font-semibold text-slate-900">{totalRecords}</span> items)
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            {/* Page number pills */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
                )
                .map((p, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && p - prevPage > 1;

                  return (
                    <div key={p} className="flex items-center">
                      {showEllipsis && <span className="px-1 text-slate-400 text-xs">...</span>}
                      <button
                        onClick={() => setPage(p)}
                        className={`h-8 w-8 rounded-lg text-xs font-semibold transition ${
                          page === p
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    </div>
                  );
                })}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ================= ADD EMPLOYEE MODAL ================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Employee"
        description="Add a person: contact details, role, password and bank details."
        maxWidth="max-w-3xl"
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
              isLoading={isSubmitting || isUploadingImage}
              disabled={isSubmitting || isUploadingImage}
            >
              {isUploadingImage ? 'Uploading Image...' : 'Create Employee Profile'}
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

          {/* Form Tabs Navigation */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setFormActiveTab('basic')}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                formActiveTab === 'basic'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              1. Basic & Contact
            </button>
            <button
              type="button"
              onClick={() => setFormActiveTab('org')}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                formActiveTab === 'org'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              2. Org & Roles
            </button>
            <button
              type="button"
              onClick={() => setFormActiveTab('security')}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                formActiveTab === 'security'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              3. Security & Access
            </button>
            <button
              type="button"
              onClick={() => setFormActiveTab('compliance')}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                formActiveTab === 'compliance'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              4. Banking & Compliance
            </button>
          </div>

          {/* TAB 1: Basic & Contact */}
          {formActiveTab === 'basic' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Employee Code */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Employee Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EMP-101, SG-042"
                    value={formData.employeeCode}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.employeeCode ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {formErrors.employeeCode && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.employeeCode}</p>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rajesh Sharma"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.name ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {formErrors.name && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.name}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={`name@${CLIENT.emailDomain}`}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.email ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {formErrors.email && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.email}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Primary Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* DOB */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Emergency Phone */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Emergency Contact No
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 98111 22334"
                    value={formData.emergencyNo}
                    onChange={(e) => setFormData({ ...formData, emergencyNo: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Residential Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Street, City, State, Postal Code"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {/* Profile Image with GCS Storage Bucket */}
              <div>
                <ProfileImageUpload
                  value={formData.profileImageUrl}
                  onChange={(url) => setFormData({ ...formData, profileImageUrl: url })}
                  onUploadStateChange={(isUp) => {
                    setIsUploadingImage(isUp);
                    isUploadingImageRef.current = isUp;
                  }}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          {/* TAB 2: Org & Roles */}
          {formActiveTab === 'org' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Department */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Department <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.deptId}
                    onChange={(e) => setFormData({ ...formData, deptId: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.deptId ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  >
                    <option value="">-- Choose Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.deptId && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.deptId}</p>
                  )}
                </div>

                {/* Designation */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Designation <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.designationId}
                    onChange={(e) => setFormData({ ...formData, designationId: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.designationId ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  >
                    <option value="">-- Choose Designation --</option>
                    {designations.map((desig) => (
                      <option key={desig.id} value={desig.id}>
                        {desig.title}
                      </option>
                    ))}
                  </select>
                  {formErrors.designationId && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.designationId}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* System Role */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    System Role <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="M">Manager (M)</option>
                    <option value="A">Administrator (A)</option>
                    <option value="AA">Accountant (AA)</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Determines portal and approval permissions.
                  </p>
                </div>

                {/* Date of Joining */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Date of Joining <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.joinDate}
                    onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.joinDate ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {formErrors.joinDate && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.joinDate}</p>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Firm Assignment */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Firm / Company
                </label>
                <select
                  value={formData.firmId}
                  onChange={(e) => setFormData({ ...formData, firmId: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="">-- No Firm Assigned --</option>
                  {firms.map((firm) => (
                    <option key={firm.id} value={firm.id}>
                      {firm.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Associate the employee with a specific firm or company entity.
                </p>
              </div>

              {/* Site Assignment */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Assigned Construction / Project Site
                </label>
                <select
                  value={formData.siteId}
                  onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="">-- HQ / No Site Assigned --</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} {site.status ? `(${site.status})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Optional field associating the employee with a field operational site.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Security & Access */}
          {formActiveTab === 'security' && (
            <div className="space-y-4 pt-1">
              <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                <div className="flex items-center gap-2 text-sky-800 text-xs font-semibold">
                  <KeyRound className="h-4 w-4" />
                  <span>Authentication Credentials</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Employee will use this password alongside their registered email address to sign into the {CLIENT.name} portal. Passwords are encrypted with bcrypt before being stored.
                </p>
              </div>

              <PasswordField
                id="new-employee-password"
                label="Account password"
                required
                value={formData.password}
                onChange={(password) => setFormData({ ...formData, password })}
                placeholder="At least 8 characters"
                hint="Share it with the employee privately. They can change it later in Settings."
                error={formErrors.password}
                showStrength
              />
            </div>
          )}

          {/* TAB 4: Banking & Compliance */}
          {formActiveTab === 'compliance' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* PAN */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    PAN Card Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ABCDE1234F"
                    value={formData.pan}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                  />
                </div>

                {/* Aadhar */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Aadhar Card Number
                  </label>
                  <input
                    type="text"
                    placeholder="12-digit UID"
                    value={formData.aadhar}
                    onChange={(e) => setFormData({ ...formData, aadhar: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                  />
                </div>

                {/* UAN */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    PF UAN Number
                  </label>
                  <input
                    type="text"
                    placeholder="12-digit UAN"
                    value={formData.uan}
                    onChange={(e) => setFormData({ ...formData, uan: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                  />
                </div>
              </div>

              {/* Bank Details */}
              <div className="pt-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Bank Account & IFSC Details
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. State Bank of India, HDFC"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 50100234567890"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      value={formData.ifscCode}
                      onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Main Branch, Bhubaneswar"
                      value={formData.branchName}
                      onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* ================= EDIT EMPLOYEE MODAL ================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !isSubmitting && setIsEditModalOpen(false)}
        title="Edit Employee Profile"
        description={`Update records for ${selectedEmployee?.name} (${selectedEmployee?.employeeCode}).`}
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSubmitting || isUploadingImage}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSubmit}
              isLoading={isSubmitting || isUploadingImage}
              disabled={isSubmitting || isUploadingImage}
            >
              {isSubmitting ? 'Saving Changes...' : isUploadingImage ? 'Uploading Image...' : 'Save Changes'}
            </Button>
          </>
        }
      >
        <div className="relative">
          {/* ================= EXTRA PROGRESS LOADER FOR EDIT MODAL ================= */}
          {isSubmitting && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md rounded-2xl p-6 min-h-[420px] text-white animate-fadeIn shadow-2xl border border-slate-800">
              {/* Circular Progress Ring */}
              <div className="relative mb-4 flex items-center justify-center">
                <svg className="w-24 h-24 -rotate-90 transform" viewBox="0 0 88 88">
                  <circle
                    cx="44"
                    cy="44"
                    r="36"
                    className="text-slate-800"
                    strokeWidth="6"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  <circle
                    cx="44"
                    cy="44"
                    r="36"
                    stroke="url(#editSaveCircularGradient)"
                    strokeWidth="6"
                    strokeDasharray={226.2}
                    strokeDashoffset={226.2 - (226.2 * editSaveProgress) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                    style={{ transition: 'stroke-dashoffset 200ms ease-out' }}
                  />
                  <defs>
                    <linearGradient id="editSaveCircularGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#0284c7" />
                      <stop offset="50%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {editSaveProgress >= 100 ? (
                    <CheckCircle2 className="h-9 w-9 text-emerald-400 animate-bounce" />
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <Cloud className="h-6 w-6 text-sky-400 animate-pulse mb-0.5" />
                      <span className="text-sm font-bold font-mono text-white leading-none">
                        {editSaveProgress}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Header */}
              <h4 className="text-base font-bold text-white text-center">
                {editSaveProgress >= 100
                  ? 'Update Complete!'
                  : editSaveStage || 'Saving changes...'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
                {formData.profileImageUrl && formData.profileImageUrl !== selectedEmployee?.profileImageUrl
                  ? 'Saving the profile image and employee record.'
                  : 'Updating employee records and permissions in database.'}
              </p>

              {/* Horizontal Progress Bar */}
              <div className="w-64 mt-4 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${editSaveProgress}%` }}
                />
              </div>

              {/* Live Badge */}
              <div className="mt-3.5 inline-flex items-center gap-2 rounded-full bg-sky-950/70 px-3 py-1 text-xs font-medium text-sky-300 border border-sky-800/60 shadow-xs">
                <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping" />
                <span>{editSaveStage || 'Saving the employee record...'}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-4">
          {formGeneralError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formGeneralError}</span>
            </div>
          )}

          {/* Form Tabs Navigation */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setFormActiveTab('basic')}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                formActiveTab === 'basic'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              1. Basic & Contact
            </button>
            <button
              type="button"
              onClick={() => setFormActiveTab('org')}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                formActiveTab === 'org'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              2. Org & Roles
            </button>
            <button
              type="button"
              onClick={() => setFormActiveTab('security')}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                formActiveTab === 'security'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              3. Password
            </button>
            <button
              type="button"
              onClick={() => setFormActiveTab('compliance')}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                formActiveTab === 'compliance'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              4. Banking & Compliance
            </button>
          </div>

          {/* TAB 1: Basic & Contact */}
          {formActiveTab === 'basic' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Employee Code */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Employee Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.employeeCode}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.employeeCode ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {formErrors.employeeCode && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.employeeCode}</p>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.name ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {formErrors.name && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.name}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`block w-full rounded-xl border ${
                      formErrors.email ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'
                    } bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
                  />
                  {formErrors.email && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.email}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Primary Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* DOB */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Emergency Phone */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Emergency Contact No
                  </label>
                  <input
                    type="tel"
                    value={formData.emergencyNo}
                    onChange={(e) => setFormData({ ...formData, emergencyNo: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Residential Address
                </label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {/* Profile Image with GCS Storage Bucket */}
              <div>
                <ProfileImageUpload
                  value={formData.profileImageUrl}
                  onChange={(url) => setFormData({ ...formData, profileImageUrl: url })}
                  onUploadStateChange={(isUp) => {
                    setIsUploadingImage(isUp);
                    isUploadingImageRef.current = isUp;
                  }}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          {/* TAB 2: Org & Roles */}
          {formActiveTab === 'org' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Department */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Department <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.deptId}
                    onChange={(e) => setFormData({ ...formData, deptId: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="">-- Choose Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Designation */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Designation <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.designationId}
                    onChange={(e) => setFormData({ ...formData, designationId: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="">-- Choose Designation --</option>
                    {designations.map((desig) => (
                      <option key={desig.id} value={desig.id}>
                        {desig.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Role */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    System Role <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="M">Manager (M)</option>
                    <option value="A">Administrator (A)</option>
                    <option value="AA">Accountant (AA)</option>
                  </select>
                </div>

                {/* Join Date */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Date of Joining <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.joinDate}
                    onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Firm Assignment */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Firm / Company
                </label>
                <select
                  value={formData.firmId}
                  onChange={(e) => setFormData({ ...formData, firmId: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="">-- No Firm Assigned --</option>
                  {firms.map((firm) => (
                    <option key={firm.id} value={firm.id}>
                      {firm.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Site Assignment */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Assigned Construction / Project Site
                </label>
                <select
                  value={formData.siteId}
                  onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="">-- HQ / No Site Assigned --</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} {site.status ? `(${site.status})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* TAB 3: Password reset, its own action next to Save Changes */}
          {formActiveTab === 'security' && (
            <div className="space-y-4 pt-1">
              {selectedEmployee?.id === user?.id ? (
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <p>
                    This is your own account. Change your password in{' '}
                    <a href="/dashboard/settings#account-settings" className="font-semibold text-mat-primary underline underline-offset-4">Settings</a>,
                    where your current password is checked first.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Set a new password</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">
                        For {selectedEmployee?.name || 'this employee'}. They are signed out on every device and sign in with the new password. Nothing else in the profile changes.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <PasswordField
                      id="reset-password"
                      label="New password"
                      value={resetPassword.next}
                      onChange={(next) => { setResetPassword((p) => ({ ...p, next })); setResetErrors((e) => ({ ...e, next: '' })); }}
                      onEnter={handleResetPassword}
                      placeholder="At least 8 characters"
                      error={resetErrors.next}
                      showStrength
                    />
                    <PasswordField
                      id="reset-password-confirm"
                      label="Confirm new password"
                      value={resetPassword.confirm}
                      onChange={(confirm) => { setResetPassword((p) => ({ ...p, confirm })); setResetErrors((e) => ({ ...e, confirm: '' })); }}
                      onEnter={handleResetPassword}
                      placeholder="Type it again"
                      error={resetErrors.confirm}
                    />
                  </div>
                  <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleResetPassword}
                      isLoading={isResettingPassword}
                      loadingLabel="Updating password…"
                      disabled={isResettingPassword || !resetPassword.next}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Update password
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Banking & Compliance */}
          {formActiveTab === 'compliance' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* PAN */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    PAN Card Number
                  </label>
                  <input
                    type="text"
                    value={formData.pan}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                  />
                </div>

                {/* Aadhar */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Aadhar Card Number
                  </label>
                  <input
                    type="text"
                    value={formData.aadhar}
                    onChange={(e) => setFormData({ ...formData, aadhar: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                  />
                </div>

                {/* UAN */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    PF UAN Number
                  </label>
                  <input
                    type="text"
                    value={formData.uan}
                    onChange={(e) => setFormData({ ...formData, uan: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                  />
                </div>
              </div>

              {/* Bank Details */}
              <div className="pt-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Bank Account & IFSC Details
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. State Bank of India, HDFC"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 50100234567890"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      value={formData.ifscCode}
                      onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Main Branch, Bhubaneswar"
                      value={formData.branchName}
                      onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
        </div>
      </Modal>

      {/* ================= VIEW EMPLOYEE MODAL (DOSSIER) ================= */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Employee Dossier"
        description="Profile, role, department and records."
        maxWidth="max-w-3xl"
        footer={
          <Button variant="primary" size="sm" onClick={() => setIsViewModalOpen(false)}>
            Close Overview
          </Button>
        }
      >
        {selectedEmployee && (
          <div className="space-y-5">
            {/* Profile Overview Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-xs">
              <div className="flex items-center gap-4">
                {selectedEmployee.profileImageUrl && isSafeResourceUrl(selectedEmployee.profileImageUrl) ? (
                  <img
                    src={getSafeImageUrl(selectedEmployee.profileImageUrl)}
                    alt={selectedEmployee.name}
                    className="h-16 w-16 rounded-2xl object-cover border-2 border-white shadow-md"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-bold text-2xl shadow-md shadow-sky-600/20">
                    {selectedEmployee.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedEmployee.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      {selectedEmployee.employeeCode}
                    </span>
                    {renderRoleBadge(selectedEmployee.role)}
                    {renderStatusBadge(selectedEmployee.status)}
                  </div>
                </div>
              </div>

              <div className="text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Date of Joining
                </span>
                <span className="text-sm font-semibold text-slate-800">
                  {formatDateDisplay(selectedEmployee.joinDate)}
                </span>
              </div>
            </div>

            {/* Grid Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Contact & Personal */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <User className="h-4 w-4 text-sky-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Personal & Contact Info
                  </h4>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Email:</span>
                    <span className="font-semibold text-slate-800">{selectedEmployee.email}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedEmployee.phone || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Emergency Phone:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedEmployee.emergencyNo || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Gender:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedEmployee.gender || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Date of Birth:</span>
                    <span className="font-semibold text-slate-800">
                      {formatDateDisplay(selectedEmployee.dob)}
                    </span>
                  </div>
                  <div className="py-1">
                    <span className="text-slate-400 block mb-0.5">Address:</span>
                    <span className="font-medium text-slate-700">
                      {selectedEmployee.address || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Org & Placement */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Building2 className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Department, Firm & Site Allocation
                  </h4>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Firm:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedEmployee.firm?.name || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Department:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedEmployee.department?.name || 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Designation:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedEmployee.designation?.title || 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Assigned Site:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedEmployee.site?.name || 'Central Operations / HQ'}
                    </span>
                  </div>
                  {selectedEmployee.site?.address && (
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-400">Site Location:</span>
                      <span className="font-medium text-slate-700 truncate max-w-[180px]">
                        {selectedEmployee.site.address}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Managed Sites:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedEmployee.managedSites?.length || 0} site(s)
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Banking & Compliance */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 md:col-span-2">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Compliance, Statutory & Payroll Details
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block text-[11px]">PAN Number</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedEmployee.pan || '—'}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block text-[11px]">Aadhar UID</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedEmployee.aadhar || '—'}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block text-[11px]">Provident Fund UAN</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedEmployee.uan || '—'}
                    </span>
                  </div>
                </div>

                <div className="pt-1 text-xs">
                  <span className="text-slate-400 block mb-1.5 font-medium">Bank Account & Settlement Info:</span>
                  {(() => {
                    let bank = null;
                    if (selectedEmployee.bankDetails) {
                      if (typeof selectedEmployee.bankDetails === 'object') {
                        bank = selectedEmployee.bankDetails;
                      } else {
                        try {
                          bank = JSON.parse(selectedEmployee.bankDetails);
                        } catch {
                          bank = { raw: selectedEmployee.bankDetails };
                        }
                      }
                    }

                    if (!bank || (!bank.bankName && !bank.accountNumber && !bank.ifscCode && !bank.branchName && !bank.raw)) {
                      return (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 text-slate-400 italic">
                          No bank information provided on file.
                        </div>
                      );
                    }

                    if (bank.raw) {
                      return (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 font-mono text-slate-700 whitespace-pre-wrap">
                          {bank.raw}
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Bank Name</span>
                          <span className="font-semibold text-slate-800">{bank.bankName || '—'}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Account Number</span>
                          <span className="font-mono font-bold text-slate-800">{bank.accountNumber || '—'}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">IFSC Code</span>
                          <span className="font-mono font-bold text-sky-700">{bank.ifscCode || '—'}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Branch</span>
                          <span className="font-medium text-slate-700">{bank.branchName || '—'}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Record Footnotes */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-3 gap-2">
              <span>ID: {selectedEmployee.id}</span>
              <span>Created by: {selectedEmployee.createdBy || '—'}</span>
              <span>Updated by: {selectedEmployee.updatedBy || '—'}</span>
              <span>Updated: {formatDateDisplay(selectedEmployee.updatedAt)}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= DEACTIVATE / STATUS CONFIRMATION DIALOG ================= */}
      <ConfirmDialog
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        onConfirm={handleToggleStatus}
        isLoading={isSubmitting}
        title={
          selectedEmployee?.status === true ||
          selectedEmployee?.status === 'true' ||
          selectedEmployee?.status === 'active' ||
          selectedEmployee?.status === 'ACTIVE'
            ? 'Deactivate Employee'
            : 'Reactivate Employee'
        }
        description={`Modify active operational status in ${CLIENT.name} database.`}
        confirmText={
          selectedEmployee?.status === true ||
          selectedEmployee?.status === 'true' ||
          selectedEmployee?.status === 'active' ||
          selectedEmployee?.status === 'ACTIVE'
            ? 'Confirm Deactivation'
            : 'Confirm Reactivation'
        }
        variant={
          selectedEmployee?.status === true ||
          selectedEmployee?.status === 'true' ||
          selectedEmployee?.status === 'active' ||
          selectedEmployee?.status === 'ACTIVE'
            ? 'danger'
            : 'primary'
        }
      >
        {selectedEmployee && (
          <div className="space-y-3">
            {formGeneralError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formGeneralError}</span>
              </div>
            )}

            {selectedEmployee.status === true ||
            selectedEmployee.status === 'true' ||
            selectedEmployee.status === 'active' ||
            selectedEmployee.status === 'ACTIVE' ? (
              <>
                <p className="text-sm text-slate-600">
                  Are you sure you want to deactivate employee:{' '}
                  <strong className="text-slate-900">{selectedEmployee.name}</strong> (
                  <span className="font-mono text-xs">{selectedEmployee.employeeCode}</span>)?
                </p>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold mb-1">Standard Soft Deactivation:</p>
                  <p>
                    The employee status will be set to <strong>Inactive (status=false)</strong>. They
                    will not be able to log into the portal. Existing audit trails, attendance records,
                    tender logs, and historical site allocations remain completely intact and safe.
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Reactivate employee account for{' '}
                  <strong className="text-slate-900">{selectedEmployee.name}</strong> (
                  <span className="font-mono text-xs">{selectedEmployee.employeeCode}</span>)?
                </p>
                <p className="text-xs text-slate-500">
                  This will set their account status back to <strong>Active (status=true)</strong> and
                  restore login privileges.
                </p>
              </>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
