import Image from 'next/image';
import { BRAND } from '@/lib/branding';

/** Same mark as the landing page: the company logo on a white tile, with Luit as the name. */
export default function BrandMark({ size = 36, showText = true, className = '' }) {
  return (
    <span className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm"
        style={{ width: size, height: size }}
      >
        <Image
          src={BRAND.logo}
          alt={`${BRAND.company} logo`}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      </span>
      {showText ? (
        <span className="min-w-0 leading-tight">
          <span className="luit-wordmark block truncate">
            {BRAND.product}
          </span>
          <span className="luit-wordmark-sub mt-1 block truncate">
            {BRAND.company}
          </span>
        </span>
      ) : null}
    </span>
  );
}
