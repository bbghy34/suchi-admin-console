'use client';

import { Button } from '@/components/desk/ui';

export function PrintButton({ backHref }) {
  return (
    <div className="no-print mb-6 flex gap-3">
      <Button onClick={() => window.print()}>Print</Button>
      <a href={backHref} className="self-center text-sm text-desk underline">
        Back to application
      </a>
    </div>
  );
}
