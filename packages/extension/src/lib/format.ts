import type { ChatType } from '@send-to-telegram/core';

import type { ContentKind, HistoryEntry } from './settings.ts';

const locale = navigator.language;

const relative = new Intl.RelativeTimeFormat(locale, {
  numeric: 'auto',
  style: 'short',
});

const clock = new Intl.DateTimeFormat(locale, {
  hour: 'numeric',
  minute: '2-digit',
});

const shortDate = new Intl.DateTimeFormat(locale, {
  month: 'short',
  day: 'numeric',
});

const longDate = new Intl.DateTimeFormat(locale, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

const fullDate = new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const count = new Intl.NumberFormat(locale);

const sizeFormats = {
  kilobyte: new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilobyte',
    maximumFractionDigits: 0,
  }),
  megabyte: new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 1,
  }),
};

/** "840 kB", "12.4 MB". */
export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? sizeFormats.kilobyte.format(Math.max(1, Math.round(bytes / 1024)))
    : sizeFormats.megabyte.format(bytes / (1024 * 1024));
}

/** "0:42", "12:05", "1:02:09", as players show lengths. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}

export const formatCount = (value: number) => count.format(value);

const plurals = new Intl.PluralRules(locale);

/** Picks the message for the count's plural category; `#` becomes the number. */
export function plural(
  value: number,
  messages: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
): string {
  const message = messages[plurals.select(value)] ?? messages.other;

  return message.replace('#', count.format(value));
}

export const formatFullDate = (time: number) => fullDate.format(time);

export const formatClock = (time: number) => clock.format(time);

/** "now", "5 min. ago", "3 hr. ago", then a date. */
export function formatAgo(time: number, now = Date.now()): string {
  const seconds = Math.round((time - now) / 1000);

  if (seconds > -45) return relative.format(0, 'second');

  const minutes = Math.round(seconds / 60);

  if (minutes > -60) return relative.format(minutes, 'minute');

  const hours = Math.round(minutes / 60);

  if (hours > -24) return relative.format(hours, 'hour');

  return shortDate.format(time);
}

function startOfDay(time: number) {
  const date = new Date(time);

  date.setHours(0, 0, 0, 0);

  return date.getTime();
}

/** Heading for a day of history: "Today", "Yesterday", or the date. */
export function formatDay(time: number, now = Date.now()): string {
  const days = Math.round((startOfDay(time) - startOfDay(now)) / 86_400_000);

  if (days >= -1) {
    const label = relative.format(days, 'day');

    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  }

  return longDate.format(time);
}

export function dayKey(time: number) {
  return startOfDay(time);
}

/** Splits items into days by `timeOf`, keeping the order they're given in. */
export function groupByDay<T>(items: T[], timeOf: (item: T) => number) {
  const groups = new Map<number, T[]>();

  for (const item of items) {
    const key = dayKey(timeOf(item));
    const group = groups.get(key);

    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  return [...groups];
}

/** `example.com/path` without the protocol or a trailing slash. */
export function displayUrl(url: string): string {
  if (!URL.canParse(url)) return url;

  const parsed = new URL(url);
  const path = parsed.pathname === '/' ? '' : parsed.pathname;

  return `${parsed.host.replace(/^www\./, '')}${path}`;
}

export function hostname(url: string | undefined): string | undefined {
  if (!url || !URL.canParse(url)) return undefined;

  return new URL(url).host.replace(/^www\./, '');
}

export const kindLabel: Record<ContentKind, string> = {
  selection: 'Text',
  link: 'Link',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  page: 'Page',
};

export const chatTypeLabel: Record<ChatType, string> = {
  private: 'Private chat',
  group: 'Group',
  supergroup: 'Group',
  channel: 'Channel',
};

/** The line that best stands for what was sent, given what history kept. */
export function entryTitle(entry: HistoryEntry): string {
  const content = entry.content;

  if (!content) return kindLabel[entry.kind];

  switch (entry.kind) {
    case 'selection':
      return (
        content.text ??
        content.note ??
        content.attachment?.name ??
        kindLabel.selection
      );
    case 'page':
      return (
        content.pageTitle ??
        (content.pageUrl ? displayUrl(content.pageUrl) : undefined) ??
        content.note ??
        content.attachment?.name ??
        kindLabel.page
      );
    case 'link':
    case 'image':
      return content.url ? displayUrl(content.url) : kindLabel[entry.kind];
    case 'video':
    case 'audio':
      // Without a source of its own, its page went instead.
      return content.url
        ? displayUrl(content.url)
        : (content.pageTitle ??
            (content.pageUrl ? displayUrl(content.pageUrl) : undefined) ??
            kindLabel[entry.kind]);
  }
}

/** Initials for a chat avatar: "Design crit" → "DC". */
export function initials(name: string): string {
  const words = name.replace(/^@/, '').split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];

  return letters
    .map((word) => Array.from(word ?? '')[0] ?? '')
    .join('')
    .toLocaleUpperCase(locale);
}
