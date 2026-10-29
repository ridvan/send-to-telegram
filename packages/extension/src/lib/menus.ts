import { browser, type Browser } from 'wxt/browser';

import type { Draft } from './compose.ts';
import {
  type ContentKind,
  contentKindSchema,
  defaultDestination,
  destinationName,
  type Settings,
} from './settings.ts';

type MenuContext = `${Browser.contextMenus.ContextType}`;

const items: { kind: ContentKind; context: MenuContext; title: string }[] = [
  {
    kind: 'selection',
    context: 'selection',
    title: 'Send selection to Telegram',
  },
  { kind: 'link', context: 'link', title: 'Send link to Telegram' },
  { kind: 'image', context: 'image', title: 'Send image to Telegram' },
  { kind: 'page', context: 'page', title: 'Send page to Telegram' },
];

/** Menu ids read `send:<kind>:<destination id>:<tag>`; empty parts mean the default. */
const SEPARATOR = ':';

function menuId(kind: ContentKind, destinationId = '', tag = '') {
  return ['send', kind, destinationId, tag].join(SEPARATOR);
}

export function parseMenuId(id: string | number) {
  const [prefix, kind, destinationId, tag] = String(id).split(SEPARATOR);
  const parsedKind = contentKindSchema.safeParse(kind);

  if (prefix !== 'send' || !parsedKind.success) return undefined;

  return {
    kind: parsedKind.data,
    ...(destinationId && { destinationId }),
    ...(tag && { tag }),
  } satisfies Partial<Draft>;
}

function create(properties: Browser.contextMenus.CreateProperties) {
  browser.contextMenus.create(properties, () => {
    // Reading lastError marks it handled; a duplicate id here is harmless.
    void browser.runtime.lastError;
  });
}

function createTagItems(
  parentId: string,
  kind: ContentKind,
  context: MenuContext,
  destinationId: string,
  tags: string[]
) {
  create({
    id: menuId(kind, destinationId),
    parentId,
    title: 'Without a tag',
    contexts: [context],
  });
  create({
    id: `${parentId}:separator`,
    parentId,
    type: 'separator',
    contexts: [context],
  });

  for (const tag of tags) {
    create({
      id: menuId(kind, destinationId, tag),
      parentId,
      title: `#${tag}`,
      contexts: [context],
    });
  }
}

function build(settings: Settings) {
  const tags = settings.tags.enabled ? settings.tags.list : [];
  const fallback = defaultDestination(settings);

  const destinations = fallback
    ? [fallback, ...settings.destinations.filter((d) => d.id !== fallback.id)]
    : [];

  for (const { kind, context, title } of items) {
    const parentId = `send:${kind}`;

    create({ id: parentId, title, contexts: [context] });

    if (destinations.length > 1) {
      for (const destination of destinations) {
        const id = menuId(kind, destination.id);

        if (tags.length === 0) {
          create({
            id,
            parentId,
            title: destinationName(destination),
            contexts: [context],
          });
          continue;
        }

        const groupId = `${id}:group`;

        create({
          id: groupId,
          parentId,
          title: destinationName(destination),
          contexts: [context],
        });
        createTagItems(groupId, kind, context, destination.id, tags);
      }
    } else if (tags.length > 0) {
      createTagItems(parentId, kind, context, '', tags);
    }
  }
}

let queue = Promise.resolve();

/** Rebuilds every menu item; calls are serialized so rebuilds never interleave. */
export function rebuildMenus(settings: Settings) {
  queue = queue
    .then(() => browser.contextMenus.removeAll())
    .then(() => build(settings))
    .catch((cause) => console.error('Could not build menus', cause));

  return queue;
}
