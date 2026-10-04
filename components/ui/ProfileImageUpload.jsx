'use client';

import { useState, useRef } from 'react';
import {
  Upload,
  Camera,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Cloud,
  Link as LinkIcon,
  X,
} from 'lucide-react';
import { isSafeResourceUrl, getSafeImageUrl } from '@/lib/security';
import { CLIENT } from '@/config/client';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function ProfileImageUpload({
  value = '',
  onChange,
  onUploadStateChange,
  disabled = false,
  label = 'Profile Photo',
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (file) => {
    if (!file) return;

    // Validate client-side
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Please select a valid image file (.jpg, .png, .webp, .gif, .svg).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image size cannot exceed 5MB.');
      return;
    }

    setUploadError('');
    setIsUploading(true);
    setUploadProgress(15);
    setPreviewError(false);
    if (onUploadStateChange) onUploadStateChange(true);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/employee-image');

    const headers = getAuthHeaders();
    Object.entries(headers).forEach(([k, v]) => {
      xhr.setRequestHeader(k, v);
    });

    let progressInterval = null;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        // Map transmission to server between 15% and 75%
        const percent = Math.min(75, Math.round(15 + (event.loaded / event.total) * 60));
        setUploadProgress(percent);
      }
    };

    xhr.upload.onload = () => {
      // Server is streaming and storing file into Google Cloud Storage
      setUploadProgress(80);
      progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev < 96) return prev + 2;
          return prev;
        });
      }, 200);
    };

    xhr.onload = () => {
      if (progressInterval) clearInterval(progressInterval);

      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json.success && json.data?.publicUrl) {
          setUploadProgress(100);
          setTimeout(() => {
            onChange(json.data.publicUrl);
            setIsUploading(false);
            setUploadProgress(0);
            if (onUploadStateChange) onUploadStateChange(false);
          }, 350);
        } else {
          setUploadError(json.message || 'Failed to upload image to storage.');
          setIsUploading(false);
          setUploadProgress(0);
          if (onUploadStateChange) onUploadStateChange(false);
        }
      } catch (e) {
        setUploadError('Invalid response received from server.');
        setIsUploading(false);
        setUploadProgress(0);
        if (onUploadStateChange) onUploadStateChange(false);
      }
    };

    xhr.onerror = () => {
      if (progressInterval) clearInterval(progressInterval);
      setUploadError('Network error while uploading image to storage.');
      setIsUploading(false);
      setUploadProgress(0);
      if (onUploadStateChange) onUploadStateChange(false);
    };

    xhr.send(formData);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onChange('');
    setUploadError('');
    setPreviewError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displaySrc = getSafeImageUrl(value);
  const hasImage = Boolean(displaySrc && isSafeResourceUrl(displaySrc) && !previewError);

  // Circular progress calculations (Radius = 30, Circumference ≈ 188.5)
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (circumference * uploadProgress) / 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-xs font-medium text-sky-600 hover:text-sky-700 transition-colors inline-flex items-center gap-1"
        >
          <LinkIcon className="h-3 w-3" />
          {showUrlInput ? 'Hide URL input' : 'Enter image URL manually'}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        onChange={(e) => handleFileSelect(e.target.files?.[0])}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Main Uploader / Preview Box */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative overflow-hidden rounded-2xl border transition-all ${
          isDragging
            ? 'border-sky-200 bg-sky-50/80 ring-2 ring-sky-500/20'
            : isUploading
            ? 'border-sky-200 bg-sky-50/80 p-5 shadow-xs'
            : hasImage
            ? 'border-slate-200 bg-slate-50/60 p-4'
            : 'border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400 p-5'
        }`}
      >
        {isUploading ? (
          /* ================= CIRCULAR & RELEVANT LOADING BAR ================= */
          <div className="flex flex-col items-center justify-center py-4 text-center">
            {/* Circular Progress Ring */}
            <div className="relative mb-3.5 flex items-center justify-center">
              <svg className="w-20 h-20 -rotate-90 transform" viewBox="0 0 72 72">
                {/* Background track circle */}
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  className="text-slate-200"
                  strokeWidth="5.5"
                  stroke="currentColor"
                  fill="transparent"
                />
                {/* Animated Gradient Progress Arc */}
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  stroke="url(#gcsCircularGradient)"
                  strokeWidth="5.5"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  strokeLinecap="round"
                  fill="transparent"
                  style={{
                    transition: 'stroke-dashoffset 250ms ease-out',
                  }}
                />
                <defs>
                  <linearGradient id="gcsCircularGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0284c7" />
                    <stop offset="60%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Center Content Inside Circle */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-800">
                {uploadProgress >= 100 ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 animate-bounce" />
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <Cloud className="h-4 w-4 text-sky-600 animate-pulse" />
                    <span className="text-xs font-bold font-mono text-slate-800 mt-0.5 leading-none">
                      {uploadProgress}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Descriptive Status */}
            <p className="text-sm font-semibold text-slate-800">
              {uploadProgress >= 100
                ? 'Upload Complete!'
                : uploadProgress >= 78
                ? 'Storing in the image bucket...'
                : 'Uploading image...'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Image storage • {CLIENT.storageBucket}
            </p>

            {/* Linear Progress Bar */}
            <div className="w-52 sm:w-60 mt-3 h-2 rounded-full bg-slate-200/80 overflow-hidden shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : hasImage ? (
          /* Preview state with photo */
          <div className="flex flex-col sm:flex-row items-center sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative group shrink-0">
                <img
                  src={displaySrc}
                  alt="Profile preview"
                  onError={() => setPreviewError(true)}
                  className="h-16 w-16 rounded-2xl object-cover border-2 border-white shadow-md shadow-slate-200"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Change photo"
                  className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                >
                  <Camera className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-1 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <Cloud className="h-3 w-3 text-emerald-600" />
                  Stored in the image bucket
                </div>
                <p className="text-xs text-slate-500 font-mono truncate max-w-xs sm:max-w-sm" title={value}>
                  {value}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition-colors"
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                Change
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:text-rose-800 shadow-2xs transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          /* Empty / Upload Prompt State */
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center cursor-pointer text-center py-2 group"
          >
            <div className="mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100/80 text-sky-600 shadow-2xs transition-transform group-hover:scale-105">
              <Camera className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                <span className="text-sky-600 hover:underline">Click to upload photo</span> or drag & drop
              </p>
              <p className="text-xs text-slate-500">
                JPEG, PNG, WEBP, GIF up to 5MB • Saves automatically to image storage
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Manual URL Input drawer */}
      {showUrlInput && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
          <label className="block text-xs font-medium text-slate-600">
            Direct Image URL (HTTP/HTTPS)
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://storage.googleapis.com/... or https://..."
              value={value || ''}
              onChange={(e) => {
                setPreviewError(false);
                onChange(e.target.value);
              }}
              className="block flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 text-xs"
                title="Clear URL"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {uploadError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-800 animate-fadeIn">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
}
