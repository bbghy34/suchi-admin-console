import Link from 'next/link';
import Image from 'next/image';
import { LogIn } from 'lucide-react';
import { BRAND } from '@/lib/branding';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-mat-surface/80 backdrop-blur" style={{ borderBottom: '1px solid var(--md-border)' }}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 transition hover:opacity-90">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
            <Image
              src={BRAND.logo}
              alt={`${BRAND.company} logo`}
              width={40}
              height={40}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="leading-tight">
            <span className="luit-wordmark block">
              {BRAND.product}
            </span>
            <span className="luit-wordmark-sub mt-1 block">
              {BRAND.company}
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-mat-on transition-colors hover:bg-mat-surface3"
            style={{ border: '1px solid var(--md-border-strong)' }}
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
