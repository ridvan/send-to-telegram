import {
  Clock01Icon,
  FlashIcon,
  MessageMultiple01Icon,
  SentIcon,
  TextIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';

import { AppMark } from '@/components/app-mark';
import { ChatAvatar } from '@/components/chat-avatar';
import { ConnectFlow } from '@/components/connect/connect-flow';
import { useShortcuts } from '@/components/shortcuts';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { useStore } from '@/hooks/use-store';
import { openExtensionPage } from '@/lib/client';
import { addDestination } from '@/lib/destinations';
import { plural } from '@/lib/format';
import { hasRelay } from '@/lib/relay';
import {
  defaultDestination,
  destinationName,
  historyStore,
  onboardingStore,
  settingsStore,
} from '@/lib/settings';

async function closeTab() {
  const tab = await browser.tabs.getCurrent();

  if (tab?.id === undefined) window.close();
  else await browser.tabs.remove(tab.id);
}

function Page({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-10 px-6 py-16 sm:py-24">
      <header className="flex flex-col gap-5">
        <AppMark size="lg" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-base text-pretty text-muted-foreground">
            {description}
          </p>
        </div>
      </header>
      {children}
    </main>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}

export function Welcome() {
  const settings = useStore(settingsStore);
  const onboarding = useStore(onboardingStore);
  const [connected, setConnected] = useState(false);
  const destination = defaultDestination(settings);

  if (destination && onboarding.migratedFrom && !connected) {
    return <Upgraded />;
  }

  if (destination && (connected || onboarding.completedAt)) {
    return <Ready chat={destinationName(destination)} />;
  }

  return (
    <Page
      title="Send to Telegram"
      description={
        hasRelay
          ? 'Right-click text, links, images or the page itself to send them to a Telegram chat. First, choose how to connect.'
          : 'Right-click text, links, images or the page itself to send them to a Telegram chat. Setup takes about two minutes.'
      }
    >
      <ConnectFlow
        onConnected={async (next) => {
          await addDestination(next);
          await onboardingStore.update((state) => ({
            ...state,
            completedAt: Date.now(),
          }));
          setConnected(true);
        }}
      />
    </Page>
  );
}

/** A still of the browser's right-click menu, so people know where to look. */
function MenuIllustration() {
  return (
    <figure
      aria-label="The right-click menu, with Send selection to Telegram highlighted"
      className="flex justify-center rounded-xl border bg-muted/40 px-6 py-8"
    >
      <div
        aria-hidden
        className="w-64 rounded-lg border bg-popover p-1 text-sm shadow-lg"
      >
        <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-muted-foreground">
          Copy
          <span className="text-xs">⌘C</span>
        </div>
        <div className="rounded-md px-2 py-1.5 text-muted-foreground">
          Search for “grid layout”
        </div>
        <Separator className="my-1" />
        <div className="flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 font-medium">
          <AppMark size="sm" />
          Send selection to Telegram
        </div>
      </div>
    </figure>
  );
}

function Ready({ chat }: { chat: string }) {
  const shortcuts = useShortcuts();
  const sendPage = shortcuts.find((shortcut) => shortcut.name === 'send-page');

  return (
    <Page
      title="You’re ready"
      description={`Messages now go to ${chat}. Select something on any page, right-click it and send.`}
    >
      <div className="flex animate-rise flex-col gap-6">
        <MenuIllustration />
        <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
          <li>
            Pin Send to Telegram to your toolbar to send the page you’re on with
            a note or a hashtag.
          </li>
          {sendPage?.keys ? (
            <li>
              Press <Kbd>{sendPage.keys}</Kbd> to send the current page right
              away.
            </li>
          ) : null}
        </ul>
      </div>
      <Actions>
        <Button
          variant="outline"
          onClick={() => void openExtensionPage('/options.html')}
        >
          Open settings
        </Button>
        <Button onClick={() => void closeTab()}>Done</Button>
      </Actions>
    </Page>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: typeof SentIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
      </span>
      <div className="flex flex-col gap-0.5 pt-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-pretty text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

function Upgraded() {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const destination = defaultDestination(settings);
  const tags = settings.tags.list;

  return (
    <Page
      title="Send to Telegram 2.0"
      description="Rebuilt from the ground up. Your chat, settings and history came along, so everything keeps working as before."
    >
      <section aria-labelledby="carried" className="flex flex-col gap-3">
        <h2 id="carried" className="text-sm font-medium">
          Carried over
        </h2>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 rounded-xl border px-5 py-4 text-sm">
          {destination ? (
            <>
              <dt className="text-muted-foreground">Chat</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <ChatAvatar name={destinationName(destination)} size="sm" />
                <span className="truncate">{destinationName(destination)}</span>
              </dd>
            </>
          ) : null}
          {settings.tags.enabled && tags.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Hashtags</dt>
              <dd className="truncate">
                {tags.map((tag) => `#${tag}`).join(' ')}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">History</dt>
          <dd className="tabular-nums">
            {plural(history.length, {
              one: '# sent item',
              other: '# sent items',
            })}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="new" className="flex flex-col gap-4">
        <h2 id="new" className="text-sm font-medium">
          What’s new
        </h2>
        <ul className="flex flex-col gap-4">
          <Feature icon={SentIcon} title="Send from the toolbar">
            Open the popup to send the page or the text you selected, with a
            note and a hashtag.
          </Feature>
          <Feature icon={MessageMultiple01Icon} title="More than one chat">
            Send to yourself, a group or a channel, and choose from the
            right-click menu.
          </Feature>
          <Feature icon={Clock01Icon} title="History you can search">
            Find anything you sent and send it again.
          </Feature>
          <Feature icon={TextIcon} title="Line breaks survive">
            Selected text keeps its paragraphs, and long selections arrive in
            full instead of being cut off.
          </Feature>
          {hasRelay ? (
            <Feature icon={FlashIcon} title="Setup without BotFather">
              New chats can use the Send to Telegram bot instead of a bot of
              your own.
            </Feature>
          ) : null}
        </ul>
      </section>

      <Actions>
        <Button
          variant="outline"
          onClick={() => void openExtensionPage('/options.html')}
        >
          Open settings
        </Button>
        <Button
          onClick={async () => {
            await onboardingStore.update(
              ({ migratedFrom: _seen, ...state }) => state
            );
            await closeTab();
          }}
        >
          Done
        </Button>
      </Actions>
    </Page>
  );
}
