import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { addDestination, updateDestination } from './destinations.ts';
import {
  avatarSeed,
  type Destination,
  destinationName,
  inboxStore,
  settingsSchema,
  settingsStore,
} from './settings.ts';

const chat: Destination = {
  id: 'first',
  kind: 'bot',
  token: '1:a',
  chatId: 42,
  chatTitle: 'Ada',
  chatType: 'private',
};

describe('addDestination', () => {
  beforeEach(() => fakeBrowser.reset());

  it('adds a bot and chat once however often it is connected', async () => {
    await addDestination(chat);
    await addDestination({ ...chat, id: 'second' });

    const { destinations, defaultDestinationId } = await settingsStore.get();

    expect(destinations.map((destination) => destination.id)).toEqual([
      'second',
    ]);
    expect(defaultDestinationId).toBe('second');
  });

  it('makes the chat just connected the default', async () => {
    await addDestination(chat);
    await addDestination({ ...chat, id: 'second', chatId: 43 });

    expect((await settingsStore.get()).defaultDestinationId).toBe('second');
  });

  it('keeps separate chats apart', async () => {
    await addDestination(chat);
    await addDestination({ ...chat, id: 'second', token: '2:b' });

    expect((await settingsStore.get()).destinations).toHaveLength(2);
  });

  it('keeps a group and each of its topics apart, and each topic once', async () => {
    const group = { ...chat, chatId: -100123, chatType: 'supergroup' as const };

    await addDestination(group);
    await addDestination({ ...group, id: 'reviews', topic: { id: 50 } });
    await addDestination({ ...group, id: 'handoff', topic: { id: 60 } });
    await addDestination({
      ...group,
      id: 'reviews-again',
      topic: { id: 50, name: 'Reviews' },
    });

    expect(
      (await settingsStore.get()).destinations.map(({ id }) => id)
    ).toEqual(['first', 'handoff', 'reviews-again']);
  });
});

describe('updateDestination', () => {
  beforeEach(() => fakeBrowser.reset());

  it('sets a topic and clears it back to General', async () => {
    await addDestination(chat);
    await updateDestination('first', { topic: { id: 50, name: 'Reviews' } });

    expect((await settingsStore.get()).destinations[0]?.topic).toEqual({
      id: 50,
      name: 'Reviews',
    });

    await updateDestination('first', { topic: null });

    expect((await settingsStore.get()).destinations[0]).toEqual(chat);
  });

  it('drops messages received for the old topic when it changes', async () => {
    const received = (destinationId: string, id: string) => ({
      id,
      destinationId,
      receivedAt: 1,
      text: 'Hi',
    });

    await addDestination(chat);
    await addDestination({ ...chat, id: 'other', chatId: 43 });
    await inboxStore.set([
      received('first', '42:1'),
      received('other', '43:1'),
    ]);

    await updateDestination('first', { label: 'Ada' });
    expect(await inboxStore.get()).toHaveLength(2);

    await updateDestination('first', { topic: { id: 50 } });
    expect((await inboxStore.get()).map(({ id }) => id)).toEqual(['43:1']);
  });
});

describe('destinationName', () => {
  it('names a topic after its group, and a label over both', () => {
    const topic = { ...chat, chatTitle: 'Design crit', topic: { id: 50 } };

    expect(destinationName(topic)).toBe('Design crit › Topic 50');
    expect(
      destinationName({ ...topic, topic: { id: 50, name: 'Reviews' } })
    ).toBe('Design crit › Reviews');
    expect(destinationName({ ...topic, label: 'Crit' })).toBe('Crit');
    expect(avatarSeed(topic)).not.toBe(avatarSeed(chat));
  });
});

describe('settingsSchema', () => {
  it('drops chats linked through S2T Relay and keeps the rest', () => {
    const settings = settingsSchema.parse({
      destinations: [
        {
          id: 'relay',
          kind: 'relay',
          relayUrl: 'https://relay.example',
          deviceToken: 'a'.repeat(43),
        },
        chat,
      ],
      defaultDestinationId: 'first',
      appearance: { theme: 'dark' },
    });

    expect(settings.destinations).toEqual([chat]);
    expect(settings.appearance.theme).toBe('dark');
  });

  it('reads chats stored before topics unchanged, and keeps a topic', () => {
    // As 2.0 stored it, before destinations could have a topic.
    const stored = {
      id: 'team',
      kind: 'bot',
      token: '1:a',
      chatId: -100123,
      chatTitle: 'Design crit',
      chatType: 'supergroup',
      botUsername: 'crit_bot',
      avatar: { kind: 'pattern', style: 'marble' },
    };

    const withTopic = { ...stored, id: 'reviews', topic: { id: 50 } };

    const { destinations } = settingsSchema.parse({
      destinations: [stored, withTopic],
    });

    expect(destinations).toEqual([stored, withTopic]);
    expect(destinations[0]).not.toHaveProperty('topic');
  });
});
