'use client';

import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_STYLES = {
  success: {
    container: { background: '#1b2a1b', border: '1px solid #2e7d32', color: '#a5d6a7' },
    iconColor: '#66bb6a',
    closeColor: '#4caf50',
  },
  error: {
    container: { background: '#2a1b1b', border: '1px solid #c62828', color: '#ef9a9a' },
    iconColor: '#ef5350',
    closeColor: '#e53935',
  },
  warning: {
    container: { background: '#2a221b', border: '1px solid #e65100', color: '#ffcc80' },
    iconColor: '#ffa726',
    closeColor: '#fb8c00',
  },
  info: {
    container: { background: '#1b1e2a', border: '1px solid #283593', color: '#9fa8da' },
    iconColor: '#7986cb',
    closeColor: '#5c6bc0',
  },
};

export function Toast({
  id,
  type = 'info',
  title,
  message,
  duration = 4000,
  onDismiss,
}) {
  const Icon = TOAST_ICONS[type] || Info;
  const style = TOAST_STYLES[type] || TOAST_STYLES.info;

  useEffect(() => {
    if (!duration || duration <= 0) return;

    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      role="alert"
      className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200"
      style={{ ...style.container, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" style={{ color: style.iconColor }} />
      <div className="flex-1 pr-2">
        {title && <h4 className="text-sm font-semibold leading-tight">{title}</h4>}
        {message && (
          <p className={cn('text-xs leading-relaxed', title ? 'mt-1 opacity-90' : 'text-sm font-medium')}>
            {message}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="shrink-0 rounded-lg p-1 transition-colors"
        style={{ color: style.closeColor }}
        onMouseOver={e => e.currentTarget.style.opacity = '0.7'}
        onMouseOut={e => e.currentTarget.style.opacity = '1'}
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default Toast;
