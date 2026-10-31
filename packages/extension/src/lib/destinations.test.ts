import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { addDestination } from './destinations.ts';
import { type RelayDestination, settingsStore } from './settings.ts';

const relay: RelayDestination = {
  id: 'first',
  kind: 'relay',
  relayUrl: 'https://relay.example',
  deviceToken: 'a'.repeat(43),
  chatTitle: 'Ada',
  chatType: 'private',
};

describe('addDestination', () => {
  beforeEach(() => fakeBrowser.reset());

  it('adds a relay link once however often it is reported', async () => {
    await addDestination(relay);
    await addDestination({ ...relay, id: 'second' });

    const { destinations, defaultDestinationId } = await settingsStore.get();

    expect(destinations.map((destination) => destination.id)).toEqual([
      'second',
    ]);
    // The default follows the replacement instead of pointing at nothing.
    expect(defaultDestinationId).toBe('second');
  });

  it('keeps another chat as the default when adding one', async () => {
    await addDestination(relay);
    await addDestination({
      ...relay,
      id: 'second',
      deviceToken: 'b'.repeat(43),
    });

    expect((await settingsStore.get()).defaultDestinationId).toBe('first');
  });

  it('keeps separate relay links apart', async () => {
    await addDestination(relay);
    await addDestination({
      ...relay,
      id: 'second',
      deviceToken: 'b'.repeat(43),
    });

    expect((await settingsStore.get()).destinations).toHaveLength(2);
  });
});
