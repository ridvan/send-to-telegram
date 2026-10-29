import { CheckmarkCircle02Icon, Globe02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { browser } from 'wxt/browser';

import { AppMark } from '@/components/app-mark';
import { ChatAvatar } from '@/components/chat-avatar';
import { HistoryView } from '@/components/history-view';
import { SettingsDensity } from '@/components/setting-row';
import { ChatsSection } from '@/components/settings/chats-section';
import {
  GeneralSection,
  HistorySection,
  MessagesSection,
  TagsSection,
} from '@/components/settings/preferences';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Kbd } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useStore } from '@/hooks/use-store';
import { draftFromEntry, openExtensionPage, requestSend } from '@/lib/client';
import type { Draft } from '@/lib/compose';
import { displayUrl } from '@/lib/format';
import {
  defaultDestination,
  destinationName,
  historyStore,
  type Settings,
  settingsStore,
} from '@/lib/settings';

import type { PageContext } from './page';

const isMac = navigator.userAgent.includes('Mac');

type Phase =
  | { name: 'idle' }
  | { name: 'sending' }
  | { name: 'sent' }
  | { name: 'failed'; message: string; canSetUp: boolean };

/** Holding the port open tells the background the popup is showing, so it clears a failure badge. */
function useBadgeReset() {
  useEffect(() => {
    const port = browser.runtime.connect({ name: 'popup' });

    return () => port.disconnect();
  }, []);
}

function close() {
  window.close();
}

export function Popup({ page }: { page: PageContext }) {
  const settings = useStore(settingsStore);

  useBadgeReset();

  if (settings.destinations.length === 0) return <SetupPrompt />;

  return <Shell page={page} settings={settings} />;
}

const views = ['send', 'history', 'settings'] as const;

type View = (typeof views)[number];

function isView(value: unknown): value is View {
  return views.some((view) => view === value);
}

/** Switches to a view and, once it renders, scrolls a section of it into view. */
function useNavigation() {
  const [view, setView] = useState<View>('send');

  function show(next: View, sectionId?: string) {
    setView(next);

    if (sectionId) {
      requestAnimationFrame(() =>
        document.getElementById(sectionId)?.scrollIntoView()
      );
    }
  }

  return { view, show };
}

/**
 * Fixed height so switching views doesn't resize the popup window, which
 * browsers animate poorly. Chrome caps popups at 600px.
 */
function Shell({ page, settings }: { page: PageContext; settings: Settings }) {
  const { view, show } = useNavigation();
  const history = useStore(historyStore);
  const lastFailed = history[0]?.status === 'failed';

  return (
    <Tabs
      value={view}
      onValueChange={(next) => {
        if (isView(next)) show(next);
      }}
      spacing="none"
      className="h-[540px] w-[360px]"
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
        <AppMark size="sm" />
        <TabsList variant="line" aria-label="Send to Telegram">
          <TabsTrigger value="send">Send</TabsTrigger>
          <TabsTrigger value="history">
            History
            {lastFailed ? (
              <span className="size-1.5 rounded-full bg-destructive">
                <span className="sr-only">, last message not sent</span>
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </header>

      {/* Kept mounted so a half-written note survives a look at settings. */}
      <TabsContent value="send" keepMounted className="min-h-0">
        <Composer
          page={page}
          settings={settings}
          onOpenChatSettings={() => show('settings', 'chats')}
        />
      </TabsContent>

      <TabsContent value="history" className="min-h-0">
        <ScrollArea className="h-full">
          {/* Relative, so sr-only text can't escape the scroll viewport. */}
          <div className="relative p-4">
            <HistoryView
              onOpenSettings={() => show('settings', 'history-settings')}
            />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="settings" className="min-h-0">
        <ScrollArea className="h-full">
          <SettingsPanel />
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

function SettingsPanel() {
  const version = browser.runtime.getManifest().version;

  return (
    <div className="relative">
      <SettingsDensity density="compact">
        <ChatsSection
          onAdd={() =>
            void openExtensionPage('/options.html', '#add-chat').then(close)
          }
        />
        <MessagesSection />
        <TagsSection />
        <HistorySection />
        {/* Clearing storage empties the chats, so the popup shows setup. */}
        <GeneralSection onReset={() => undefined} />
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2 pb-4 text-xs text-muted-foreground">
          <span className="tabular-nums">{`Version ${version}`}</span>
          <a
            href="https://github.com/ridvan/send-to-telegram"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Source code
          </a>
        </footer>
      </SettingsDensity>
    </div>
  );
}

function SetupPrompt() {
  return (
    <main className="w-[360px] p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <AppMark size="lg" />
          </EmptyMedia>
          <EmptyTitle>Connect a Telegram chat</EmptyTitle>
          <EmptyDescription>
            Choose where the pages, links and text you send should arrive. It
            takes about a minute.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            autoFocus
            onClick={() => void openExtensionPage('/welcome.html').then(close)}
          >
            Get started
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}

function PageHeader({ page }: { page: PageContext }) {
  return (
    <header className="flex items-center gap-3 px-4 pt-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
        {page.favIconUrl ? (
          <img src={page.favIconUrl} alt="" className="size-4" />
        ) : (
          <HugeiconsIcon
            icon={Globe02Icon}
            strokeWidth={1.8}
            className="size-4 text-muted-foreground"
          />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-medium">
          {page.title ?? 'Untitled page'}
        </p>
        {page.url ? (
          <p className="truncate text-xs text-muted-foreground">
            {displayUrl(page.url)}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function Composer({
  page,
  settings,
  onOpenChatSettings,
}: {
  page: PageContext;
  settings: Settings;
  onOpenChatSettings: () => void;
}) {
  const noteId = useId();
  const fallback = defaultDestination(settings);
  const [destinationId, setDestinationId] = useState(fallback?.id);

  const [mode, setMode] = useState<'page' | 'selection'>(
    page.selection ? 'selection' : 'page'
  );

  const [note, setNote] = useState('');
  const [tag, setTag] = useState<string>();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const tags = settings.tags.enabled ? settings.tags.list : [];
  const busy = phase.name === 'sending' || phase.name === 'sent';

  async function send() {
    if (busy) return;

    const draft: Draft = {
      kind: mode,
      ...(page.url && { pageUrl: page.url }),
      ...(page.title && { pageTitle: page.title }),
      ...(mode === 'selection' && page.selection && { text: page.selection }),
      ...(note.trim() && { note }),
      ...(tag && { tag }),
      ...(destinationId && { destinationId }),
    };

    setPhase({ name: 'sending' });

    const outcome = await requestSend(draft, { incognito: page.incognito });

    if (outcome.ok) {
      setPhase({ name: 'sent' });
      setTimeout(close, 900);

      return;
    }

    setPhase({
      name: 'failed',
      message: outcome.message,
      canSetUp:
        outcome.reason === 'unauthorized' ||
        outcome.reason === 'no_destination',
    });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
      <PageHeader page={page} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {page.selection ? (
          <div className="flex flex-col gap-2">
            <ToggleGroup
              variant="outline"
              size="sm"
              aria-label="What to send"
              value={[mode]}
              onValueChange={([next]) => {
                if (next === 'page' || next === 'selection') setMode(next);
              }}
              className="w-full"
            >
              <ToggleGroupItem value="selection" className="flex-1">
                Selected text
              </ToggleGroupItem>
              <ToggleGroupItem value="page" className="flex-1">
                Page link
              </ToggleGroupItem>
            </ToggleGroup>
            {mode === 'selection' ? (
              <blockquote className="line-clamp-4 border-l-2 pl-3 text-sm text-pretty whitespace-pre-line text-muted-foreground">
                {page.selection}
              </blockquote>
            ) : null}
          </div>
        ) : null}

        <label htmlFor={noteId} className="sr-only">
          Note
        </label>
        <Textarea
          id={noteId}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a note"
          rows={2}
          className="min-h-16 flex-1 resize-none"
        />

        {tags.length > 0 ? (
          <ToggleGroup
            size="sm"
            variant="outline"
            spacing={1}
            aria-label="Hashtag"
            value={tag ? [tag] : []}
            onValueChange={([next]) => setTag(next)}
            className="flex-wrap"
          >
            {tags.map((item) => (
              <ToggleGroupItem key={item} value={item}>
                #{item}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}

        {phase.name === 'failed' ? null : <LastFailure />}

        {phase.name === 'failed' ? (
          <Alert variant="destructive">
            <AlertTitle>Not sent</AlertTitle>
            <AlertDescription>
              {phase.message}
              {phase.canSetUp ? (
                <Button variant="link" size="text" onClick={onOpenChatSettings}>
                  Open chat settings
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <footer className="flex items-center gap-2 border-t px-4 py-3">
        <DestinationPicker
          settings={settings}
          value={destinationId}
          onChange={setDestinationId}
        />
        <Button
          autoFocus
          onClick={() => void send()}
          disabled={busy}
          className="min-w-24"
          aria-keyshortcuts={isMac ? 'Meta+Enter' : 'Control+Enter'}
        >
          {phase.name === 'sending' ? (
            <>
              <Spinner data-icon="inline-start" />
              Sending
            </>
          ) : phase.name === 'sent' ? (
            <>
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Sent
            </>
          ) : (
            <>
              Send
              <Kbd variant="button" data-icon="inline-end">
                {isMac ? '⌘↵' : 'Ctrl ↵'}
              </Kbd>
            </>
          )}
        </Button>
      </footer>
    </div>
  );
}

/**
 * The newest send failed, likely from the right-click menu: this is what the
 * red toolbar badge pointed at, so say why here rather than only in History.
 */
function LastFailure() {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const [retrying, setRetrying] = useState(false);
  const entry = history[0];

  if (settings.history.mode === 'off' || entry?.status !== 'failed') {
    return null;
  }

  const draft = draftFromEntry(entry);

  return (
    <Alert variant="destructive">
      <AlertTitle>Last message not sent</AlertTitle>
      <AlertDescription>
        {entry.error ?? 'Telegram didn’t accept it. Try sending it again.'}
      </AlertDescription>
      {draft ? (
        <AlertAction>
          <Button
            variant="outline"
            size="xs"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              await requestSend(draft, {
                incognito: false,
                retryOf: entry.id,
              });
              setRetrying(false);
            }}
          >
            Send again
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

function DestinationPicker({
  settings,
  value,
  onChange,
}: {
  settings: Settings;
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const destinations = settings.destinations;

  const current =
    destinations.find((item) => item.id === value) ?? destinations[0];

  if (!current) return null;

  if (destinations.length === 1) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <ChatAvatar name={destinationName(current)} size="sm" />
        <span className="truncate text-muted-foreground">
          {destinationName(current)}
        </span>
      </div>
    );
  }

  return (
    <Select
      value={current.id}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
      items={destinations.map((item) => ({
        value: item.id,
        label: destinationName(item),
      }))}
    >
      <SelectTrigger
        variant="ghost"
        aria-label="Send to"
        className="min-w-0 flex-1"
      >
        <ChatAvatar name={destinationName(current)} size="sm" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {destinations.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <ChatAvatar name={destinationName(item)} size="sm" />
              {destinationName(item)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
