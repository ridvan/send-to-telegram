/**
 * New features, told once in the popup to people who had the extension
 * before them. A fresh install marks them all seen, since setup shows how
 * things work. Add a feature's id to the end of `ANNOUNCEMENTS` and its card
 * in `components/announcement.tsx`; never reuse or rename an id, or people
 * who dismissed it see it again.
 */

import { announcementsStore } from './settings.ts';

export const ANNOUNCEMENTS = ['screenshots'] as const;

export type AnnouncementId = (typeof ANNOUNCEMENTS)[number];

/** The newest feature not yet seen, so only one card shows at a time. */
export function nextAnnouncement(
  seen: readonly string[]
): AnnouncementId | undefined {
  return ANNOUNCEMENTS.findLast((id) => !seen.includes(id));
}

/** Dismissed, or the feature was used, which says it was found. */
export async function markAnnouncementSeen(id: AnnouncementId) {
  const { seen } = await announcementsStore.get();

  if (seen.includes(id)) return;

  await announcementsStore.set({ seen: [...seen, id] });
}

/** For a fresh start, where setup shows what the extension does. */
export async function markAllAnnouncementsSeen() {
  await announcementsStore.set({ seen: [...ANNOUNCEMENTS] });
}
