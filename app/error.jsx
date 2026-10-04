'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, Home, ShieldAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import Credit from '@/components/layout/Credit';
import { CLIENT } from '@/config/client';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Log sanitized error internally without exposing DB connection details
    console.error('Unhandled client application error:', error?.message || error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8" style={{ background: 'var(--md-bg)' }}>
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'rgba(239,83,80,0.12)', color: '#ef5350', border: '1px solid rgba(239,83,80,0.2)' }}>
          <ShieldAlert className="h-8 w-8" />
        </div>
        
        <h1 className="mt-6 text-2xl font-bold tracking-tight" style={{ color: 'var(--md-on)' }}>
          Something went wrong
        </h1>
        
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--md-muted)' }}>
          An unexpected error occurred while processing your request. Please try again, or return to the dashboard.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={() => error?.name === 'ChunkLoadError' ? window.location.reload() : reset()}
            className="w-full sm:w-auto gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>

          <Button
            onClick={() => window.location.assign('/dashboard')}
            variant="outline"
            className="w-full sm:w-auto gap-2"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Button>
        </div>

        <p className="mt-6 text-xs" style={{ color: 'var(--md-dim)' }}>
          If this issue persists, please contact {CLIENT.name} system administrator.
        </p>
        <Credit className="mt-8" />
      </div>
    </div>
  );
}
