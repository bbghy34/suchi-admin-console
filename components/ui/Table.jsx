'use client';

import { forwardRef, createContext, useContext } from 'react';
import { cn } from '@/lib/utils';
import AsyncStatus from './AsyncStatus';
import { Inbox } from 'lucide-react';

const InTableBodyContext = createContext(false);

export const Table = forwardRef(function Table({ className, ...props }, ref) {
  return (
    <div
      className="relative w-full overflow-x-auto rounded-xl"
      style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)', boxShadow: 'var(--md-shadow)' }}
    >
      <table
        ref={ref}
        className={cn('w-max min-w-full caption-bottom text-sm text-left', className)}
        {...props}
      />
    </div>
  );
});

export const TableHeader = forwardRef(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      className={cn('text-xs font-medium', className)}
      style={{ background: 'var(--md-sidebar)', borderBottom: '1px solid var(--md-border)', color: 'var(--md-dim)' }}
      {...props}
    />
  );
});

export const TableBody = forwardRef(function TableBody({ className, ...props }, ref) {
  return (
    <InTableBodyContext.Provider value={true}>
      <tbody
        ref={ref}
        className={cn('', className)}
        style={{ color: 'var(--md-muted)' }}
        {...props}
      />
    </InTableBodyContext.Provider>
  );
});

export const TableRow = forwardRef(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={cn('transition-colors', className)}
      style={{ borderBottom: '1px solid var(--md-border)' }}
      {...props}
    />
  );
});

export const TableHead = forwardRef(function TableHead({ className, ...props }, ref) {
  return (
    <th
      ref={ref}
      className={cn('h-11 px-4 text-left align-middle font-semibold', className)}
      style={{ color: 'var(--md-dim)' }}
      {...props}
    />
  );
});

export const TableCell = forwardRef(function TableCell({ className, ...props }, ref) {
  return (
    <td
      ref={ref}
      className={cn('p-4 align-middle text-sm', className)}
      style={{ color: 'var(--md-muted)' }}
      {...props}
    />
  );
});

export function TableLoadingState({ rows = 4, cols = 4, colSpan, message = 'Loading records…', description = 'Fetching the latest records for this view.' }) {
  const inTableBody = useContext(InTableBodyContext);

  const content = (
    <>
      <tr><td colSpan={colSpan || cols} className="px-4 py-3"><AsyncStatus compact message={message} description={description} /></td></tr>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="animate-pulse" style={{ borderBottom: '1px solid var(--md-border)' }}>
          {Array.from({ length: colSpan || cols }).map((_, cIdx) => (
            <td key={cIdx} className="p-4">
              <div className="h-4 w-full rounded" style={{ background: 'var(--md-surface3)' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );

  if (inTableBody) {
    return content;
  }

  return <tbody>{content}</tbody>;
}

export function TableEmptyState({
  title = 'No records found',
  description = 'There are no items to display at this moment.',
  icon: Icon = Inbox,
  action = null,
  colSpan = 5,
}) {
  const inTableBody = useContext(InTableBodyContext);

  const content = (
    <tr>
      <td colSpan={colSpan} className="p-12 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'var(--md-surface3)', color: 'var(--md-dim)' }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <h4 className="mt-3 text-sm font-semibold" style={{ color: 'var(--md-on)' }}>{title}</h4>
        <p className="mt-1 text-xs max-w-sm mx-auto" style={{ color: 'var(--md-dim)' }}>{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </td>
    </tr>
  );

  if (inTableBody) {
    return content;
  }

  return <tbody>{content}</tbody>;
}

export default Table;
