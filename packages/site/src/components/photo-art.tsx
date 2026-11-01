import { useId } from 'react';

import { cn } from '@/lib/utils';

const scenes = {
  // Hills at dusk, for a photo someone sent.
  dusk: {
    sky: ['oklch(0.86 0.07 60)', 'oklch(0.72 0.1 330)', 'oklch(0.5 0.1 285)'],
    sun: 'oklch(0.95 0.06 85)',
    hills: [
      'oklch(0.55 0.08 300)',
      'oklch(0.42 0.07 285)',
      'oklch(0.3 0.05 270)',
    ],
  },
  // The sea in the morning, for a photo sent from a phone.
  sea: {
    sky: ['oklch(0.8 0.06 230)', 'oklch(0.88 0.05 200)', 'oklch(0.94 0.04 90)'],
    sun: 'oklch(0.98 0.03 95)',
    hills: [
      'oklch(0.62 0.08 225)',
      'oklch(0.52 0.08 235)',
      'oklch(0.42 0.07 245)',
    ],
  },
};

/**
 * A photo, drawn: a low sun over hills or the sea. Stands in for the pictures
 * people send, so the page needs no stock photos.
 */
export function PhotoArt({
  scene,
  className,
}: {
  scene: keyof typeof scenes;
  className?: string;
}) {
  const id = useId();
  const { sky, sun, hills } = scenes[scene];

  return (
    <svg
      viewBox="0 0 240 150"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn('block w-full', className)}
    >
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="0.55" stopColor={sky[1]} />
          <stop offset="1" stopColor={sky[2]} />
        </linearGradient>
      </defs>
      <rect width="240" height="150" fill={`url(#${id}sky)`} />
      {scene === 'sea' ? (
        <>
          <circle cx="78" cy="84" r="13" fill={sun} />
          <rect y="88" width="240" height="62" fill={hills[0]} />
          <path d="M0 104c40-4 80-4 120 0s80 4 120 0v46H0Z" fill={hills[1]} />
          <path d="M0 124c40-3 80-3 120 0s80 3 120 0v26H0Z" fill={hills[2]} />
          <path
            d="M58 96h40M66 102h24M70 108h16"
            stroke={sun}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.7"
          />
        </>
      ) : (
        <>
          <circle cx="164" cy="70" r="16" fill={sun} />
          <path
            d="M0 92c30-14 58-20 88-12s54 4 82-8 52-12 70-4v82H0Z"
            fill={hills[0]}
          />
          <path
            d="M0 112c26-10 56-14 84-6s60 6 92-4 50-8 64-4v52H0Z"
            fill={hills[1]}
          />
          <path
            d="M0 130c34-8 70-8 104-2s70 4 98-2 30-4 38-2v26H0Z"
            fill={hills[2]}
          />
        </>
      )}
    </svg>
  );
}
