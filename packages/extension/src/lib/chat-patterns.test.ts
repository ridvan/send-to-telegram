import { describe, expect, it } from 'vitest';

import { chatPatterns, patternTile } from './chat-patterns.ts';
import { chatBackgroundSchema, settingsSchema } from './settings.ts';

describe('the chat background', () => {
  it('stays plain for settings saved before backgrounds', () => {
    const settings = settingsSchema.parse({ appearance: { theme: 'dark' } });

    expect(settings.appearance.chatBackground).toBe('plain');
  });

  it('falls back to plain for one this version doesn’t draw', () => {
    const settings = settingsSchema.parse({
      appearance: { chatBackground: 'confetti' },
    });

    expect(settings.appearance).toMatchObject({
      theme: 'system',
      chatBackground: 'plain',
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
