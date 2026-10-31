import { cn } from '@/lib/utils';

/**
 * Telegram's plane, the one in the extension icon (`public/icon/logo.svg`),
 * flat in the text color so it can stand on the send button. The fold is
 * see-through so it still reads as folded paper without the logo's shading.
 */
export function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg
      // The plane's box with its rounded stroke (-2.5 to 102.5 across, -2.5
      // to 86.5 down), squared around its centre so it sits mid-button.
      viewBox="-2.5 -10.5 105 105"
      overflow="visible"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinejoin="round"
      aria-hidden
      className={cn('size-4', className)}
    >
      <g opacity={0.6}>
        <polygon points="26,48 80,15 39,56 36,80" />
        <polygon points="39,56 56,68.2 36,80" />
      </g>
      <polygon points="0,39 100,0 78,84 39,56 80,15 26,48" />
    </svg>
  );
}
