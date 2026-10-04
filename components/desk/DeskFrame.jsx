'use client';

import { useEffect, useState } from 'react';
import { deskTheme } from '@/lib/desk/desk-theme';

export function DeskFrame({ children, className = '' }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const apply = () => setTheme(deskTheme());
    apply();
    window.addEventListener('desk-theme', apply);
    return () => window.removeEventListener('desk-theme', apply);
  }, []);

  return (
    <div className={`tender-desk ${className}`} data-desk-theme={theme}>
      {children}
    </div>
  );
}
