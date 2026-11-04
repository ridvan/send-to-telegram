import {
  chatPatterns,
  patternTile,
} from '@send-to-telegram/core/chat-patterns';
import { describe, expect, it } from 'vitest';

import { chatBackgroundSchema, settingsSchema } from './settings.ts';

describe('the chat background', () => {
  it('starts with doodles for settings saved before backgrounds', () => {
    const settings = settingsSchema.parse({ appearance: { theme: 'dark' } });

    expect(settings.appearance.chatBackground).toBe('doodles');
  });

  it('falls back to doodles for one this version doesn’t draw', () => {
    const settings = settingsSchema.parse({
      appearance: { chatBackground: 'confetti' },
    });

    expect(settings.appearance).toMatchObject({
      theme: 'system',
      chatBackground: 'doodles',
    });
  });

  it('has a tile for every pattern it offers', () => {
    const patterns = chatBackgroundSchema.options.filter(
      (option) => option !== 'plain' && option !== 'photo'
    );

    expect(chatPatterns).toEqual(patterns);

    for (const pattern of chatPatterns) {
      expect(patternTile(pattern).image).toMatch(
        /^url\("data:image\/svg\+xml,/
      );
    }
  });
});
