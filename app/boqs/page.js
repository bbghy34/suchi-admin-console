'use client';

import EmployeeAppBadge from '@/components/guide/EmployeeAppBadge';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  Briefcase,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  FileText,
  Calendar,
  MapPin,
  User,
  Link2,
  Upload,
  Table2,
  ListOrdered,
  Hash,
  CloudUpload,
  File,
  LayoutList,
  PackagePlus,
  Camera,
  Navigation,
  ZoomIn,
  Compass,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { isSafeResourceUrl, getSafeImageUrl } from '@/lib/security';
import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardContent } from '@/components/ui/Card';
import AsyncStatus from '@/components/ui/AsyncStatus';
import Button from '@/components/ui/Button';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
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

export default function BOQsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isManagerOrAdmin = user?.role === 'A' || user?.role === 'M';
  const isAdmin = user?.role === 'A';
  const fileInputRef = useRef(null);

  // ── Core Data ─────────────────────────────────────────────────────────────
  const [boqs, setBoqs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  // Alerts
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedField, setCopiedField] = useState('');

  // ── Modals ────────────────────────────────────────────────────────────────
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);

  const [selectedBoq, setSelectedBoq] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formGeneralError, setFormGeneralError] = useState('');

  // ── BOQ Items ─────────────────────────────────────────────────────────────
  const [boqItems, setBoqItems] = useState([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [extraError, setExtraError] = useState('');
  const itemsRequest = useRef(0);
  const extrasRequest = useRef(0);

  // ── Extra BOQ Items ───────────────────────────────────────────────────────
  const [isExtraItemsModalOpen, setIsExtraItemsModalOpen] = useState(false);
  const [selectedBoqItem, setSelectedBoqItem] = useState(null);
  const [extraItems, setExtraItems] = useState([]);
  const [extraForm, setExtraForm] = useState({ itemName: '', itemQuantity: '', requestedBy: '', remarks: '' });
  const [extraSaving, setExtraSaving] = useState(false);
  const [isLoadingExtra, setIsLoadingExtra] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState(null);
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [selectedExtraItem, setSelectedExtraItem] = useState(null);

  // ── Received Delivery Photos (Google Cloud Storage) ────────────────────────
  const [isImagesModalOpen, setIsImagesModalOpen] = useState(false);
  const [selectedBoqItemForImages, setSelectedBoqItemForImages] = useState(null);
  const [receivedImages, setReceivedImages] = useState([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadImageError, setUploadImageError] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageLat, setImageLat] = useState('');
  const [imageLong, setImageLong] = useState('');
  const [imageQty, setImageQty] = useState('');
  const [imageSlNo, setImageSlNo] = useState('');
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsStatusMessage, setGpsStatusMessage] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);
  const itemImageInputRef = useRef(null);

  // ── Excel Upload ──────────────────────────────────────────────────────────
  const [excelFile, setExcelFile] = useState(null);       // raw File object
  const [excelRows, setExcelRows] = useState([]);          // parsed preview rows
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(''); // status message
  const [isDragOver, setIsDragOver] = useState(false);

  // ── Form ──────────────────────────────────────────────────────────────────
  const emptyForm = { boqCode: '', projectId: '', siteId: '', validity: '', docsLinksText: '' };
  const [formData, setFormData] = useState(emptyForm);

  // ── Document Upload in Form ───────────────────────────────────────────────
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docUploadError, setDocUploadError] = useState('');
  const [docUploadProgress, setDocUploadProgress] = useState('');
  const [isDocDragOver, setIsDocDragOver] = useState(false);
  const [showRawDocsLinks, setShowRawDocsLinks] = useState(false);
  const [excelItemsToImport, setExcelItemsToImport] = useState([]);
  const [shouldImportExcelItems, setShouldImportExcelItems] = useState(true);
  const [detectedExcelName, setDetectedExcelName] = useState('');
  const docFileInputRef = useRef(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (successMessage) { const t = setTimeout(() => setSuccessMessage(''), 4500); return () => clearTimeout(t); }
  }, [successMessage]);

  const copy = (text, field) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2500);
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return '—'; }
  };

  const toDateInput = (d) => { try { return d ? new Date(d).toISOString().split('T')[0] : ''; } catch { return ''; } };
  const docsToText = (l) => !l ? '' : Array.isArray(l) ? l.join('\n') : String(l);
  const textToDocs = (t) => !t?.trim() ? null : t.split('\n').map((s) => s.trim()).filter(Boolean);

  // ── Fetchers ──────────────────────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    try { const r = await fetch('/api/projects?limit=100', { headers: getAuthHeaders() }); const j = await r.json(); if (r.ok && j.success) setProjects(j.data || []); } catch {}
  }, []);

  const fetchSites = useCallback(async () => {
    try { const r = await fetch('/api/sites?limit=100', { headers: getAuthHeaders() }); const j = await r.json(); if (r.ok && j.success) setSites(j.data || []); } catch {}
  }, []);

  const fetchBoqs = useCallback(async () => {
    setIsLoading(true); setErrorMessage('');
    try {
      const p = new URLSearchParams();
      p.set('page', page); p.set('limit', limit);
      if (searchQuery.trim()) p.set('search', searchQuery.trim());
      if (selectedProject.trim()) p.set('projectId', selectedProject.trim());
      if (showInactive && isAdmin) p.set('includeInactive', 'true');
      const r = await fetch(`/api/boqs?${p}`, { headers: getAuthHeaders() });
      const j = await r.json();
      if (r.ok && j.success) { setBoqs(j.data || []); if (j.pagination) { setTotalRecords(j.pagination.total); setTotalPages(j.pagination.totalPages); } }
      else setErrorMessage(j.message || 'Failed to load BOQs.');
    } catch { setErrorMessage('Network error.'); }
    finally { setIsLoading(false); }
  }, [page, limit, searchQuery, selectedProject, showInactive, isAdmin]);

  const fetchBoqItems = useCallback(async (boqId) => {
    const request = ++itemsRequest.current;
    setIsLoadingItems(true); setBoqItems([]); setItemsError('');
    try {
      const r = await fetch(`/api/boq-items?boqId=${boqId}&limit=all`, { headers: getAuthHeaders(), signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || 'Could not load BOQ items.');
      if (request === itemsRequest.current) setBoqItems(j.data || []);
    } catch (error) { if (request === itemsRequest.current) setItemsError(error.name === 'TimeoutError' ? 'Loading timed out. Close and reopen this BOQ to retry.' : error.message); }
    finally { if (request === itemsRequest.current) setIsLoadingItems(false); }
  }, []);

  const fetchExtraItems = useCallback(async (boqItemId) => {
    const request = ++extrasRequest.current;
    setIsLoadingExtra(true); setExtraItems([]); setExtraError('');
    try {
      const r = await fetch(`/api/extra-boq-items?boqItemId=${boqItemId}`, { headers: getAuthHeaders(), signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || 'Could not load extra items.');
      if (request === extrasRequest.current) setExtraItems(j.data || []);
    } catch (error) { if (request === extrasRequest.current) setExtraError(error.message || 'Could not load extra items. Close and reopen to retry.'); }
    finally { if (request === extrasRequest.current) setIsLoadingExtra(false); }
  }, []);

  useEffect(() => { fetchBoqs(); }, [fetchBoqs]);
  useEffect(() => { fetchProjects(); fetchSites(); }, [fetchProjects, fetchSites]);

  useEffect(() => {
    if (!isExtraItemsModalOpen || selectedExtraItem || decisionTarget) return undefined;
    const timer = window.setTimeout(() => {
      document.body.style.overflow = 'hidden';
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isExtraItemsModalOpen, selectedExtraItem, decisionTarget]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: totalRecords,
    withProject: boqs.filter((b) => b.projectId).length,
    withDocs: boqs.filter((b) => b.docsLinks && (Array.isArray(b.docsLinks) ? b.docsLinks.length > 0 : b.docsLinks)).length,
    withValidity: boqs.filter((b) => b.validity).length,
  }), [boqs, totalRecords]);

  // ── Modal openers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setFormGeneralError('');
    setDocUploadError('');
    setDocUploadProgress('');
    setShowRawDocsLinks(false);
    setExcelItemsToImport([]);
    setShouldImportExcelItems(true);
    setDetectedExcelName('');
    setIsAddModalOpen(true);
  };
  const openEdit = (boq) => {
    setSelectedBoq(boq);
    setFormData({
      boqCode: boq.boqCode || '',
      projectId: boq.projectId || '',
      siteId: boq.siteId || '',
      validity: toDateInput(boq.validity),
      docsLinksText: docsToText(boq.docsLinks),
    });
    setFormErrors({});
    setFormGeneralError('');
    setDocUploadError('');
    setDocUploadProgress('');
    setShowRawDocsLinks(false);
    setExcelItemsToImport([]);
    setShouldImportExcelItems(true);
    setDetectedExcelName('');
    setIsEditModalOpen(true);
  };

  // ── Document Attachment Helpers ───────────────────────────────────────────
  const getDocLinksList = () => {
    if (!formData.docsLinksText) return [];
    return formData.docsLinksText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleRemoveDocLink = (indexToRemove) => {
    const list = getDocLinksList();
    const updated = list.filter((_, idx) => idx !== indexToRemove);
    setFormData((prev) => ({ ...prev, docsLinksText: updated.join('\n') }));
  };

  const getDocFileInfo = (url) => {
    const clean = String(url || '').trim();
    const parts = clean.split('/');
    const lastPart = parts[parts.length - 1] || clean;
    const filename = decodeURIComponent(lastPart.split('?')[0]);
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return { filename, ext };
  };

  const parseExcelItems = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: 'binary' });
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          if (!ws) return resolve([]);

          // Detect header row if the sheet contains top banner/metadata rows
          const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (!rows2D || rows2D.length === 0) return resolve([]);

          const headerKeywords = ['description', 'item', 'work', 'particulars', 'qty', 'quantity', 'unit', 'rate', 'amount', 'sl'];
          let headerRowIdx = 0;
          for (let r = 0; r < Math.min(10, rows2D.length); r++) {
            const rowValues = (rows2D[r] || []).map((v) => String(v).trim().toLowerCase());
            const matchedCount = headerKeywords.filter((kw) => rowValues.some((v) => v.includes(kw))).length;
            if (matchedCount >= 2) {
              headerRowIdx = r;
              break;
            }
          }

          const rawRows = XLSX.utils.sheet_to_json(ws, { range: headerRowIdx, defval: '' });
          if (!rawRows || rawRows.length === 0) return resolve([]);

          const get = (row, ...keys) => {
            for (const k of keys) {
              const match = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
              if (match !== undefined && row[match] !== '' && row[match] != null) return String(row[match]).trim();
            }
            return null;
          };

          const parseNum = (val) => {
            if (val == null) return null;
            const clean = String(val).replace(/[^0-9.-]/g, '');
            const n = parseFloat(clean);
            return isNaN(n) ? null : n;
          };

          const items = rawRows
            .map((row, i) => {
              const name = get(row, 'description of work', 'item description', 'description', 'particulars', 'item name', 'item', 'work description', 'scope of work', 'specification / description', 'name');
              const slNo = get(row, 'sl no', 'sl.no', 'slno', 'serial no', 's.no', 'sr no', 'sr.no', 'item no', 'no', '#') || String(i + 1);
              const specification = get(row, 'specification', 'specifications', 'specs', 'spec', 'details', 'make/brand');
              const unit = get(row, 'unit', 'uom', 'units', 'measuring unit');
              const quantity = get(row, 'quantity', 'qty', 'quantities', 'nos', 'no.');
              const rawRate = get(row, 'rate', 'unit rate', 'price', 'unit price', 'rate (inr)', 'rate (rs)');
              const rawAmount = get(row, 'amount', 'total', 'total amount', 'total cost', 'cost', 'total (inr)', 'amount (inr)', 'net amount');
              const remarks = get(row, 'remarks', 'remark', 'note', 'notes', 'comments');

              return {
                slNo,
                itemName: name || (quantity || unit ? `Item ${i + 1}` : null),
                specification,
                unit,
                quantity: quantity || null,
                rate: parseNum(rawRate),
                amount: parseNum(rawAmount),
                remarks,
              };
            })
            .filter((it) => it.itemName && it.itemName !== '—' && it.itemName.toLowerCase() !== 'total' && it.itemName.toLowerCase() !== 'grand total');

          resolve(items);
        } catch {
          resolve([]);
        }
      };
      reader.readAsBinaryString(file);
    });
  };

  const handleDocFilesSelected = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setIsUploadingDoc(true);
    setDocUploadError('');
    setDocUploadProgress(`Uploading ${files.length} document${files.length > 1 ? 's' : ''} to storage…`);

    try {
      const uploadedUrls = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setDocUploadProgress(`Uploading (${i + 1}/${files.length}): ${file.name}…`);
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload/boq-document', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: fd,
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.message || `Failed to upload "${file.name}"`);
        }
        uploadedUrls.push(json.data.url);
      }

      setFormData((prev) => {
        const currentList = prev.docsLinksText
          ? prev.docsLinksText.split('\n').map((s) => s.trim()).filter(Boolean)
          : [];
        const combined = [...currentList, ...uploadedUrls];
        const unique = Array.from(new Set(combined));
        return { ...prev, docsLinksText: unique.join('\n') };
      });

      // Check if any uploaded file is an Excel spreadsheet (.xlsx, .xls, .csv)
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['xlsx', 'xls', 'csv'].includes(ext)) {
          const parsed = await parseExcelItems(file);
          if (parsed && parsed.length > 0) {
            setExcelItemsToImport(parsed);
            setShouldImportExcelItems(true);
            setDetectedExcelName(file.name);
            toast.success(`📊 Detected ${parsed.length} line items in "${file.name}" ready to import into BOQ!`);
            break;
          }
        }
      }

      toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded and linked to BOQ!`);
    } catch (err) {
      setDocUploadError(err.message || 'Error uploading document.');
      toast.error(err.message || 'Error uploading document.');
    } finally {
      setIsUploadingDoc(false);
      setDocUploadProgress('');
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    }
  };
  const openView = (boq) => { setSelectedBoq(boq); setIsViewModalOpen(true); };
  const openDelete = (boq) => { setSelectedBoq(boq); setIsDeleteModalOpen(true); };
  const openUpload = (boq) => {
    setSelectedBoq(boq); setExcelFile(null); setExcelRows([]); setUploadError(''); setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsUploadModalOpen(true);
  };
  const openItems = (boq) => { setSelectedBoq(boq); setIsItemsModalOpen(true); fetchBoqItems(boq.id); };
  const openExtraItems = (boqItem) => {
    setSelectedBoqItem(boqItem);
    setSelectedExtraItem(null);
    setExtraForm({ itemName: '', itemQuantity: '', requestedBy: '', remarks: '' });
    setIsExtraItemsModalOpen(true);
    fetchExtraItems(boqItem.id);
  };

  const closeExtraItems = () => {
    setIsExtraItemsModalOpen(false);
    setSelectedExtraItem(null);
    closeDecision();
  };

  const closeExtraDetail = () => {
    setSelectedExtraItem(null);
  };

  const extraItemStatus = (item) => {
    if (item?.status === 'ACCEPTED' || item?.status === 'REJECTED' || item?.status === 'PENDING') return item.status;
    return item?.isApproved ? 'ACCEPTED' : 'PENDING';
  };

  const extraStatusBadge = (status) => {
    if (status === 'ACCEPTED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />Accepted
        </span>
      );
    }
    if (status === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          <XCircle className="h-3 w-3" />Rejected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        <AlertCircle className="h-3 w-3" />Pending
      </span>
    );
  };

  const closeDecision = () => {
    if (decisionSaving) return;
    setDecisionTarget(null);
    setDecisionRemarks('');
    setDecisionError('');
    if (isExtraItemsModalOpen) document.body.style.overflow = 'hidden';
  };

  const openDecision = (item, action) => {
    setDecisionTarget({ item, action });
    setDecisionRemarks('');
    setDecisionError('');
  };

  const submitDecision = async () => {
    if (!decisionTarget) return;
    const note = decisionRemarks.trim();
    if (!note) {
      setDecisionError('Add remarks before confirming.');
      return;
    }
    setDecisionSaving(true);
    setDecisionError('');
    const action = decisionTarget.action;
    try {
      const res = await fetch(`/api/extra-boq-items/${decisionTarget.item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          decision: action,
          decisionRemarks: note,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setDecisionError(json.message || 'Could not save the decision.');
        return;
      }
      toast.success(action === 'ACCEPTED' ? 'Extra item accepted.' : 'Extra item rejected.');
      setDecisionTarget(null);
      setDecisionRemarks('');
      if (json.data) {
        setSelectedExtraItem((current) => (current?.id === json.data.id ? json.data : current));
      }
      if (isExtraItemsModalOpen) document.body.style.overflow = 'hidden';
      if (selectedBoqItem?.id) fetchExtraItems(selectedBoqItem.id);
    } catch {
      setDecisionError('Network error while saving the decision.');
    } finally {
      setDecisionSaving(false);
    }
  };

  const addExtraItem = async (e) => {
    e.preventDefault();
    if (!selectedBoqItem) return;
    setExtraSaving(true);
    try {
      const res = await fetch('/api/extra-boq-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          boqItemId: selectedBoqItem.id,
          itemName: extraForm.itemName,
          itemQuantity: extraForm.itemQuantity,
          requestedBy: extraForm.requestedBy,
          remarks: extraForm.remarks,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Could not add the extra item.');
        return;
      }
      setExtraForm({ itemName: '', itemQuantity: '', requestedBy: '', remarks: '' });
      toast.success('Extra item added.');
      fetchExtraItems(selectedBoqItem.id);
    } catch {
      toast.error('Network error while adding the extra item.');
    } finally {
      setExtraSaving(false);
    }
  };

  // ── Received Images Helpers ───────────────────────────────────────────────
  const parseItemImages = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') return [parsed];
      } catch {
        if (raw.startsWith('http') || raw.startsWith('/api/files')) {
          return [{
            slNo: 1,
            imageLink: raw,
            lat: null,
            long: null,
            createdAt: null,
            createdBy: null,
          }];
        }
      }
    }
    return [];
  };

  const openReceivedImagesModal = async (boqItem) => {
    setSelectedBoqItemForImages(boqItem);
    const initialImages = parseItemImages(boqItem.itemReceivedImage);
    setReceivedImages(initialImages);
    setImageFile(null);
    setImagePreviewUrl('');
    setImageLat('');
    setImageLong('');
    setImageQty('');
    setImageSlNo(String(initialImages.length + 1));
    setGpsStatusMessage('');
    setUploadImageError('');
    setIsImagesModalOpen(true);
    setIsLoadingImages(true);

    try {
      const res = await fetch(`/api/boq-items/${boqItem.id}/images`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const imgs = json.data?.images || [];
        setReceivedImages(imgs);
        setImageSlNo(String(imgs.length + 1));
      }
    } catch (err) {
      console.error('Fetch received images error:', err);
    } finally {
      setIsLoadingImages(false);
    }
  };

  const handleGetGpsLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsStatusMessage('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocatingGps(true);
    setGpsStatusMessage('Detecting GPS location…');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const long = pos.coords.longitude.toFixed(6);
        setImageLat(lat);
        setImageLong(long);
        const acc = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;
        setGpsStatusMessage(`GPS acquired: ${lat}, ${long}${acc ? ` (±${acc}m accuracy)` : ''}`);
        setIsLocatingGps(false);
      },
      (err) => {
        setIsLocatingGps(false);
        let msg = 'Failed to acquire GPS location.';
        if (err.code === 1) msg = 'Location permission denied by browser. Please enter coordinates manually.';
        else if (err.code === 2) msg = 'Location unavailable. Please enter coordinates manually.';
        else if (err.code === 3) msg = 'Location request timed out. Please retry or enter manually.';
        setGpsStatusMessage(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setUploadImageError('');
    try {
      const url = URL.createObjectURL(file);
      setImagePreviewUrl(url);
    } catch {}
  };

  const handleUploadReceivedImage = async (e) => {
    e?.preventDefault();
    if (!selectedBoqItemForImages?.id) return;
    if (!imageFile) {
      setUploadImageError('Please select or capture a photo first.');
      return;
    }
    const delivered = Number(String(imageQty).replace(/,/g, ''));
    if (!Number.isFinite(delivered) || delivered <= 0) {
      setUploadImageError('Enter the quantity delivered with this photo.');
      return;
    }
    setIsUploadingImage(true);
    setUploadImageError('');

    try {
      const fd = new FormData();
      fd.append('file', imageFile);
      fd.append('quantity', String(delivered));
      if (imageLat) fd.append('lat', imageLat);
      if (imageLong) fd.append('long', imageLong);
      if (imageSlNo) fd.append('slNo', imageSlNo);

      const res = await fetch(`/api/boq-items/${selectedBoqItemForImages.id}/images`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: fd,
      });
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success('Received delivery photo uploaded to storage!');
        const updatedList = json.data?.images || [];
        setReceivedImages(updatedList);
        const totals = {
          itemReceivedImage: updatedList,
          itemReceivedTotalQuantity: json.data?.itemReceivedTotalQuantity,
          itemLeft: json.data?.itemLeft,
        };
        setSelectedBoqItemForImages((prev) => (prev ? { ...prev, ...totals } : prev));
        setBoqItems((prev) =>
          prev.map((item) =>
            item.id === selectedBoqItemForImages.id
              ? { ...item, ...totals }
              : item
          )
        );

        // Reset upload form
        setImageFile(null);
        setImagePreviewUrl('');
        setImageLat('');
        setImageLong('');
        setImageQty('');
        setImageSlNo(String(updatedList.length + 1));
        setGpsStatusMessage('');
        if (itemImageInputRef.current) itemImageInputRef.current.value = '';
      } else {
        setUploadImageError(json.message || 'Failed to upload photo.');
        toast.error(json.message || 'Failed to upload photo.');
      }
    } catch {
      setUploadImageError('Network error while uploading photo.');
      toast.error('Network error while uploading photo.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteReceivedImage = async (index, slNo) => {
    if (!selectedBoqItemForImages?.id) return;
    if (!confirm(`Delete delivery photo #${slNo || index + 1}?`)) return;

    try {
      const res = await fetch(`/api/boq-items/${selectedBoqItemForImages.id}/images?index=${index}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success('Photo removed.');
        const updatedList = json.data?.images || [];
        setReceivedImages(updatedList);
        const totals = {
          itemReceivedImage: updatedList,
          itemReceivedTotalQuantity: json.data?.itemReceivedTotalQuantity,
          itemLeft: json.data?.itemLeft,
        };
        setSelectedBoqItemForImages((prev) => (prev ? { ...prev, ...totals } : prev));
        setBoqItems((prev) =>
          prev.map((item) =>
            item.id === selectedBoqItemForImages.id
              ? { ...item, ...totals }
              : item
          )
        );
      } else {
        toast.error(json.message || 'Could not delete photo.');
      }
    } catch {
      toast.error('Network error while deleting photo.');
    }
  };

  // ── Form helpers ──────────────────────────────────────────────────────────
  const buildPayload = () => ({
    boqCode: formData.boqCode.trim(),
    projectId: formData.projectId || null,
    siteId: formData.siteId || null,
    validity: formData.validity || null,
    docsLinks: textToDocs(formData.docsLinksText),
    items: shouldImportExcelItems && excelItemsToImport.length > 0 ? excelItemsToImport : undefined,
  });
  const validateForm = () => { const e = {}; if (!formData.boqCode.trim()) e.boqCode = 'BOQ code is required.'; return e; };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e?.preventDefault(); setFormGeneralError('');
    const errs = validateForm(); if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setIsSubmitting(true);
    try {
      const payload = buildPayload();
      const r = await fetch('/api/boqs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (r.ok && j.success) {
        setIsAddModalOpen(false);
        const countMsg = j.data?.itemsCount ? ` with ${j.data.itemsCount} line items imported` : '';
        setSuccessMessage(`BOQ "${j.data.boqCode}" created${countMsg}.`);
        toast.success(`BOQ "${j.data.boqCode}" created${countMsg}!`);
        fetchBoqs();
      }
      else { const err = j.message || 'Failed.'; setFormGeneralError(err); toast.error(err); }
    } catch { setFormGeneralError('Network error.'); }
    finally { setIsSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e?.preventDefault(); if (!selectedBoq) return; setFormGeneralError('');
    const errs = validateForm(); if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setIsSubmitting(true);
    try {
      const r = await fetch(`/api/boqs/${selectedBoq.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(buildPayload()) });
      const j = await r.json();
      if (r.ok && j.success) {
        setIsEditModalOpen(false);
        const countMsg = j.data?.itemsCount ? ` and ${j.data.itemsCount} line items imported` : '';
        setSuccessMessage(`BOQ "${j.data.boqCode}" updated${countMsg}.`);
        toast.success(`BOQ "${j.data.boqCode}" updated${countMsg}.`);
        fetchBoqs();
      }
      else { const err = j.message || 'Failed.'; setFormGeneralError(err); toast.error(err); }
    } catch { setFormGeneralError('Network error.'); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!selectedBoq) return; setIsSubmitting(true);
    try {
      const turningOn = selectedBoq.isActive === false;
      const r = await fetch(`/api/boqs/${selectedBoq.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ isActive: turningOn }) });
      const j = await r.json();
      if (r.ok && j.success) { setIsDeleteModalOpen(false); const verb = selectedBoq.isActive === false ? 'activated' : 'deactivated'; setSuccessMessage(`BOQ "${selectedBoq.boqCode}" ${verb}. The record was kept.`); toast.success(`BOQ "${selectedBoq.boqCode}" ${verb}.`); fetchBoqs(); }
      else { const err = j.message || 'Failed.'; setErrorMessage(err); toast.error(err); }
    } catch { setErrorMessage('Network error.'); }
    finally { setIsSubmitting(false); }
  };

  // ── Excel parse (client-side preview) ────────────────────────────────────
  const parseExcel = (file) => {
    setUploadError(''); setExcelRows([]); setUploadProgress('');
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { setUploadError('Only .xlsx, .xls, or .csv files are supported.'); setExcelFile(null); return; }
    setExcelFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        if (!ws) { setUploadError('The sheet could not be read.'); return; }

        const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!rows2D || rows2D.length === 0) { setUploadError('The sheet appears to be empty.'); return; }

        const headerKeywords = ['description', 'item', 'work', 'particulars', 'qty', 'quantity', 'unit', 'rate', 'amount', 'sl'];
        let headerRowIdx = 0;
        for (let r = 0; r < Math.min(10, rows2D.length); r++) {
          const rowValues = (rows2D[r] || []).map((v) => String(v).trim().toLowerCase());
          const matchedCount = headerKeywords.filter((kw) => rowValues.some((v) => v.includes(kw))).length;
          if (matchedCount >= 2) {
            headerRowIdx = r;
            break;
          }
        }

        const rawRows = XLSX.utils.sheet_to_json(ws, { range: headerRowIdx, defval: '' });
        if (!rawRows.length) { setUploadError('No valid rows found in sheet.'); return; }

        const get = (row, ...keys) => {
          for (const k of keys) {
            const match = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
            if (match !== undefined && row[match] !== '' && row[match] != null) return String(row[match]).trim();
          }
          return null;
        };

        const parseNum = (val) => {
          if (val == null) return null;
          const clean = String(val).replace(/[^0-9.-]/g, '');
          const n = parseFloat(clean);
          return isNaN(n) ? null : n;
        };

        const parsed = rawRows
          .map((row, i) => {
            const name = get(row, 'description of work', 'item description', 'description', 'particulars', 'item name', 'item', 'work description', 'scope of work', 'name');
            const slNo = get(row, 'sl no', 'sl.no', 'slno', 'serial no', 's.no', 'sr no', 'sr.no', 'item no', 'no', '#') || String(i + 1);
            const specification = get(row, 'specification', 'specifications', 'specs', 'spec', 'details', 'make/brand');
            const unit = get(row, 'unit', 'uom', 'units', 'measuring unit');
            const quantity = get(row, 'quantity', 'qty', 'quantities', 'nos', 'no.');
            const rate = parseNum(get(row, 'rate', 'unit rate', 'price', 'unit price', 'rate (inr)', 'rate (rs)'));
            const amount = parseNum(get(row, 'amount', 'total', 'total amount', 'total cost', 'cost', 'total (inr)', 'amount (inr)', 'net amount'));
            const remarks = get(row, 'remarks', 'remark', 'note', 'notes', 'comments');

            return {
              slNo,
              itemName: name || (quantity || unit ? `Item ${i + 1}` : null),
              specification,
              unit,
              quantity: quantity || null,
              rate,
              amount,
              remarks,
            };
          })
          .filter((it) => it.itemName && it.itemName !== '—' && it.itemName.toLowerCase() !== 'total' && it.itemName.toLowerCase() !== 'grand total');

        if (!parsed.length) { setUploadError('No valid line item rows detected in this sheet.'); return; }
        setExcelRows(parsed);
      } catch { setUploadError('Failed to parse file. Ensure it is a valid Excel or CSV.'); }
    };
    reader.readAsBinaryString(file);
  };

  const handleFileDrop = (e) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseExcel(file);
  };

  const handleFileChange = (e) => { const file = e.target.files?.[0]; if (file) parseExcel(file); };

  // ── Upload to GCS + import items ──────────────────────────────────────────
  const handleUploadSubmit = async () => {
    if (!excelFile) { setUploadError('Please select a file first.'); return; }
    if (!selectedBoq?.id) { setUploadError('No BOQ selected.'); return; }
    setIsUploading(true); setUploadError(''); setUploadProgress('Uploading file to storage…');

    try {
      const fd = new FormData();
      fd.append('file', excelFile);
      fd.append('boqId', selectedBoq.id);

      const r = await fetch('/api/upload/boq-excel', { method: 'POST', headers: getAuthHeaders(), body: fd });
      const j = await r.json();

      if (r.ok && j.success) {
        setIsUploadModalOpen(false);
        setSuccessMessage(`✅ ${j.data.count} items imported. File saved to GCS.`);
        toast.success(`${j.data.count} BOQ items imported successfully!`);
        fetchBoqs();
      } else {
        // GCS not configured fallback — still try local item import
        if (r.status === 503) {
          setUploadProgress('GCS not configured. Importing items locally without file storage…');
          await importItemsDirectly();
        } else {
          setUploadError(j.message || 'Upload failed.');
        }
      }
    } catch { setUploadError('Network error during upload.'); }
    finally { setIsUploading(false); setUploadProgress(''); }
  };

  // Fallback: import items without GCS upload
  const importItemsDirectly = async () => {
    if (!excelRows.length || !selectedBoq?.id) return;
    try {
      const payload = excelRows.map((r) => ({ ...r, boqId: selectedBoq.id, rate: r.rate ? parseFloat(r.rate) || null : null, amount: r.amount ? parseFloat(r.amount) || null : null }));
      const r = await fetch('/api/boq-items', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (r.ok && j.success) {
        setIsUploadModalOpen(false);
        setSuccessMessage(`${j.data.count} items imported (no file stored — GCS not configured).`);
        toast.success(`${j.data.count} BOQ items imported.`);
        fetchBoqs();
      } else setUploadError(j.message || 'Import failed.');
    } catch { setUploadError('Network error during import.'); }
  };

  const resetFilters = () => { setSearchQuery(''); setSelectedProject(''); setPage(1); };
  const hasActiveFilters = Boolean(searchQuery || selectedProject);

  // ── Shared form JSX ───────────────────────────────────────────────────────
  const renderFormFields = () => (
    <div className="space-y-4">
      {formGeneralError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" /><span>{formGeneralError}</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">BOQ Code <span className="text-rose-500">*</span></label>
          <input type="text" required placeholder="e.g. BOQ-2026-DRG-01" value={formData.boqCode}
            onChange={(e) => setFormData({ ...formData, boqCode: e.target.value })}
            className={`block w-full rounded-xl border ${formErrors.boqCode ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-300'} bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono`} />
          {formErrors.boqCode && <p className="mt-1 text-xs text-rose-600">{formErrors.boqCode}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Validity Date</label>
          <input type="date" value={formData.validity} onChange={(e) => setFormData({ ...formData, validity: e.target.value })}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Linked Project</label>
          <select value={formData.projectId} onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
            <option value="">-- No Project --</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} {p.tenderId ? `(${p.tenderId})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Linked Site</label>
          <select value={formData.siteId} onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
            <option value="">-- No Site --</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      {/* ── Document Links & File Upload ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Document Links & Attachments{' '}
            <span className="text-slate-400 font-normal normal-case">(one URL per line)</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRawDocsLinks(!showRawDocsLinks)}
              className="text-[11px] text-slate-500 hover:text-emerald-700 font-medium underline-offset-2 hover:underline"
            >
              {showRawDocsLinks ? 'Hide URL text' : 'Edit raw URLs'}
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => docFileInputRef.current?.click()}
              isLoading={isUploadingDoc}
              className="h-7 text-xs border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 px-2.5"
            >
              <CloudUpload className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              Upload Files
            </Button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={docFileInputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.jpg,.jpeg,.png,.webp,.svg,.txt,.zip,.rar,.dwg,.dxf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleDocFilesSelected(e.target.files);
            }
          }}
        />

        {/* Upload error banner */}
        {docUploadError && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 animate-in fade-in">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="flex-1">{docUploadError}</span>
            <button
              type="button"
              onClick={() => setDocUploadError('')}
              className="text-rose-500 hover:text-rose-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Drag & Drop Upload Strip */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDocDragOver(true);
          }}
          onDragLeave={() => setIsDocDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDocDragOver(false);
            if (e.dataTransfer.files?.length) {
              handleDocFilesSelected(e.dataTransfer.files);
            }
          }}
          onClick={() => docFileInputRef.current?.click()}
          className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-xs transition cursor-pointer ${
            isDocDragOver
              ? 'border-emerald-500 bg-emerald-50 text-emerald-800 scale-[1.005]'
              : 'border-slate-300 bg-slate-50/80 hover:bg-emerald-50/40 hover:border-emerald-400 text-slate-600'
          }`}
        >
          {isUploadingDoc ? (
            <div className="flex items-center gap-2 text-emerald-700 font-medium">
              <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
              <span>{docUploadProgress || 'Uploading documents to storage…'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-center flex-wrap justify-center">
              <CloudUpload className={`h-4 w-4 ${isDocDragOver ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="font-semibold text-slate-700">
                {isDocDragOver ? 'Drop files here to upload' : 'Click or drop files to upload to cloud storage'}
              </span>
              <span className="text-[11px] text-slate-400">
                (PDF, Excel, Word, Drawings, Images up to 50MB)
              </span>
            </div>
          )}
        </div>

        {/* Attached Document Chips / Cards List */}
        {getDocLinksList().length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold px-1 pb-1 border-b border-slate-100">
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-indigo-500" />
                Attached Documents ({getDocLinksList().length})
              </span>
              <span className="text-[10px] text-slate-400">Auto-saved to BOQ</span>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {getDocLinksList().map((link, idx) => {
                const info = getDocFileInfo(link);
                const isInternal = link.startsWith('/api/files/');
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/70 hover:bg-slate-50 transition text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {info.ext === 'pdf' ? (
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-[10px] font-mono shrink-0">
                          PDF
                        </span>
                      ) : ['xlsx', 'xls', 'csv'].includes(info.ext) ? (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] font-mono shrink-0">
                          XLS
                        </span>
                      ) : ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(info.ext) ? (
                        <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-bold text-[10px] font-mono shrink-0">
                          IMG
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-[10px] font-mono shrink-0">
                          DOC
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 truncate" title={link}>
                          {info.filename}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {isInternal ? 'Cloud Storage' : 'External Link'}: {link}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isSafeResourceUrl(link) && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded-md text-emerald-700 hover:bg-emerald-100 transition"
                          title="Open document in new tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => copy(link, `doc-${idx}`)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
                        title="Copy link"
                      >
                        {copiedField === `doc-${idx}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocLink(idx)}
                        className="p-1 rounded-md text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Remove document link"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Textarea for manual entry (shown if no links yet or if user toggles "Edit raw URLs") */}
        {(showRawDocsLinks || getDocLinksList().length === 0) && (
          <div>
            <textarea
              rows={3}
              placeholder={'https://drive.google.com/file/...\nor upload files above to auto-fill links'}
              value={formData.docsLinksText}
              onChange={(e) => setFormData({ ...formData, docsLinksText: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Each line is saved as a separate document link. Files uploaded above appear here automatically.
            </p>
          </div>
        )}

        {/* Detected Excel Items to Import banner */}
        {excelItemsToImport.length > 0 && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3.5 space-y-2 text-xs animate-in fade-in">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-bold text-emerald-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shouldImportExcelItems}
                  onChange={(e) => setShouldImportExcelItems(e.target.checked)}
                  className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <Table2 className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Import {excelItemsToImport.length} line item{excelItemsToImport.length !== 1 ? 's' : ''} into BOQ Items table</span>
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 font-bold truncate max-w-[200px]">
                {detectedExcelName}
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 pl-6">
              When checked, creating this BOQ will automatically insert all {excelItemsToImport.length} parsed line items directly into the BOQ items rows.
            </p>
            {shouldImportExcelItems && (
              <div className="pl-6 pt-1">
                <div className="rounded-lg border border-emerald-200 bg-white overflow-x-auto max-h-36 text-[11px] shadow-2xs">
                  <table className="w-full text-left">
                    <thead className="bg-emerald-100/70 font-bold text-emerald-950 border-b border-emerald-200">
                      <tr>
                        <th className="py-1 px-2 whitespace-nowrap">SL No</th>
                        <th className="py-1 px-2">Description</th>
                        <th className="py-1 px-2">Unit</th>
                        <th className="py-1 px-2 text-right whitespace-nowrap">Qty</th>
                        <th className="py-1 px-2 text-right whitespace-nowrap">Rate</th>
                        <th className="py-1 px-2 text-right whitespace-nowrap">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100 font-mono">
                      {excelItemsToImport.slice(0, 4).map((r, i) => (
                        <tr key={i} className="hover:bg-emerald-50/50">
                          <td className="py-1 px-2">{r.slNo || i + 1}</td>
                          <td className="py-1 px-2 font-sans truncate max-w-[160px] font-medium text-slate-800">
                            {r.itemName}
                          </td>
                          <td className="py-1 px-2">{r.unit || '—'}</td>
                          <td className="py-1 px-2 text-right">{r.quantity || '—'}</td>
                          <td className="py-1 px-2 text-right">{r.rate != null ? `₹${r.rate}` : '—'}</td>
                          <td className="py-1 px-2 text-right font-bold text-emerald-700">
                            {r.amount != null ? `₹${r.amount}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {excelItemsToImport.length > 4 && (
                  <p className="text-[10px] text-emerald-700 mt-1 font-medium italic">
                    + {excelItemsToImport.length - 4} more line items will be imported
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      {/* ── Header ── */}
      <ModuleHeader
        icon={FileSpreadsheet}
        title="BOQs"
        description="Bills of quantities: upload the Excel sheet, track each line item and keep the files with it."
        help={<WorkflowGuide id="boqs" />}
        actions={
          <>
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show deactivated
              </label>
            )}
            <Button variant="outline" size="sm" onClick={() => { fetchBoqs(); fetchProjects(); fetchSites(); }} isLoading={isLoading}><RefreshCw className="h-4 w-4 mr-1.5" /><span>Refresh</span></Button>
            {isManagerOrAdmin && <Button variant="primary" size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" /><span>Add BOQ</span></Button>}
          </>
        }
      />

      {/* ── Banners ── */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5 text-sm font-medium"><CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /><span>{successMessage}</span></div>
          <button onClick={() => setSuccessMessage('')} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 transition"><X className="h-4 w-4" /></button>
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5 text-sm font-medium"><AlertCircle className="h-5 w-5 text-rose-600 shrink-0" /><span>{errorMessage}</span></div>
          <button onClick={() => setErrorMessage('')} className="rounded-lg p-1 text-rose-700 hover:bg-rose-100 transition"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          { label: 'Total BOQs', val: stats.total, icon: <FileSpreadsheet className="h-5 w-5 text-emerald-600" />, cls: 'text-slate-900', sub: 'All schedules' },
          { label: 'On a project', val: stats.withProject, icon: <Briefcase className="h-5 w-5 text-sky-600" />, cls: 'text-slate-900', sub: 'Linked to a project' },
          { label: 'With files', val: stats.withDocs, icon: <CloudUpload className="h-5 w-5 text-indigo-600" />, cls: 'text-slate-900', sub: 'Sheet or documents attached' },
          { label: 'With validity', val: stats.withValidity, icon: <Calendar className="h-5 w-5 text-amber-600" />, cls: 'text-slate-900', sub: 'Valid-until date set' },
        ].map((k) => (
          <Card key={k.label} className="border-slate-200/90">
            <CardContent className="p-4 sm:p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">{k.label}</span>
              <div className="flex items-baseline justify-between mt-1"><span className={`text-2xl sm:text-3xl font-extrabold font-mono ${k.cls}`}>{k.val}</span>{k.icon}</div>
              <span className="text-[11px] text-slate-500 mt-1 block">{k.sub}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters ── */}
      <Card className="border-slate-200/90 shadow-2xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Search BOQ code…" value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition font-mono" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>}
            </div>
            <select value={selectedProject} onChange={(e) => { setSelectedProject(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition">
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} {p.tenderId ? `(${p.tenderId})` : ''}</option>)}
            </select>
            <div className="flex items-center gap-2">
              {hasActiveFilters
                ? <Button variant="outline" size="sm" onClick={resetFilters} className="w-full text-rose-600 hover:bg-rose-50 border-rose-200"><X className="h-4 w-4 mr-1.5" /><span>Reset</span></Button>
                : <div className="text-xs text-slate-400 italic flex items-center justify-center w-full">{totalRecords} BOQ{totalRecords !== 1 ? 's' : ''} total</div>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── BOQs Table ── */}
      <Card className="border-slate-200/90 overflow-hidden shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead className="w-[190px]">BOQ Code</TableHead>
              <TableHead className="min-w-[140px]">Project</TableHead>
              <TableHead className="min-w-[120px]">Site</TableHead>
              <TableHead className="min-w-[110px]">Validity</TableHead>
              <TableHead className="min-w-[130px]">Documents</TableHead>
              <TableHead className="w-[100px]">Created</TableHead>
              <TableHead className="text-right w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableLoadingState message="Loading BOQs…" rows={5} cols={7} />
              : boqs.length === 0 ? (
                <TableEmptyState colSpan={7} title="No BOQ Records Found"
                  description={hasActiveFilters ? 'No BOQs match your filters.' : 'No BOQ schedules registered yet.'}
                  action={hasActiveFilters
                    ? <Button variant="outline" size="sm" onClick={resetFilters}>Clear Filters</Button>
                    : isManagerOrAdmin ? <Button variant="primary" size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />Create First BOQ</Button> : null} />
              ) : boqs.map((boq) => {
                const links = Array.isArray(boq.docsLinks) ? boq.docsLinks : boq.docsLinks ? [boq.docsLinks] : [];
                return (
                  <TableRow key={boq.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* BOQ Code */}
                    <TableCell>
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 mt-0.5 shadow-2xs">
                          <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900 text-sm truncate">{boq.boqCode}</span>
                            <button onClick={() => copy(boq.boqCode, `c-${boq.id}`)} className="text-slate-400 hover:text-emerald-600 p-0.5">
                              {copiedField === `c-${boq.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 truncate max-w-[140px] block">{boq.id.substring(0, 10)}…</span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Project */}
                    <TableCell>
                      {boq.project
                        ? <Link href={`/projects/${boq.project.id}`} className="font-bold text-xs text-sky-700 hover:underline flex items-center gap-1 group">
                          <Briefcase className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                          <span className="truncate max-w-[110px]">{boq.project.name}</span>
                          <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 shrink-0" />
                        </Link>
                        : <span className="text-slate-400 italic text-xs">—</span>}
                    </TableCell>

                    {/* Site */}
                    <TableCell>
                      {boq.site
                        ? <div className="flex items-center gap-1 text-xs text-slate-700 font-medium"><MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="truncate max-w-[100px]">{boq.site.name}</span></div>
                        : <span className="text-slate-400 italic text-xs">—</span>}
                    </TableCell>

                    {/* Validity */}
                    <TableCell>
                      {boq.validity
                        ? <div className="flex items-center gap-1 text-xs text-amber-700 font-medium"><Calendar className="h-3.5 w-3.5 text-amber-500 shrink-0" />{fmtDate(boq.validity)}</div>
                        : <span className="text-slate-400 italic text-xs">—</span>}
                    </TableCell>

                    {/* Documents */}
                    <TableCell className="text-xs">
                      {links.length > 0
                        ? <div className="space-y-0.5">
                          {links.slice(0, 1).map((link, i) =>
                            isSafeResourceUrl(link)
                              ? <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-medium truncate max-w-[130px] block" title={link}>
                                <Link2 className="h-3 w-3 shrink-0" /><span className="truncate">{link.replace(/^https?:\/\//, '').substring(0, 22)}…</span>
                              </a>
                              : <span key={i} className="text-slate-500 truncate block">{String(link).substring(0, 22)}…</span>
                          )}
                          {links.length > 1 && <span className="text-slate-400 text-[11px]">+{links.length - 1} more</span>}
                        </div>
                        : <span className="text-slate-400 italic">No files</span>}
                    </TableCell>

                    {/* Created */}
                    <TableCell className="text-slate-600 text-xs font-medium">{fmtDate(boq.createdAt)}</TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {/* View Details */}
                        <Button variant="ghost" size="icon" title="View BOQ Details" onClick={() => openView(boq)}>
                          <Eye className="h-4 w-4 text-slate-500 hover:text-emerald-600" />
                        </Button>
                        {/* View Line Items */}
                        <Button variant="ghost" size="icon" title="View BOQ Line Items" onClick={() => openItems(boq)}>
                          <LayoutList className="h-4 w-4 text-slate-500 hover:text-violet-600" />
                        </Button>
                        {isManagerOrAdmin && (
                          <>
                            {/* Upload Excel */}
                            <Button variant="ghost" size="icon" title="Upload Excel Items to GCS" onClick={() => openUpload(boq)}>
                              <CloudUpload className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                            </Button>
                            {/* Edit */}
                            <Button variant="ghost" size="icon" title="Edit BOQ" onClick={() => openEdit(boq)}>
                              <Pencil className="h-4 w-4 text-slate-500 hover:text-amber-600" />
                            </Button>
                            {isAdmin && (
                            <Button variant="ghost" size="icon" title={boq.isActive === false ? 'Activate BOQ' : 'Deactivate BOQ'} onClick={() => openDelete(boq)}>
                              <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-600" />
                            </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!isLoading && boqs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 px-4 py-3 gap-3 bg-slate-50/50">
            <div className="text-xs text-slate-500 font-medium">Page <span className="font-bold text-slate-900">{page}</span> of <span className="font-bold text-slate-900">{totalPages}</span> ({totalRecords} total)</div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4 mr-1" />Prev</Button>
              <div className="px-2 text-xs font-mono font-bold text-slate-700">{page} / {totalPages}</div>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* ════════════════════ ADD MODAL ════════════════════ */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Bill of Quantities" description="Register a new BOQ schedule." maxWidth="max-w-2xl"
        footer={<><Button variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>Cancel</Button><Button variant="primary" size="sm" onClick={handleAdd} isLoading={isSubmitting}>Create BOQ</Button></>}>
        <form onSubmit={handleAdd}>{renderFormFields()}</form>
      </Modal>

      {/* ════════════════════ EDIT MODAL ════════════════════ */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit BOQ Schedule" description={`Edit — ${selectedBoq?.boqCode}`} maxWidth="max-w-2xl"
        footer={<><Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(false)} disabled={isSubmitting}>Cancel</Button><Button variant="primary" size="sm" onClick={handleEdit} isLoading={isSubmitting}>Save Changes</Button></>}>
        <form onSubmit={handleEdit}>{renderFormFields()}</form>
      </Modal>

      {/* ════════════════════ VIEW MODAL ════════════════════ */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title={`BOQ — ${selectedBoq?.boqCode || ''}`} description="BOQ schedule details, linked project, site, and document files." maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
              <span>{selectedBoq?.id?.substring(0, 12)}…</span>
              <button onClick={() => copy(selectedBoq?.id, 'vid')} className="hover:text-emerald-600 p-1">{copiedField === 'vid' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>Close</Button>
              {isManagerOrAdmin && selectedBoq && (
                <>
                  <Button variant="outline" size="sm" onClick={() => { setIsViewModalOpen(false); openUpload(selectedBoq); }}><CloudUpload className="h-4 w-4 mr-1.5" />Upload Excel</Button>
                  <Button variant="primary" size="sm" onClick={() => { setIsViewModalOpen(false); openEdit(selectedBoq); }}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
                </>
              )}
            </div>
          </div>
        }>
        {selectedBoq && (() => {
          const links = Array.isArray(selectedBoq.docsLinks) ? selectedBoq.docsLinks : selectedBoq.docsLinks ? [selectedBoq.docsLinks] : [];
          return (
            <div className="space-y-3 text-xs">
              <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 p-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">BOQ Code</span>
                  <h3 className="text-lg font-extrabold font-mono text-slate-900 mt-0.5">{selectedBoq.boqCode}</h3>
                </div>
                {selectedBoq.validity && (
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider block">Valid Until</span>
                    <div className="flex items-center gap-1 text-amber-800 font-bold text-sm mt-0.5"><Calendar className="h-4 w-4" />{fmtDate(selectedBoq.validity)}</div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1 mb-2"><Briefcase className="h-3.5 w-3.5 text-sky-600" />Project</span>
                  {selectedBoq.project ? (<div><h5 className="font-bold text-sm text-slate-900">{selectedBoq.project.name}</h5>{selectedBoq.project.tenderId && <p className="font-mono text-[11px] text-slate-500 mt-0.5">Ref: {selectedBoq.project.tenderId}</p>}</div>) : <p className="text-slate-400 italic">None</p>}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1 mb-2"><MapPin className="h-3.5 w-3.5 text-slate-500" />Site</span>
                  {selectedBoq.site ? <h5 className="font-bold text-sm text-slate-900">{selectedBoq.site.name}</h5> : <p className="text-slate-400 italic">None</p>}
                </div>
              </div>
              {links.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1 mb-2"><CloudUpload className="h-3.5 w-3.5 text-indigo-500" />Stored Files / Links ({links.length})</span>
                  <div className="space-y-1.5">
                    {links.map((link, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-[11px] text-slate-600 truncate max-w-xs">{link}</span>
                        </div>
                        {isSafeResourceUrl(link) && (
                          <a href={link} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition">
                            <ExternalLink className="h-3 w-3" />Open
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-3">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Created: {fmtDate(selectedBoq.createdAt)}</span>
                {selectedBoq.createdBy && <span className="flex items-center gap-1"><User className="h-3 w-3" />By: {selectedBoq.createdBy}</span>}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ════════════════════ BOQ ITEMS MODAL ════════════════════ */}
      <Modal isOpen={isItemsModalOpen} onClose={() => setIsItemsModalOpen(false)}
        title={`Line Items — ${selectedBoq?.boqCode || ''}`}
        description="All BOQ line items imported from Excel for this schedule."
        maxWidth="max-w-6xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-400 flex items-center gap-1"><Hash className="h-3.5 w-3.5" />{boqItems.length} item{boqItems.length !== 1 ? 's' : ''}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsItemsModalOpen(false)}>Close</Button>
              {isManagerOrAdmin && selectedBoq && (
                <Button variant="primary" size="sm" onClick={() => { setIsItemsModalOpen(false); openUpload(selectedBoq); }}>
                  <CloudUpload className="h-4 w-4 mr-1.5" />Upload More Items
                </Button>
              )}
            </div>
          </div>
        }>
        {isLoadingItems ? (
          <AsyncStatus message="Loading BOQ line items…" description="Retrieving quantities, rates and delivery totals for this BOQ." />
        ) : itemsError ? <p role="alert" className="p-4 text-sm text-red-600">{itemsError}</p> : boqItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ListOrdered className="h-12 w-12 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-600">No items yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Upload an Excel sheet to import BOQ line items.</p>
            {isManagerOrAdmin && <Button variant="primary" size="sm" onClick={() => { setIsItemsModalOpen(false); openUpload(selectedBoq); }}><CloudUpload className="h-4 w-4 mr-1.5" />Upload Excel</Button>}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <tr>
                    {['SL No', 'Description of Work', 'Specification', 'Unit', 'Quantity', 'Rate (₹)', 'Amount (₹)', 'Item Left', 'Received Qty', 'Received Photos', 'Extra Item', 'Remarks', 'Actions'].map((h) => (
                      <th key={h} className="py-2.5 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {boqItems.map((item, idx) => {
                    const images = parseItemImages(item.itemReceivedImage);
                    return (
                      <tr key={item.id} className={`hover:bg-slate-50/60 font-mono ${idx % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                        <td className="py-2 px-3 font-bold text-slate-600 text-center">{item.slNo || idx + 1}</td>
                        <td className="py-2 px-3 font-sans text-slate-800 max-w-[220px]"><span className="line-clamp-2">{item.itemName || '—'}</span></td>
                        <td className="py-2 px-3 text-slate-600 max-w-[160px]"><span className="line-clamp-2">{item.specification || '—'}</span></td>
                        <td className="py-2 px-3 text-center text-slate-500 whitespace-nowrap">{item.unit || '—'}</td>
                        <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">{item.quantity || '—'}</td>
                        <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">{item.rate != null ? Number(item.rate).toLocaleString('en-IN') : '—'}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 whitespace-nowrap">{item.amount != null ? Number(item.amount).toLocaleString('en-IN') : '—'}</td>
                        <td className="py-2 px-3 text-slate-600">{item.itemLeft ?? '—'}</td>
                        <td className="py-2 px-3 text-slate-600">{item.itemReceivedTotalQuantity ?? '—'}{Number(item.itemReceivedTotalQuantity) > Number(item.quantity) && Number.isFinite(Number(item.quantity)) ? <span className="mt-1 block text-xs text-amber-700">Exceeds planned quantity by {Number(item.itemReceivedTotalQuantity) - Number(item.quantity)}</span> : null}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {images.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => openReceivedImagesModal(item)}
                              title="View Delivery Photos"
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-50 border border-teal-200 px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-100 transition-colors shadow-2xs"
                            >
                              <Camera className="h-3 w-3 text-teal-600" />
                              <span>{images.length} photo{images.length !== 1 ? 's' : ''}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openReceivedImagesModal(item)}
                              title="Upload Delivery Photo"
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
                            >
                              <Camera className="h-3 w-3 text-slate-400" />
                              <span>+ Photo</span>
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{item.extraItem || '—'}</td>
                        <td className="py-2 px-3 text-slate-500 max-w-[150px]"><span className="line-clamp-2">{item.remarks || '—'}</span></td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openReceivedImagesModal(item)}
                              title="View / Upload Delivery Photos"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                              <Camera className="h-3 w-3" />
                              Photos ({images.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => openExtraItems(item)}
                              title="View Extra Items"
                              className="inline-flex items-center gap-1 rounded-lg bg-violet-50 border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                            >
                              <PackagePlus className="h-3 w-3" />
                              Extra Items
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {boqItems.some((i) => i.amount != null) && (
                  <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                    <tr>
                      <td colSpan={6} className="py-2.5 px-3 font-bold text-slate-700 text-right">Total Amount:</td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-emerald-800 font-mono">
                        ₹{boqItems.reduce((s, i) => s + (Number(i.amount) || 0), 0).toLocaleString('en-IN')}
                      </td>
                      <td colSpan={6}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* ════════════════════ EXTRA BOQ ITEMS MODAL ════════════════════ */}
      <Modal
        isOpen={isExtraItemsModalOpen}
        onClose={() => {
          if (selectedExtraItem || decisionTarget) return;
          closeExtraItems();
        }}
        title={`Extra Items — ${selectedBoqItem?.itemName || selectedBoqItem?.slNo || ''}`}
        description="Click a request to open its details. Variation items stay on this BOQ line."
        maxWidth="max-w-4xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <PackagePlus className="h-3.5 w-3.5" />
              {extraItems.length} extra item{extraItems.length !== 1 ? 's' : ''}
            </span>
            <Button variant="outline" size="sm" onClick={closeExtraItems}>Close</Button>
          </div>
        }
      >
        {isManagerOrAdmin && (
          <form onSubmit={addExtraItem} className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4">
            <input required value={extraForm.itemName} onChange={(e) => setExtraForm((p) => ({ ...p, itemName: e.target.value }))} placeholder="Item name" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs sm:col-span-2" />
            <input value={extraForm.itemQuantity} onChange={(e) => setExtraForm((p) => ({ ...p, itemQuantity: e.target.value }))} placeholder="Quantity" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
            <input value={extraForm.requestedBy} onChange={(e) => setExtraForm((p) => ({ ...p, requestedBy: e.target.value }))} placeholder="Requested by" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
            <Button type="submit" variant="primary" size="sm" isLoading={extraSaving}>Add</Button>
          </form>
        )}
        {isLoadingExtra ? (
          <AsyncStatus message="Loading extra items…" description="Checking variation requests and their approval status." />
        ) : extraError ? <p role="alert" className="p-4 text-sm text-red-600">{extraError}</p> : extraItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <PackagePlus className="h-12 w-12 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-600">No extra items yet</p>
            <p className="text-xs text-slate-400 mt-1">No variation items have been recorded for this BOQ line item.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <tr>
                    {['#', 'Item Name', 'Quantity', 'Requested By', 'Decided By', 'Status', 'Request remarks', 'Decision remarks', 'Created', ...(isAdmin ? ['Actions'] : [])].map((h) => (
                      <th key={h} className="py-2.5 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {extraItems.map((item, idx) => {
                    const status = extraItemStatus(item);
                    return (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      title="View extra item details"
                      onClick={() => setSelectedExtraItem(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedExtraItem(item);
                        }
                      }}
                      className={`cursor-pointer hover:bg-violet-50/80 focus:outline-none focus:bg-violet-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/30'}`}
                    >
                      <td className="py-2 px-3 font-bold text-slate-500 text-center font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-sans text-slate-800 font-medium max-w-[200px]">
                        <span className="line-clamp-2 inline-flex items-start gap-1.5">
                          <Eye className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-500" />
                          <span>{item.itemName || '—'}</span>
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">{item.itemQuantity || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">{item.requestedBy || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">{item.approvedBy || '—'}</td>
                      <td className="py-2 px-3">{extraStatusBadge(status)}</td>
                      <td className="py-2 px-3 text-slate-500 max-w-[150px]">
                        <span className="line-clamp-2">{item.remarks || '—'}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-500 max-w-[150px]">
                        <span className="line-clamp-2">{item.decisionRemarks || '—'}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap font-mono">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      {isAdmin && (
                        <td className="py-2 px-3 whitespace-nowrap">
                          {status === 'PENDING' ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openDecision(item, 'ACCEPTED'); }}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                <CheckCircle2 className="h-3 w-3" />Accept
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openDecision(item, 'REJECTED'); }}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                <XCircle className="h-3 w-3" />Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(selectedExtraItem)}
        onClose={() => {
          if (decisionTarget) return;
          closeExtraDetail();
        }}
        title={selectedExtraItem?.itemName || 'Extra item request'}
        description="Details of this extra item request."
        maxWidth="max-w-lg"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {isAdmin && selectedExtraItem && extraItemStatus(selectedExtraItem) === 'PENDING' && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openDecision(selectedExtraItem, 'ACCEPTED')}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <CheckCircle2 className="h-3 w-3" />Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => openDecision(selectedExtraItem, 'REJECTED')}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <XCircle className="h-3 w-3" />Reject
                  </button>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={closeExtraDetail}>Close</Button>
          </div>
        }
      >
        {selectedExtraItem && (
          <div className="space-y-3 text-xs">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/80 p-4">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-violet-700 block">Item name</span>
                <h3 className="mt-0.5 text-base font-extrabold text-slate-900">{selectedExtraItem.itemName || '—'}</h3>
              </div>
              {extraStatusBadge(extraItemStatus(selectedExtraItem))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Quantity</span>
                <p className="font-mono text-sm font-semibold text-slate-800">{selectedExtraItem.itemQuantity || '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1 mb-1"><User className="h-3.5 w-3.5" />Requested by</span>
                <p className="text-sm font-semibold text-slate-800">{selectedExtraItem.requestedBy || '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Decided by</span>
                <p className="text-sm font-semibold text-slate-800">{selectedExtraItem.approvedBy || '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1 mb-1"><ListOrdered className="h-3.5 w-3.5" />BOQ line</span>
                <p className="text-sm font-semibold text-slate-800">{selectedBoqItem?.slNo ? `${selectedBoqItem.slNo}. ` : ''}{selectedBoqItem?.itemName || '—'}</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Request remarks</span>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{selectedExtraItem.remarks || '—'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Decision remarks</span>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{selectedExtraItem.decisionRemarks || '—'}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Requested: {fmtDate(selectedExtraItem.createdAt)}</span>
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Updated: {fmtDate(selectedExtraItem.updatedAt)}</span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(decisionTarget)}
        onClose={closeDecision}
        onConfirm={submitDecision}
        title={decisionTarget?.action === 'REJECTED' ? 'Reject this extra item?' : 'Accept this extra item?'}
        description={decisionTarget
          ? `${decisionTarget.item.itemName || 'This extra item'} stays on the BOQ line. Add remarks, then confirm.`
          : ''}
        confirmText={decisionTarget?.action === 'REJECTED' ? 'Confirm reject' : 'Confirm accept'}
        variant={decisionTarget?.action === 'REJECTED' ? 'danger' : 'primary'}
        isLoading={decisionSaving}
      >
        <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
          Remarks
          <textarea
            value={decisionRemarks}
            onChange={(event) => {
              setDecisionRemarks(event.target.value);
              if (decisionError) setDecisionError('');
            }}
            rows={3}
            maxLength={1000}
            placeholder="Why is this extra item being accepted or rejected?"
            className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--md-sidebar)', border: '1px solid var(--md-border-strong)', color: 'var(--md-on)' }}
          />
        </label>
        {decisionError && <p className="mt-2 text-xs" style={{ color: '#ef9a9a' }}>{decisionError}</p>}
      </ConfirmDialog>

      {/* ════════════════════ ITEM RECEIVED DELIVERY PHOTOS MODAL ════════════════════ */}
      <Modal
        isOpen={isImagesModalOpen}
        onClose={() => {
          setIsImagesModalOpen(false);
          setImagePreviewUrl('');
          setImageFile(null);
        }}
        title={`Delivery Verification Photos — ${selectedBoqItemForImages?.itemName || `Item #${selectedBoqItemForImages?.slNo}` || ''}`}
        description="Delivery and receipt photos, with where each one was taken."
        maxWidth="max-w-5xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <Camera className="h-3.5 w-3.5 text-emerald-600" />
              {receivedImages.length} photo{receivedImages.length !== 1 ? 's' : ''} stored in cloud bucket
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsImagesModalOpen(false);
                setImagePreviewUrl('');
                setImageFile(null);
              }}
            >
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Item Quick Info Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Item SL No</span>
              <span className="font-mono font-bold text-slate-800">{selectedBoqItemForImages?.slNo || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Quantity</span>
              <span className="font-mono font-semibold text-slate-800">
                {selectedBoqItemForImages?.quantity || '—'} {selectedBoqItemForImages?.unit || ''}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Received Qty</span>
              <span className="font-mono font-bold text-emerald-700">
                {selectedBoqItemForImages?.itemReceivedTotalQuantity || '0'} {selectedBoqItemForImages?.unit || ''}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Item Left</span>
              <span className="font-mono font-semibold text-amber-700">
                {selectedBoqItemForImages?.itemLeft || '—'}
              </span>
            </div>
          </div>

          {/* Upload New Verification Photo Box */}
          <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                <CloudUpload className="h-4 w-4 text-emerald-600" />
                Upload Received Verification Photo
              </h4>
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full font-semibold">
                GCS Bucket Storage
              </span>
            </div>

            {uploadImageError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{uploadImageError}</span>
              </div>
            )}

            <form onSubmit={handleUploadReceivedImage} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                {/* Photo Selection / Preview Drop Zone */}
                <div className="md:col-span-6">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Select Photo <span className="text-rose-500">*</span>
                  </label>
                  {!imageFile ? (
                    <div
                      onClick={() => itemImageInputRef.current?.click()}
                      className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-emerald-300 rounded-xl bg-white/80 hover:bg-emerald-50/50 hover:border-emerald-400 cursor-pointer transition text-center min-h-[110px]"
                    >
                      <Camera className="h-7 w-7 text-emerald-600 mb-1" />
                      <p className="text-xs font-semibold text-slate-700">Click to capture or upload photo</p>
                      <p className="text-[10px] text-slate-400">JPG, PNG, WEBP, GIF up to 10MB</p>
                      <input
                        ref={itemImageInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-2.5 border border-emerald-200 rounded-xl bg-white">
                      {imagePreviewUrl ? (
                        <img
                          src={imagePreviewUrl}
                          alt="Preview"
                          className="h-16 w-16 object-cover rounded-lg border border-slate-200 shadow-2xs shrink-0"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{imageFile.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{(imageFile.size / 1024).toFixed(1)} KB</p>
                        <button
                          type="button"
                          onClick={() => {
                            setImageFile(null);
                            setImagePreviewUrl('');
                            if (itemImageInputRef.current) itemImageInputRef.current.value = '';
                          }}
                          className="text-[11px] text-rose-600 hover:underline font-medium mt-0.5 inline-flex items-center gap-1"
                        >
                          <X className="h-3 w-3" /> Change Photo
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* GPS Location & SL No */}
                <div className="md:col-span-6 space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        GPS Coordinates (Lat / Long)
                      </label>
                      <button
                        type="button"
                        onClick={handleGetGpsLocation}
                        disabled={isLocatingGps}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded-lg transition"
                      >
                        <Compass className={`h-3 w-3 ${isLocatingGps ? 'animate-spin' : ''}`} />
                        {isLocatingGps ? 'Locating…' : 'Detect GPS Location'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          type="number"
                          step="any"
                          placeholder="Latitude (e.g. 12.9716)"
                          value={imageLat}
                          onChange={(e) => setImageLat(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          step="any"
                          placeholder="Longitude (e.g. 77.5946)"
                          value={imageLong}
                          onChange={(e) => setImageLong(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {gpsStatusMessage && (
                      <p className="text-[11px] text-emerald-800 font-medium mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>{gpsStatusMessage}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Delivered quantity ({selectedBoqItemForImages?.unit || 'unit'}) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Amount received with this photo"
                      value={imageQty}
                      onChange={(e) => setImageQty(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Serial No. (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1"
                        value={imageSlNo}
                        onChange={(e) => setImageSlNo(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        isLoading={isUploadingImage}
                        disabled={!imageFile || !imageQty}
                        className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                      >
                        <CloudUpload className="h-3.5 w-3.5 mr-1" />
                        Upload to GCS
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {/* Stored Photos Gallery */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-slate-500" />
                Stored Received Verification Photos ({receivedImages.length})
                <EmployeeAppBadge label="Phone media" className="ml-1 normal-case tracking-normal" />
              </h4>
              <button
                type="button"
                onClick={() => openReceivedImagesModal(selectedBoqItemForImages)}
                className="text-[11px] text-slate-500 hover:text-emerald-700 flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingImages ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {isLoadingImages ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading photos…
              </div>
            ) : receivedImages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
                <Camera className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No delivery photos uploaded yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Use the upload form above to attach delivery photos with GPS coordinates to verify received goods.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {receivedImages.map((img, idx) => {
                  const safeUrl = getSafeImageUrl(img.imageLink);
                  const hasCoords = img.lat != null && img.long != null && !Number.isNaN(Number(img.lat));
                  return (
                    <div
                      key={idx}
                      className="group relative rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col"
                    >
                      {/* Image Thumbnail with Overlay */}
                      <div
                        className="relative aspect-4/3 bg-slate-100 overflow-hidden cursor-pointer"
                        onClick={() => setLightboxImage(img)}
                      >
                        <img
                          src={safeUrl}
                          alt={`Item Photo ${img.slNo || idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2 text-white text-[11px]">
                          <span className="flex items-center gap-1 font-medium"><ZoomIn className="h-3.5 w-3.5" /> Click to enlarge</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </div>

                        {/* SL No Badge */}
                        <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-md shadow-xs">
                          #{img.slNo || idx + 1}
                        </div>

                        {/* Delete Button */}
                        {isManagerOrAdmin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteReceivedImage(idx, img.slNo);
                            }}
                            title="Delete this photo"
                            className="absolute top-2 right-2 bg-rose-600/90 hover:bg-rose-700 text-white p-1 rounded-md shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Meta Details */}
                      <div className="p-3 text-xs space-y-1.5 flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          {/* GPS Coordinates */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GPS Location</span>
                            {hasCoords ? (
                              <a
                                href={`https://www.google.com/maps?q=${img.lat},${img.long}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-sky-700 hover:text-sky-900 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 transition"
                                title="View on Google Maps"
                              >
                                <MapPin className="h-3 w-3 text-sky-600 shrink-0" />
                                <span>{Number(img.lat).toFixed(4)}, {Number(img.long).toFixed(4)}</span>
                                <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                              </a>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No coordinates</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-slate-600">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivered</span>
                            <span className="text-[11px] font-mono font-semibold text-emerald-800">
                              {img.quantity != null && img.quantity !== ''
                                ? `${img.quantity} ${selectedBoqItemForImages?.unit || ''}`
                                : 'Not recorded'}
                            </span>
                          </div>

                          {/* Uploaded By UID */}
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Uploaded By</span>
                            <span className="text-[11px] font-mono text-slate-700 truncate max-w-[130px]" title={img.createdBy || 'Unknown UID'}>
                              {img.creator?.name ? img.creator.name : img.createdBy ? `UID: ${String(img.createdBy).substring(0, 8)}…` : '—'}
                            </span>
                          </div>

                          {/* Timestamp */}
                          <div className="flex items-center justify-between text-slate-500 text-[11px]">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Uploaded At</span>
                            <span className="font-mono">
                              {img.createdAt ? new Date(img.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                          </div>
                        </div>

                        {/* Bottom Direct Link */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          <button
                            type="button"
                            onClick={() => setLightboxImage(img)}
                            className="text-emerald-700 hover:text-emerald-900 font-semibold inline-flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" /> View Photo
                          </button>
                          {img.imageLink && isSafeResourceUrl(img.imageLink) && (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-sky-700 inline-flex items-center gap-1"
                              title="Open original file"
                            >
                              <ExternalLink className="h-3 w-3" /> Original
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Lightbox / Zoom Modal */}
      {lightboxImage && (
        <Modal
          isOpen={Boolean(lightboxImage)}
          onClose={() => setLightboxImage(null)}
          title={`Received Photo #${lightboxImage.slNo || ''}`}
          description={`Captured for ${selectedBoqItemForImages?.itemName || 'BOQ Line Item'}`}
          maxWidth="max-w-4xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                {lightboxImage.lat && lightboxImage.long && (
                  <a
                    href={`https://www.google.com/maps?q=${lightboxImage.lat},${lightboxImage.long}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-700 hover:underline font-bold"
                  >
                    <MapPin className="h-3.5 w-3.5 text-sky-600" />
                    Maps: {lightboxImage.lat}, {lightboxImage.long}
                  </a>
                )}
                {lightboxImage.createdBy && (
                  <span>· UID: {lightboxImage.createdBy}</span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setLightboxImage(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="flex flex-col items-center justify-center p-2 bg-slate-950/5 rounded-2xl">
            <img
              src={getSafeImageUrl(lightboxImage.imageLink)}
              alt={`Received Item Photo #${lightboxImage.slNo}`}
              className="max-h-[65vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
            />
          </div>
        </Modal>
      )}

      {/* ════════════════════ UPLOAD MODAL ════════════════════ */}
      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)}
        title="Upload BOQ Excel"
        description={`Upload Excel sheet for BOQ: ${selectedBoq?.boqCode || ''} — file stored in GCS, items imported to database.`}
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(false)} disabled={isUploading}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleUploadSubmit} isLoading={isUploading} disabled={!excelFile}>
              <CloudUpload className="h-4 w-4 mr-1.5" />
              {excelFile ? `Upload & Import ${excelRows.length} Row${excelRows.length !== 1 ? 's' : ''}` : 'Select a File First'}
            </Button>
          </>
        }>
        <div className="space-y-4">
          {/* Column hint */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-3.5 text-xs text-blue-800">
            <p className="font-bold mb-2 flex items-center gap-1.5"><Table2 className="h-3.5 w-3.5" />Expected Excel Column Headers</p>
            <div className="flex flex-wrap gap-1.5">
              {['SL No', 'Description of Work', 'Specification', 'Unit', 'Quantity', 'Rate', 'Amount', 'Remarks'].map((col) => (
                <span key={col} className="bg-blue-100 border border-blue-200 rounded-md px-2 py-0.5 font-mono text-blue-700">{col}</span>
              ))}
            </div>
            <p className="mt-2 text-blue-600 font-medium">Column names are case-insensitive. Extra columns are ignored. The file is kept with the BOQ.</p>
          </div>

          {/* Upload error */}
          {uploadError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" /><span>{uploadError}</span>
            </div>
          )}

          {/* Progress */}
          {uploadProgress && (
            <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800 font-medium">
              <RefreshCw className="h-4 w-4 animate-spin text-indigo-600 shrink-0" /><span>{uploadProgress}</span>
            </div>
          )}

          {/* Drop zone */}
          {!excelFile ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all p-10 ${
                isDragOver ? 'border-emerald-500 bg-emerald-50 scale-[1.01]' : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40'
              }`}>
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${isDragOver ? 'bg-emerald-200' : 'bg-emerald-100'}`}>
                <CloudUpload className={`h-8 w-8 ${isDragOver ? 'text-emerald-700' : 'text-emerald-600'}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Drop your Excel file here</p>
                <p className="text-xs text-slate-400 mt-1">or click to browse — <span className="font-semibold">.xlsx, .xls, .csv</span></p>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
            </div>
          ) : (
            /* File selected state */
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                    <File className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{excelFile.name}</p>
                    <p className="text-xs text-slate-500">{(excelFile.size / 1024).toFixed(1)} KB · {excelRows.length} rows detected</p>
                  </div>
                </div>
                <button onClick={() => { setExcelFile(null); setExcelRows([]); setUploadError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          {excelRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Preview — first {Math.min(5, excelRows.length)} of {excelRows.length} rows:
              </p>
              <div className="rounded-xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                    <tr>
                      {['SL No', 'Description of Work', 'Specification', 'Unit', 'Qty', 'Rate', 'Amount', 'Remarks'].map((h) => (
                        <th key={h} className="py-2 px-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {excelRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50/50'}>
                        <td className="py-1.5 px-2.5">{r.slNo || i + 1}</td>
                        <td className="py-1.5 px-2.5 max-w-[180px] truncate font-sans">{r.itemName || '—'}</td>
                        <td className="py-1.5 px-2.5 max-w-[110px] truncate">{r.specification || '—'}</td>
                        <td className="py-1.5 px-2.5">{r.unit || '—'}</td>
                        <td className="py-1.5 px-2.5 text-right">{r.quantity || '—'}</td>
                        <td className="py-1.5 px-2.5 text-right">{r.rate || '—'}</td>
                        <td className="py-1.5 px-2.5 text-right font-bold">{r.amount || '—'}</td>
                        <td className="py-1.5 px-2.5 max-w-[110px] truncate">{r.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {excelRows.length > 5 && (
                  <div className="px-3 py-1.5 text-[11px] text-slate-400 border-t border-slate-100 bg-slate-50/50 flex items-center gap-1">
                    <Hash className="h-3 w-3" />…and {excelRows.length - 5} more rows will be imported
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ════════════════════ DELETE DIALOG ════════════════════ */}
      <ConfirmDialog isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleDelete}
        isLoading={isSubmitting} title={selectedBoq?.isActive === false ? 'Activate BOQ' : 'Deactivate BOQ'}
        description={selectedBoq?.isActive === false
          ? `Activate BOQ "${selectedBoq?.boqCode}" so it appears in lists again?`
          : `Deactivate BOQ "${selectedBoq?.boqCode}"? It stays in the database and is hidden from lists.`}
        confirmText={selectedBoq?.isActive === false ? 'Activate' : 'Deactivate'} variant="danger">
        {selectedBoq && (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-xs text-slate-700">
            <div className="flex justify-between"><span className="text-slate-500">Code:</span><span className="font-mono font-bold">{selectedBoq.boqCode}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Project:</span><span className="font-semibold">{selectedBoq.project?.name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Site:</span><span className="font-semibold">{selectedBoq.site?.name || '—'}</span></div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
