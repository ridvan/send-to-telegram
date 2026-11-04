import { createBotClient } from '@send-to-telegram/core';

import { TEST_MESSAGE } from './bot-setup.ts';
import { toSendFailure } from './failure.ts';
import { forgetFiles } from './telegram-files.ts';
import {
  type ChatAvatarChoice,
  type Destination,
  inboxStore,
  settingsStore,
} from './settings.ts';

function sameChat(a: Destination, b: Destination) {
  return a.token === b.token && String(a.chatId) === String(b.chatId);
}

/**
 * Adds a chat, replacing an existing one for the same bot and chat. The chat just connected becomes the default, so the popup
 * opens on it.
 */
export function addDestination(destination: Destination) {
  return settingsStore.update((settings) => ({
    ...settings,
    destinations: [
      ...settings.destinations.filter(
        (existing) => !sameChat(existing, destination)
      ),
      destination,
    ],
    defaultDestinationId: destination.id,
  }));
}

export async function removeDestination(destination: Destination) {
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

/**
 * Changes only what `change` names: an empty `label` goes back to the chat's
 * title, and `avatar: null` back to initials.
 */
export function updateDestination(
  id: string,
  change: { label?: string; avatar?: ChatAvatarChoice | null }
) {
  return settingsStore.update((settings) => ({
    ...settings,
    destinations: settings.destinations.map((destination) => {
      if (destination.id !== id) return destination;

      let next = destination;

      if (change.label !== undefined) {
        const { label: _previous, ...rest } = next;
        const label = change.label.trim();

        next = label ? { ...rest, label } : rest;
      }

      if (change.avatar !== undefined) {
        const { avatar: _previous, ...rest } = next;

        next = change.avatar ? { ...rest, avatar: change.avatar } : rest;
      }

      return next;
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
    await createBotClient(destination.token).call('sendMessage', {
      chat_id: destination.chatId,
      text: TEST_MESSAGE,
      disable_notification: true,
    });
  } catch (cause) {
    throw toSendFailure(cause);
  }
}
