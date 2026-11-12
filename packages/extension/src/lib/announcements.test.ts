import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  ANNOUNCEMENTS,
  markAllAnnouncementsSeen,
  markAnnouncementSeen,
  nextAnnouncement,
  showsStarCard,
  STAR_CARD,
} from './announcements.ts';
import { announcementsStore } from './settings.ts';

describe('nextAnnouncement', () => {
  it('shows screenshots to someone who has seen nothing yet', () => {
    expect(nextAnnouncement([])).toBe('screenshots');
  });

  it('shows nothing once everything is seen', () => {
    expect(nextAnnouncement([...ANNOUNCEMENTS])).toBeUndefined();
  });

  it('ignores ids this version no longer has', () => {
    expect(nextAnnouncement(['retired-feature'])).toBe('screenshots');
  });
});

describe('showsStarCard', () => {
  const allFeatures = [...ANNOUNCEMENTS];

  const shows = (options: Partial<Parameters<typeof showsStarCard>[0]> = {}) =>
    showsStarCard({
      seen: allFeatures,
      sent: 100,
      incognito: false,
      locked: false,
      ...options,
    });

  it('waits for the 100th send', () => {
    expect(shows({ sent: 0 })).toBe(false);
    expect(shows({ sent: 99 })).toBe(false);
    expect(shows({ sent: 100 })).toBe(true);
  });

  it('shows to people who sent far more before it existed', () => {
    expect(shows({ sent: 1284 })).toBe(true);
  });

  it('never shows again once seen, however many more are sent', () => {
    for (const sent of [100, 200, 1000, 10_000]) {
      expect(shows({ sent, seen: [...allFeatures, STAR_CARD] })).toBe(false);
    }
  });

  it('never shows in a private window', () => {
    expect(shows({ incognito: true })).toBe(false);
  });

  it('never shows while locked', () => {
    expect(shows({ locked: true })).toBe(false);
  });

  it('waits while a feature announcement is waiting', () => {
    expect(shows({ seen: [] })).toBe(false);
  });
});

describe('seen announcements', () => {
  beforeEach(() => fakeBrowser.reset());

  it('stores a dismissed announcement once', async () => {
    await markAnnouncementSeen('screenshots');
    await markAnnouncementSeen('screenshots');

    expect(await announcementsStore.get()).toEqual({ seen: ['screenshots'] });
  });

  it('marks every announcement seen for a fresh start', async () => {
    await markAllAnnouncementsSeen();

    expect(nextAnnouncement((await announcementsStore.get()).seen)).toBe(
      undefined
    );
  });

  it('leaves the star card for a fresh install to see later', async () => {
    await markAllAnnouncementsSeen();

    const { seen } = await announcementsStore.get();

    expect(seen).not.toContain(STAR_CARD);
    expect(
      showsStarCard({ seen, sent: 100, incognito: false, locked: false })
    ).toBe(true);
  });

  it('keeps the features seen when the star card is', async () => {
    await markAllAnnouncementsSeen();
    await markAnnouncementSeen(STAR_CARD);

    expect(await announcementsStore.get()).toEqual({
      seen: [...ANNOUNCEMENTS, STAR_CARD],
    });
  });

  it('treats unreadable data as nothing seen', async () => {
    await browser.storage.local.set({ announcements: { seen: 'screenshots' } });

    expect(await announcementsStore.get()).toEqual({ seen: [] });
  });
});
