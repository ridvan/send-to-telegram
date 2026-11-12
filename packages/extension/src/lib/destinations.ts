import { sendTestMessage } from './bot-setup.ts';
import { forgetFiles } from './telegram-files.ts';
import {
  type ChatAvatarChoice,
  type Destination,
  inboxStore,
  isSamePlace,
  settingsStore,
  type Topic,
} from './settings.ts';

/**
 * Adds a chat, replacing an existing one for the same bot, chat and topic.
 * The chat just connected becomes the default, so the popup opens on it.
 */
export function addDestination(destination: Destination) {
  return settingsStore.update((settings) => ({
    ...settings,
    destinations: [
      ...settings.destinations.filter(
        (existing) => !isSamePlace(existing, destination)
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
  await forgetReceived(destination.id);
}

/** Drops what was sent to the bot for a destination, and its cached files. */
async function forgetReceived(destinationId: string) {
  const inbox = await inboxStore.get();

  const files = inbox.flatMap((entry) =>
    entry.destinationId === destinationId && entry.file
      ? [entry.file.uniqueId, entry.file.preview?.uniqueId ?? []].flat()
      : []
  );

  await inboxStore.set(
    inbox.filter((entry) => entry.destinationId !== destinationId)
  );
  await forgetFiles(files);
}

/**
 * Changes only what `change` names: an empty `label` goes back to the chat's
 * title, `avatar: null` back to initials, and `topic: null` back to General.
 * Moving to another topic drops the messages received for the old one; the
 * next read brings back the ones that belong, from the last 24 hours.
 */
export async function updateDestination(
  id: string,
  change: {
    label?: string;
    avatar?: ChatAvatarChoice | null;
    topic?: Topic | null;
  }
) {
  const before = (await settingsStore.get()).destinations.find(
    (destination) => destination.id === id
  );

  await settingsStore.update((settings) => ({
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

      if (change.topic !== undefined) {
        const { topic: _previous, ...rest } = next;

        next = change.topic ? { ...rest, topic: change.topic } : rest;
      }

      return next;
    }),
  }));

  const moved =
    change.topic !== undefined && before?.topic?.id !== change.topic?.id;

  if (moved) await forgetReceived(id);
}

export function makeDefault(id: string) {
  return settingsStore.update((settings) => ({
    ...settings,
    defaultDestinationId: id,
  }));
}

export function sendTest(destination: Destination) {
  return sendTestMessage(
    destination.token,
    destination.chatId,
    destination.topic?.id
  );
}
