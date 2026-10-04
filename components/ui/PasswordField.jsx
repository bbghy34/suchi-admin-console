'use client';

import { useState } from 'react';
import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { passwordStrength } from '@/lib/password-policy.mjs';

/**
 * Password input used everywhere a password is typed in the console.
 * `onEnter` lets a field inside a larger form run its own action on Enter
 * instead of submitting that form.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = 'new-password',
  error,
  hint,
  required = false,
  showStrength = false,
  onEnter,
}) {
  const [visible, setVisible] = useState(false);
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } } : undefined}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`w-full rounded-lg border bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#5c6bc0]/30 focus:border-[#5c6bc0] ${
            error ? 'border-rose-300' : 'border-slate-200'
          }`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-primary)]"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {showStrength && value ? <StrengthMeter value={value} /> : null}
    </div>
  );
}

function StrengthMeter({ value }) {
  const { checks, score, max, label } = passwordStrength(value);
  return (
    <div className="space-y-1.5 pt-0.5" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ background: i < score ? 'var(--md-primary)' : 'var(--md-border)' }}
            />
          ))}
        </div>
        <span className="w-12 text-right text-[11px] font-semibold text-slate-500">{label}</span>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1 text-[11px] ${c.pass ? 'text-slate-700' : 'text-slate-400'}`}>
            <Check className="h-3 w-3" style={{ color: c.pass ? 'var(--md-primary)' : 'var(--md-border-strong)' }} aria-hidden="true" />
            {c.label}
            <span className="sr-only">{c.pass ? '(done)' : '(not yet)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
