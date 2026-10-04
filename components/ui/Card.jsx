import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Card = forwardRef(function Card({ className, style, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl transition-all', className)}
      style={{
        background: 'var(--md-surface)',
        border: '1px solid var(--md-border)',
        boxShadow: 'var(--md-shadow)',
        ...style,
      }}
      {...props}
    />
  );
});

export const CardHeader = forwardRef(function CardHeader({ className, style, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      style={{ borderBottom: '1px solid var(--md-border)', ...style }}
      {...props}
    />
  );
});

export const CardTitle = forwardRef(function CardTitle({ className, style, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      style={{ color: 'var(--md-on)', ...style }}
      {...props}
    />
  );
});

export const CardDescription = forwardRef(function CardDescription({ className, style, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn('text-sm', className)}
      style={{ color: 'var(--md-muted)', ...style }}
      {...props}
    />
  );
});

export const CardContent = forwardRef(function CardContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('p-6 pt-4', className)}
      {...props}
    />
  );
});

export const CardFooter = forwardRef(function CardFooter({ className, style, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-3 px-6 py-4', className)}
      style={{ borderTop: '1px solid var(--md-border)', ...style }}
      {...props}
    />
  );
});

export default Card;
