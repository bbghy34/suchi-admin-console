import Link from 'next/link';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import Button from '@/components/ui/Button';
import Credit from '@/components/layout/Credit';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8" style={{ background: 'var(--md-bg)' }}>
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,167,38,0.1)', color: '#ffa726', border: '1px solid rgba(255,167,38,0.2)' }}>
          <FileQuestion className="h-8 w-8" />
        </div>
        
        <p className="mt-4 text-sm font-semibold uppercase tracking-wider" style={{ color: '#ffa726' }}>
          404 Error
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight" style={{ color: 'var(--md-on)' }}>
          Page not found
        </h1>
        
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--md-muted)' }}>
          The page or resource you are looking for does not exist or has been moved.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            href="/dashboard"
            className="w-full sm:w-auto gap-2"
          >
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Button>
        </div>
        <Credit className="mt-10" />
      </div>
    </div>
  );
}
