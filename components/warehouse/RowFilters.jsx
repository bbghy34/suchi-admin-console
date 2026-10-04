'use client';

import { fieldStyle } from './api';

export default function RowFilters({ query, onQuery, placeholder = 'Search', children }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full max-w-xs rounded-lg px-3 text-sm"
        style={fieldStyle}
      />
      {children}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="h-9 rounded-lg px-3 text-sm"
      style={fieldStyle}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}
