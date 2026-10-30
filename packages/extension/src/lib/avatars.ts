import type { AvatarPattern } from './settings.ts';

/** Telegram's seven avatar colors, as `--tint-*` names them. */
export const avatarTones = [
  'red',
  'orange',
  'violet',
  'green',
  'cyan',
  'blue',
  'pink',
] as const;

export type AvatarTone = (typeof avatarTones)[number];

/** The same chat gets the same color everywhere, like in Telegram. */
export function toneFor(seed: string): AvatarTone {
  // FNV-1a, which spreads short names over the colors more evenly.
  let hash = 0x811c9dc5;

  for (const char of seed) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  }

  return avatarTones[hash % avatarTones.length] ?? 'blue';
}

/** Around the color wheel, so neighbours sit well together in a pattern. */
const wheel: AvatarTone[] = [
  'red',
  'orange',
  'green',
  'cyan',
  'blue',
  'violet',
  'pink',
];

/**
 * A pattern's colors: the chat's own tone with its neighbours on each side,
 * so a chat keeps its color whichever pattern it wears.
 */
export function patternColors(seed: string): string[] {
  const at = wheel.indexOf(toneFor(seed));

  const near = (step: number) =>
    wheel[(at + step + wheel.length) % wheel.length] ?? 'blue';

  return [
    `var(--tint-${near(0)})`,
    `var(--tint-${near(0)}-to)`,
    `var(--tint-${near(1)})`,
    `var(--tint-${near(-1)}-to)`,
    `var(--tint-${near(1)}-to)`,
  ];
}

export const avatarPatterns: AvatarPattern[] = [
  'beam',
  'marble',
  'pixel',
  'sunset',
  'ring',
  'bauhaus',
];

export const suggestedEmojis = [
  '📚',
  '💡',
  '🔖',
  '🗂️',
  '🏠',
  '💼',
  '🎯',
  '⭐',
  '❤️',
  '🧠',
  '🍳',
  '✈️',
  '🎵',
  '🎬',
  '🛒',
  '🐾',
];

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Flags are pairs of regional indicators, which aren't pictographic.
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Returns the emoji when `text` is exactly one, or undefined. */
export function singleEmoji(text: string): string | undefined {
  const trimmed = text.trim();
  const graphemes = Array.from(segmenter.segment(trimmed));

  return graphemes.length === 1 && EMOJI.test(trimmed) ? trimmed : undefined;
}

const PHOTO_SIZE = 128;

/**
 * Crops the middle square of a picture down to an avatar, small enough to keep
 * in settings. WebP keeps a transparent logo transparent, where JPEG goes black.
 */
export async function photoToDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');

  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;

  const context = canvas.getContext('2d');

  if (!context) throw new Error('Canvas is unavailable');

  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    PHOTO_SIZE,
    PHOTO_SIZE
  );
  bitmap.close();

  return canvas.toDataURL('image/webp', 0.85);
}
