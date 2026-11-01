import type { SentIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { cn } from '@/lib/utils';

const tones = {
  red: 'from-tint-red to-tint-red-to',
  orange: 'from-tint-orange to-tint-orange-to',
  violet: 'from-tint-violet to-tint-violet-to',
  green: 'from-tint-green to-tint-green-to',
  cyan: 'from-tint-cyan to-tint-cyan-to',
  blue: 'from-tint-blue to-tint-blue-to',
  pink: 'from-tint-pink to-tint-pink-to',
};

export type TileTone = keyof typeof tones;

const sizes = {
  sm: 'size-7 rounded-md [&_svg]:size-4',
  md: 'size-8 rounded-lg [&_svg]:size-4',
};

/**
 * An icon on a colored square, as Telegram marks its settings. The color
 * tells rows apart at a glance; the label beside it still says what it is.
 */
export function IconTile({
  icon,
  tone,
  size = 'md',
}: {
  icon: typeof SentIcon;
  tone: TileTone;
  size?: keyof typeof sizes;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-linear-to-b text-tint-foreground',
        tones[tone],
        sizes[size]
      )}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} />
    </span>
  );
}
