import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  ANNOUNCEMENTS,
  markAllAnnouncementsSeen,
  markAnnouncementSeen,
  nextAnnouncement,
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

  it('treats unreadable data as nothing seen', async () => {
    await browser.storage.local.set({ announcements: { seen: 'screenshots' } });

    expect(await announcementsStore.get()).toEqual({ seen: [] });
  });
});
