'use client';

import { AlertTriangle, Info, Trash2, Loader2 } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { cn } from '@/lib/utils';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'primary'
  isLoading = false,
  children,
  zIndex = 70,
}) {
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const IconComponent = isDanger ? Trash2 : isWarning ? AlertTriangle : Info;

  const iconStyle = isDanger
    ? { background: 'rgba(239,83,80,0.12)', color: '#ef5350', border: '1px solid rgba(239,83,80,0.2)' }
    : isWarning
    ? { background: 'rgba(255,167,38,0.12)', color: '#ffa726', border: '1px solid rgba(255,167,38,0.2)' }
    : { background: 'rgba(92,107,192,0.12)', color: '#7986cb', border: '1px solid rgba(92,107,192,0.2)' };

  const confirmButtonStyle = isDanger
    ? { background: '#c62828', color: '#fff', border: 'none' }
    : isWarning
    ? { background: '#e65100', color: '#fff', border: 'none' }
    : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isLoading && onClose()}
      maxWidth="max-w-md"
      zIndex={zIndex}
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={isDanger || isWarning ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={isLoading}
            style={confirmButtonStyle}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </span>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-4">
        <div
          className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl')}
          style={iconStyle}
        >
          <IconComponent className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold" style={{ color: 'var(--md-on)' }}>{title}</h3>
          {description && (
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--md-muted)' }}>{description}</p>
          )}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
