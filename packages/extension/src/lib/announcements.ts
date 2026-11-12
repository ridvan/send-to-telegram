/**
 * New features, told once in the popup to people who had the extension
 * before them. A fresh install marks them all seen, since setup shows how
 * things work. Add a feature's id to the end of `ANNOUNCEMENTS` and its card
 * in `components/announcement.tsx`; never reuse or rename an id, or people
 * who dismissed it see it again.
 *
 * `STAR_CARD` shares the seen list but stays out of `ANNOUNCEMENTS`, so a
 * fresh install doesn't mark it seen. Its id is taken too.
 */

import { announcementsStore } from './settings.ts';

export const ANNOUNCEMENTS = ['screenshots'] as const;

export type AnnouncementId = (typeof ANNOUNCEMENTS)[number];

/** Asks once, after `STAR_AFTER_SENT` sends, for a star on GitHub. */
export const STAR_CARD = 'star';

export const STAR_AFTER_SENT = 100;

export type CardId = AnnouncementId | typeof STAR_CARD;

/** The newest feature not yet seen, so only one card shows at a time. */
export function nextAnnouncement(
  seen: readonly string[]
): AnnouncementId | undefined {
  return ANNOUNCEMENTS.findLast((id) => !seen.includes(id));
}

/**
 * Whether the star card shows: once someone has sent enough to know the
 * extension, never in a private window or while locked, and only when no
 * feature is waiting, since one card shows at a time.
 */
export function showsStarCard({
  seen,
  sent,
  incognito,
  locked,
}: {
  seen: readonly string[];
  sent: number;
  incognito: boolean;
  locked: boolean;
}): boolean {
  return (
    !incognito &&
    !locked &&
    sent >= STAR_AFTER_SENT &&
    !seen.includes(STAR_CARD) &&
    nextAnnouncement(seen) === undefined
  );
}

/** Dismissed, or the feature was used, which says it was found. */
export async function markAnnouncementSeen(id: CardId) {
  const { seen } = await announcementsStore.get();

  if (seen.includes(id)) return;

  await announcementsStore.set({ seen: [...seen, id] });
}

/** For a fresh start, where setup shows what the extension does. */
export async function markAllAnnouncementsSeen() {
  await announcementsStore.set({ seen: [...ANNOUNCEMENTS] });
}
