import { useMemo } from 'react';
import { encode } from 'uqr';

import { cn } from '@/lib/utils';

/** Joins each row's dark modules into runs, so the path stays short. */
function modulePath(rows: boolean[][]): string {
  let path = '';

  rows.forEach((row, y) => {
    let x = 0;

    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }

      const start = x;

      while (row[x]) x += 1;
      path += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });

  return path;
}

/**
 * A QR code, dark on a light tile in either theme, since some phone cameras
 * don't read light-on-dark codes. The app mark sits in the middle; high error
 * correction leaves the code readable around it.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'H', border: 0 });

    return { size: qr.size, path: modulePath(qr.data) };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'relative aspect-square rounded-xl bg-white p-3 text-black shadow-xs ring-1 ring-black/5',
        className
      )}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-full [shape-rendering:crispEdges]"
        aria-hidden
      >
        <path d={path} fill="currentColor" />
      </svg>
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 flex size-[22%] -translate-1/2 items-center justify-center rounded-lg bg-white p-0.5"
      >
        <img
          src="/icon/logo.svg"
          alt=""
          draggable={false}
          className="size-full select-none"
        />
      </span>
    </div>
  );
}
