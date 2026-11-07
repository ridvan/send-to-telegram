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

/**
 * `shot` items capture the tab first and send it with the page's link;
 * `area` items let you drag out the part to capture.
 */
type Prefix = 'send' | 'shot' | 'area';

const items: {
  prefix: Prefix;
  kind: ContentKind;
  context: MenuContext;
  title: string;
}[] = [
  {
    prefix: 'send',
    kind: 'selection',
    context: 'selection',
    title: 'Send selection to Telegram',
  },
  {
    prefix: 'send',
    kind: 'link',
    context: 'link',
    title: 'Send link to Telegram',
  },
  {
    prefix: 'send',
    kind: 'image',
    context: 'image',
    title: 'Send image to Telegram',
  },
  {
    prefix: 'send',
    kind: 'page',
    context: 'page',
    title: 'Send page to Telegram',
  },
  {
    prefix: 'shot',
    kind: 'page',
    context: 'page',
    title: 'Send screenshot to Telegram',
  },
  {
    prefix: 'area',
    kind: 'page',
    context: 'page',
    title: 'Send screenshot of an area to Telegram',
  },
];

/**
 * Menu ids read `<prefix>:<kind>:<destination id>:<tag>`; empty parts mean
 * the default.
 */
const SEPARATOR = ':';

function menuId(
  prefix: Prefix,
  kind: ContentKind,
  destinationId = '',
  tag = ''
) {
  return [prefix, kind, destinationId, tag].join(SEPARATOR);
}

export function parseMenuId(id: string | number) {
  const [prefix, kind, destinationId, tag] = String(id).split(SEPARATOR);
  const parsedKind = contentKindSchema.safeParse(kind);

  if (
    (prefix !== 'send' && prefix !== 'shot' && prefix !== 'area') ||
    !parsedKind.success
  ) {
    return undefined;
  }

  const capture =
    prefix === 'shot' ? 'visible' : prefix === 'area' ? 'area' : undefined;

  return {
    ...(capture && { capture }),
    draft: {
      kind: parsedKind.data,
      ...(destinationId && { destinationId }),
      ...(tag && { tag }),
    } satisfies Partial<Draft>,
  };
}

function create(properties: Browser.contextMenus.CreateProperties) {
  browser.contextMenus.create(properties, () => {
    // Reading lastError marks it handled; a duplicate id here is harmless.
    void browser.runtime.lastError;
  });
}

function createTagItems(
  parentId: string,
  prefix: Prefix,
  kind: ContentKind,
  context: MenuContext,
  destinationId: string,
  tags: string[]
) {
  create({
    id: menuId(prefix, kind, destinationId),
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
      id: menuId(prefix, kind, destinationId, tag),
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

  for (const { prefix, kind, context, title } of items) {
    const parentId = `${prefix}:${kind}`;

    create({ id: parentId, title, contexts: [context] });

    if (destinations.length > 1) {
      for (const destination of destinations) {
        const id = menuId(prefix, kind, destination.id);

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
        createTagItems(groupId, prefix, kind, context, destination.id, tags);
      }
    } else if (tags.length > 0) {
      createTagItems(parentId, prefix, kind, context, '', tags);
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
