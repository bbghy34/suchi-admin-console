'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';
import { cn } from '@/lib/utils';

export function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while fetching information. Please try again.',
  onRetry,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 py-16 bg-rose-50/40 rounded-2xl border border-rose-200/80 shadow-sm transition-all',
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 mb-4 shadow-sm">
        <AlertCircle className="h-7 w-7 stroke-[1.75]" />
      </div>
      <h3 className="text-base font-semibold text-rose-950">{title}</h3>
      <p className="mt-1.5 text-sm text-rose-700/80 max-w-md leading-relaxed">{message}</p>
      
      {onRetry && (
        <div className="mt-5">
          <Button
            onClick={onRetry}
            variant="outline"
            className="border-rose-200 text-rose-700 hover:bg-rose-100/60 gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

export default ErrorState;
