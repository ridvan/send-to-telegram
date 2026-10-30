import { cn } from '@/lib/utils';

/**
 * Telegram's plane, the one in the extension icon (`public/icon/logo.svg`),
 * flat in the text color so it can stand on the send button. The fold is
 * see-through so it still reads as folded paper without the logo's shading.
 */
export function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg
      // The plane's box with its rounded stroke, squared. Starting a little
      // left and low moves it right and up by about 1px at 18px, where
      // Telegram's send button sits its plane, since the tip carries the weight.
      viewBox="-8.5 -4.5 105 105"
      overflow="visible"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinejoin="round"
      aria-hidden
      className={cn('size-4.5', className)}
    >
      <g opacity={0.6}>
        <polygon points="26,48 80,15 39,56 36,80" />
        <polygon points="39,56 56,68.2 36,80" />
      </g>
      <polygon points="0,39 100,0 78,84 39,56 80,15 26,48" />
    </svg>
  );
}
