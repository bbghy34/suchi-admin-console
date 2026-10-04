'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from './Button';

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'max-w-lg',
  zIndex = 50,
  // Off by default so a stray click outside (or Escape while a date picker is open) cannot throw away a half-filled form.
  dismissible = false,
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && dismissible) onClose?.();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, dismissible]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 transition-opacity"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={dismissible ? onClose : undefined}
      />

      {/* Modal Dialog */}
      <div
        ref={modalRef}
        className={cn(
          'relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl transition-all',
          maxWidth
        )}
        style={{
          background: 'var(--md-surface2)',
          border: '1px solid var(--md-surface3)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--md-border)' }}
        >
          <div>
            {title && <h3 className="text-lg font-semibold" style={{ color: 'var(--md-on)' }}>{title}</h3>}
            {description && <p className="mt-0.5 text-sm" style={{ color: 'var(--md-muted)' }}>{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#d32f2f] text-white shadow-sm transition-colors hover:bg-[#b71c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef5350] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface2)]"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
            <span className="sr-only">Close modal</span>
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div
            className="flex shrink-0 items-center justify-end gap-3 px-6 py-3.5"
            style={{ borderTop: '1px solid var(--md-border)', background: 'var(--md-surface)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
