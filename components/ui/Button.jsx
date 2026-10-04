'use client';

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const variants = {
  primary:
    'text-white font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)] disabled:pointer-events-none disabled:opacity-40',
  success:
    'text-white font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)] disabled:pointer-events-none disabled:opacity-40',
  secondary:
    'font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)] disabled:pointer-events-none disabled:opacity-40',
  outline:
    'font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)] disabled:pointer-events-none disabled:opacity-40',
  danger:
    'text-white font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)] disabled:pointer-events-none disabled:opacity-40',
  ghost:
    'font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)] disabled:pointer-events-none disabled:opacity-40',
};

const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 py-2 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-6 text-base gap-2.5 rounded-lg',
  icon: 'h-9 w-9 p-0 rounded-lg flex items-center justify-center',
};

const variantStyles = {
  primary: { background: 'var(--md-primary)', color: '#fff' },
  success: { background: '#2e7d32', color: '#fff' },
  secondary: { background: 'var(--md-surface3)', color: 'var(--md-on)', border: '1px solid var(--md-border-strong)' },
  outline: { background: 'transparent', color: 'var(--md-muted)', border: '1px solid var(--md-border-strong)' },
  danger: { background: '#c62828', color: '#fff' },
  ghost: { background: 'transparent', color: 'var(--md-muted)' },
};

const variantHoverStyles = {
  primary: { background: 'var(--md-primary-hover)' },
  success: { background: '#388e3c' },
  secondary: { background: 'var(--md-border-strong)' },
  outline: { background: 'var(--md-surface3)', color: 'var(--md-on)' },
  danger: { background: '#d32f2f' },
  ghost: { background: 'var(--md-surface3)', color: 'var(--md-on)' },
};

export const Button = forwardRef(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    loadingLabel,
    disabled = false,
    children,
    style,
    onMouseOver,
    onMouseOut,
    ...props
  },
  ref
) {
  const baseStyle = variantStyles[variant] || variantStyles.primary;
  const hoverStyle = variantHoverStyles[variant] || variantHoverStyles.primary;

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center',
        variants[variant],
        sizes[size],
        className
      )}
      style={{ ...baseStyle, ...style }}
      onMouseOver={e => {
        Object.assign(e.currentTarget.style, hoverStyle);
        onMouseOver?.(e);
      }}
      onMouseOut={e => {
        Object.assign(e.currentTarget.style, baseStyle);
        onMouseOut?.(e);
      }}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin text-current" />}
      {isLoading && loadingLabel ? loadingLabel : children}
    </button>
  );
});

export default Button;
