'use client';

import AsyncStatus from './AsyncStatus';
import { cn } from '@/lib/utils';

export function LoadingState({
  message = 'Loading data...',
  description = 'Please wait while we retrieve the latest information.',
  className,
  fullPage = false,
}) {
  return <div className={cn('flex items-center justify-center p-6', fullPage ? 'min-h-[60vh]' : 'py-8', className)}>
    <AsyncStatus message={message} description={description} />
  </div>;
}

export function SkeletonRow({ cols = 5 }) {
  return (
    <tr className="animate-pulse" style={{ borderBottom: '1px solid var(--md-surface2)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 rounded w-full max-w-[120px]" style={{ background: 'var(--md-surface3)' }} />
        </td>
      ))}
    </tr>
  );
}

export default LoadingState;
