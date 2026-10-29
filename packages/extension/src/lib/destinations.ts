import { createBotClient } from '@send-to-telegram/core';

import { TEST_MESSAGE } from './bot-setup.ts';
import { toSendFailure } from './failure.ts';
import { relaySend, unlinkDevice } from './relay.ts';
import { forgetFiles } from './telegram-files.ts';
import { type Destination, inboxStore, settingsStore } from './settings.ts';

function sameChat(a: Destination, b: Destination) {
  if (a.kind === 'bot' && b.kind === 'bot') {
    return a.token === b.token && String(a.chatId) === String(b.chatId);
  }

  return false;
}

/** Adds a chat, replacing an existing one for the same bot and chat. */
export function addDestination(destination: Destination) {
  return settingsStore.update((settings) => {
    const others = settings.destinations.filter(
      (existing) => !sameChat(existing, destination)
    );

    return {
      ...settings,
      destinations: [...others, destination],
      defaultDestinationId: settings.defaultDestinationId ?? destination.id,
    };
  });
}

export async function removeDestination(destination: Destination) {
  if (destination.kind === 'relay') {
    // Best effort: the device is forgotten here whether or not the relay answers.
    await unlinkDevice(destination.relayUrl, destination.deviceToken).catch(
      () => undefined
    );
  }

  await settingsStore.update((settings) => {
    const destinations = settings.destinations.filter(
      (existing) => existing.id !== destination.id
    );

    const keepsDefault = settings.defaultDestinationId !== destination.id;

    return {
      ...settings,
      destinations,
      defaultDestinationId: keepsDefault
        ? settings.defaultDestinationId
        : (destinations[0]?.id ?? null),
    };
  });
  // What was sent to the bot there goes with the chat; history stays.
  const inbox = await inboxStore.get();

  const files = inbox.flatMap((entry) =>
    entry.destinationId === destination.id && entry.file
      ? [entry.file.uniqueId, entry.file.preview?.uniqueId ?? []].flat()
      : []
  );

  await inboxStore.set(
    inbox.filter((entry) => entry.destinationId !== destination.id)
  );
  await forgetFiles(files);
}

export function updateDestination(id: string, change: { label?: string }) {
  return settingsStore.update((settings) => ({
    ...settings,
    destinations: settings.destinations.map((destination) => {
      if (destination.id !== id) return destination;

      const { label: _previous, ...rest } = destination;
      const label = change.label?.trim();

      return label ? { ...rest, label } : rest;
    }),
  }));
}

export function makeDefault(id: string) {
  return settingsStore.update((settings) => ({
    ...settings,
    defaultDestinationId: id,
  }));
}

export async function sendTest(destination: Destination) {
  try {
    if (destination.kind === 'relay') {
      await relaySend(destination.relayUrl, destination.deviceToken, {
        kind: 'text',
        text: TEST_MESSAGE,
        linkPreview: false,
        silent: true,
      });

      return;
    }

    await createBotClient(destination.token).call('sendMessage', {
      chat_id: destination.chatId,
      text: TEST_MESSAGE,
      disable_notification: true,
    });
  } catch (cause) {
    throw toSendFailure(cause);
  }
}
