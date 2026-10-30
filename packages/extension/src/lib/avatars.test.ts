import { describe, expect, it } from 'vitest';

import {
  avatarTones,
  patternColors,
  singleEmoji,
  suggestedEmojis,
  toneFor,
} from './avatars.ts';
import { destinationSchema } from './settings.ts';

describe('singleEmoji', () => {
  it('accepts one emoji, trimmed', () => {
    expect(singleEmoji(' 🦊 ')).toBe('🦊');
  });

  it('accepts emoji built from several code points', () => {
    expect(singleEmoji('👩🏽‍💻')).toBe('👩🏽‍💻');
    expect(singleEmoji('🇹🇷')).toBe('🇹🇷');
    expect(singleEmoji('❤️')).toBe('❤️');
  });

  it('accepts every suggested emoji', () => {
    for (const emoji of suggestedEmojis) expect(singleEmoji(emoji)).toBe(emoji);
  });

  it('refuses letters, digits and more than one emoji', () => {
    expect(singleEmoji('')).toBeUndefined();
    expect(singleEmoji('a')).toBeUndefined();
    expect(singleEmoji('7')).toBeUndefined();
    expect(singleEmoji('🦊🦊')).toBeUndefined();
    expect(singleEmoji('🦊 a')).toBeUndefined();
  });
});

describe('toneFor', () => {
  it('gives the same chat the same tone', () => {
    expect(toneFor('Design crit')).toBe(toneFor('Design crit'));
    expect(avatarTones).toContain(toneFor('Design crit'));
  });
});

describe('patternColors', () => {
  it('starts from the chat’s own tone', () => {
    const colors = patternColors('Design crit');

    expect(colors[0]).toBe(`var(--tint-${toneFor('Design crit')})`);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('a stored avatar', () => {
  const chat = { id: 'a', kind: 'bot', token: '1:x', chatId: 1 };

  it('keeps chats saved before avatars on initials', () => {
    expect(destinationSchema.parse(chat).avatar).toBeUndefined();
  });

  it('falls back to initials when unreadable, keeping the chat', () => {
    const parsed = destinationSchema.parse({
      ...chat,
      label: 'Saved',
      avatar: { kind: 'image', dataUrl: 'https://example.com/a.png' },
    });

    expect(parsed.label).toBe('Saved');
    expect(parsed.avatar).toBeUndefined();
  });
});
