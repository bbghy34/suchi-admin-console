'use client';

import { LogOut } from 'lucide-react';

/** Signing out ends the single Luit admin session on the server too. */
export default function SignOutButton() {
  async function signOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.href = '/login';
    }
  }
  return (
    <button
      type="button"
      onClick={signOut}
      aria-label="Sign out"
      title="Sign out"
      className="rounded-lg border border-[var(--md-border)] p-1.5 text-mat-muted transition-colors hover:text-mat-on"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
