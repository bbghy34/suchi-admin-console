'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Lock,
  Mail,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { validateEmail } from '@/lib/validation';
import { safeInternalPath } from '@/lib/security';
import { BRAND } from '@/lib/branding';
import Credit from '@/components/layout/Credit';
import { SESSION_TTL_SECONDS } from '@/lib/session';
import Button from '@/components/ui/Button';
import { CLIENT } from '@/config/client';

const SESSION_HOURS = Math.round(SESSION_TTL_SECONDS / 3600);

export default function LoginPage() {
  const toast = useToast();
  const { user, isLoading: isAuthLoading, loginUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasRedirected = useRef(false);

  const goToPath = useCallback((path) => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    // Full navigation. Client-side router.push/replace can stay pending after
    // the auth cookie is set, which leaves the sign-in button spinning until refresh.
    window.location.assign(safeInternalPath(path));
  }, []);

  // If already authenticated, redirect to /dashboard
  useEffect(() => {
    if (!isAuthLoading && user) {
      goToPath(user.role === 'T' ? '/tenders/daily' : '/dashboard');
    }
  }, [user, isAuthLoading, goToPath]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      const msg = 'Please enter both email and password.';
      setErrorMessage(msg);
      toast.warning(msg);
      return;
    }

    const emailError = validateEmail(email.trim());
    if (emailError) {
      setErrorMessage(emailError);
      toast.error(emailError);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        const msg = data?.message || 'Authentication failed. Please verify your credentials.';
        setErrorMessage(msg);
        toast.error(msg);
        setIsSubmitting(false);
        return;
      }

      toast.success(`Welcome back, ${data.employee?.name || 'User'}!`);
      loginUser(data.token, data.employee);

      const requested = new URLSearchParams(window.location.search).get('redirect');
      const home = data.employee?.role === 'T' ? '/tenders/daily' : '/dashboard';
      goToPath(requested || home);
    } catch (err) {
      console.error('Login request error:', err);
      const msg = 'Network error occurred. Please check your connection and try again.';
      setErrorMessage(msg);
      toast.error(msg);
      setIsSubmitting(false);
    }
  };

  // If loading existing auth session, show clean centered loading state
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--md-bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#5c6bc0' }} />
          <p className="text-xs font-medium" style={{ color: 'var(--md-muted)' }}>Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8"
      style={{ background: 'var(--md-bg)' }}
    >
      {/* Background gradient blur */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(ellipse, rgba(92,107,192,0.15), transparent 70%)' }}
        />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand */}
        <Link href="/" className="inline-flex items-center gap-3 group">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white transition-transform group-hover:scale-105 shadow-xl">
            <Image
              src={BRAND.logo}
              alt={`${BRAND.company} logo`}
              width={48}
              height={48}
              className="object-cover w-full h-full"
            />
          </div>
          <div className="text-left">
            <span className="luit-wordmark luit-wordmark-lg block">
              {BRAND.product}
            </span>
            <span className="luit-wordmark-sub mt-1 block">
              {BRAND.company}
            </span>
          </div>
        </Link>

        <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--md-on)' }}>
          Sign in
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--md-muted)' }}>
          Use your {BRAND.company} employee account to continue.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'var(--md-surface)',
            border: '1px solid var(--md-border)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          }}
        >
          {/* Error Message Box */}
          {errorMessage && (
            <div
              className="mb-6 flex items-start gap-3 rounded-xl p-4 animate-in fade-in duration-200"
              style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', color: '#ef9a9a' }}
              role="alert"
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#ef5350' }} />
              <div className="flex-1 text-sm font-medium leading-snug">
                {errorMessage}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
                <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: 'var(--md-muted)' }}
              >
                Work email
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5" style={{ color: 'var(--md-dim)' }}>
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`name@${CLIENT.emailDomain}`}
                  className="block w-full rounded-xl py-2.5 pl-10 pr-4 text-sm transition-all outline-none"
                  style={{
                    background: 'var(--md-surface2)',
                    border: '1px solid var(--md-border-strong)',
                    color: 'var(--md-on)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#5c6bc0'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(92,107,192,0.12)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--md-border-strong)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--md-muted)' }}
                >
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5" style={{ color: 'var(--md-dim)' }}>
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full rounded-xl py-2.5 pl-10 pr-11 text-sm transition-all outline-none"
                  style={{
                    background: 'var(--md-surface2)',
                    border: '1px solid var(--md-border-strong)',
                    color: 'var(--md-on)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#5c6bc0'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(92,107,192,0.12)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--md-border-strong)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 transition"
                  style={{ color: 'var(--md-dim)' }}
                  onMouseOver={e => e.currentTarget.style.color = 'var(--md-muted)'}
                  onMouseOut={e => e.currentTarget.style.color = 'var(--md-dim)'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {showPassword ? 'Hide password' : 'Show password'}
                  </span>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                style={{ boxShadow: '0 4px 16px rgba(92,107,192,0.4)' }}
                isLoading={isSubmitting}
                loadingLabel="Signing in…"
                disabled={isSubmitting}
              >
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </form>

          {/* Session notice */}
          <div
            className="mt-6 flex items-start justify-center gap-2 pt-5 text-center text-xs leading-relaxed"
            style={{ borderTop: '1px solid var(--md-surface2)', color: '#989aab' }}
          >
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#5c6bc0' }} />
            <span>
              {BRAND.accessNotice} Sessions end automatically after {SESSION_HOURS} hours; sign out when you leave a shared device.
            </span>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-xs font-medium transition"
            style={{ color: 'var(--md-dim)' }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--md-muted)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--md-dim)'}
          >
            ← Back to home
          </Link>
        </div>
        <Credit className="mt-8" />
      </div>
    </div>
  );
}
