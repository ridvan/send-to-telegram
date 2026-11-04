import {
  Clock01Icon,
  KeyboardIcon,
  MessageMultiple01Icon,
  MouseRightClick02Icon,
  PinIcon,
  SentIcon,
  TextIcon,
  TickDouble02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';

import { AppMark } from '@/components/app-mark';
import { ChatAvatar } from '@/components/chat-avatar';
import { ChatName } from '@/components/chat-name';
import { ConnectBot } from '@/components/connect/connect-bot';
import { IconTile, type TileTone } from '@/components/icon-tile';
import { useShortcuts } from '@/components/shortcuts';
import { ThemePicker } from '@/components/theme-picker';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { useStore } from '@/hooks/use-store';
import { openExtensionPage } from '@/lib/client';
import { addDestination } from '@/lib/destinations';
import { plural } from '@/lib/format';
import {
  avatarSeed,
  defaultDestination,
  destinationName,
  historyStore,
  onboardingStore,
  settingsStore,
} from '@/lib/settings';

const isMac = navigator.userAgent.includes('Mac');

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
    <main className="mx-auto flex min-h-dvh w-full max-w-152 flex-col gap-10 px-6 py-12 sm:py-20">
      <header className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <AppMark size="lg" />
          <ThemePicker compact />
        </div>
        <div className="flex flex-col gap-1.5">
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
      title="Send anything to Telegram"
      description="Connect a Telegram chat, and everything you send from this browser lands there."
    >
      <ConnectBot
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

/**
 * The whole idea in one still: the right-click menu on a page, and the
 * message it sends arriving in Telegram.
 */
function FlowIllustration() {
  return (
    <figure
      aria-label="Right-click selected text and choose Send selection to Telegram. It arrives in your chat."
      className="relative flex h-56 flex-col justify-between overflow-hidden rounded-2xl bg-chat p-5"
    >
      <div
        aria-hidden
        className="w-60 rounded-lg border bg-popover p-1 text-sm shadow-lg"
      >
        <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-muted-foreground">
          Copy
          <span className="text-xs">{isMac ? '⌘C' : 'Ctrl+C'}</span>
        </div>
        <Separator className="my-1" />
        <div className="flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 font-medium">
          <AppMark size="sm" />
          Send selection to Telegram
        </div>
      </div>
      <div
        aria-hidden
        className="flex max-w-64 animate-rise flex-col self-end rounded-2xl rounded-br-sm bg-bubble px-3 py-1.5 text-sm text-bubble-foreground shadow-xs"
      >
        Grid is a two-dimensional layout system.
        <span className="flex items-center justify-end gap-1 text-xs text-bubble-muted">
          now
          <HugeiconsIcon
            icon={TickDouble02Icon}
            strokeWidth={2}
            className="size-3.5 text-bubble-accent"
          />
        </span>
      </div>
    </figure>
  );
}

function Tip({
  icon,
  tone,
  children,
}: {
  icon: typeof SentIcon;
  tone: TileTone;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <IconTile icon={icon} tone={tone} size="sm" />
      <span>{children}</span>
    </li>
  );
}

function Ready({ chat }: { chat: string }) {
  const shortcuts = useShortcuts();
  const sendPage = shortcuts.find((shortcut) => shortcut.name === 'send-page');

  return (
    <Page
      title="You’re all set"
      description={
        <>
          Messages go to <ChatName name={chat} />.
        </>
      }
    >
      <div className="flex animate-rise flex-col gap-8">
        <FlowIllustration />
        <ul className="flex flex-col gap-3">
          <Tip icon={MouseRightClick02Icon} tone="blue">
            Right-click text, links, images or the page
          </Tip>
          <Tip icon={PinIcon} tone="orange">
            Pin the extension to add a note or hashtag
          </Tip>
          {sendPage?.keys ? (
            <Tip icon={KeyboardIcon} tone="violet">
              <Kbd>{sendPage.keys}</Kbd> sends the page you’re on
            </Tip>
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
  tone,
  title,
  children,
}: {
  icon: typeof SentIcon;
  tone: TileTone;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <IconTile icon={icon} tone={tone} />
      <div className="flex flex-col">
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
      description="Rebuilt from scratch. Your chat, settings and history came along."
    >
      <section aria-labelledby="carried" className="flex flex-col gap-3">
        <h2 id="carried" className="text-sm font-medium">
          Carried over
        </h2>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 rounded-xl border px-5 py-4 text-sm">
          {destination ? (
            <>
              <dt className="text-muted-foreground">Chat</dt>
              <dd className="group/name flex min-w-0 items-center gap-2">
                <ChatAvatar
                  name={destinationName(destination)}
                  seed={avatarSeed(destination)}
                  avatar={destination.avatar}
                  size="sm"
                />
                <ChatName
                  name={destinationName(destination)}
                  className="truncate"
                />
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
          <Feature icon={SentIcon} tone="blue" title="Send from the toolbar">
            With a note and a hashtag, previewed as it will arrive.
          </Feature>
          <Feature
            icon={MessageMultiple01Icon}
            tone="green"
            title="More than one chat"
          >
            Yourself, groups and channels.
          </Feature>
          <Feature
            icon={Clock01Icon}
            tone="pink"
            title="History you can search"
          >
            Find anything and send it again.
          </Feature>
          <Feature icon={TextIcon} tone="orange" title="Line breaks survive">
            Long selections arrive in full.
          </Feature>
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
