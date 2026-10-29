import type { VariantProps } from 'class-variance-authority';

import {
  Avatar,
  AvatarFallback,
  type avatarFallbackVariants,
} from '@/components/ui/avatar';
import { initials } from '@/lib/format';

type Tone = NonNullable<VariantProps<typeof avatarFallbackVariants>['tone']>;

const tones: Tone[] = [
  'red',
  'orange',
  'violet',
  'green',
  'cyan',
  'blue',
  'pink',
];

/** The same chat gets the same color everywhere, like in Telegram. */
function toneFor(seed: string): Tone {
  // FNV-1a, which spreads short names over the colors more evenly.
  let hash = 0x811c9dc5;

  for (const char of seed) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  }

  return tones[hash % tones.length] ?? 'blue';
}

/**
 * `seed` picks the color; pass the chat's title from Telegram so renaming the
 * chat here doesn't change it.
 */
export function ChatAvatar({
  name,
  seed = name,
  size = 'default',
}: {
  name: string;
  seed?: string;
  size?: 'sm' | 'default' | 'lg';
}) {
  return (
    <Avatar size={size} aria-hidden>
      <AvatarFallback tone={toneFor(seed)}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
