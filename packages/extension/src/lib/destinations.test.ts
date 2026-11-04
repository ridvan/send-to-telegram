import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { addDestination } from './destinations.ts';
import { type Destination, settingsSchema, settingsStore } from './settings.ts';

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
});
