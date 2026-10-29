import {
  CheckmarkCircle02Icon,
  Globe02Icon,
  RepeatIcon,
  Settings02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { browser } from 'wxt/browser';

import { AppMark } from '@/components/app-mark';
import { ChatAvatar } from '@/components/chat-avatar';
import { HistoryRow } from '@/components/history-row';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
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

  return <Composer page={page} settings={settings} />;
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
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open settings"
        onClick={() => void openExtensionPage('/options.html').then(close)}
      >
        <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.8} />
      </Button>
    </header>
  );
}

function Composer({
  page,
  settings,
}: {
  page: PageContext;
  settings: Settings;
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
    <main className="flex w-[360px] flex-col" onKeyDown={onKeyDown}>
      <PageHeader page={page} />

      <div className="flex flex-col gap-3 p-4">
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
          className="max-h-40 min-h-16"
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

        {phase.name === 'failed' ? (
          <Alert variant="destructive">
            <AlertTitle>Not sent</AlertTitle>
            <AlertDescription>
              {phase.message}
              {phase.canSetUp ? (
                <Button
                  variant="link"
                  size="text"
                  onClick={() =>
                    void openExtensionPage('/options.html', '#chats').then(
                      close
                    )
                  }
                >
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

      <Recent />
    </main>
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

function Recent() {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const [now] = useState(() => Date.now());
  const recent = history.slice(0, 3);

  if (settings.history.mode === 'off' || recent.length === 0) return null;

  return (
    <section
      aria-labelledby="recent"
      className="flex flex-col gap-1 border-t px-2 pt-3 pb-2"
    >
      <div className="flex items-center justify-between pr-1 pl-2">
        <h2 id="recent" className="text-xs font-medium text-muted-foreground">
          Recent
        </h2>
        <Button
          variant="ghost"
          size="xs"
          tone="muted"
          onClick={() =>
            void openExtensionPage('/options.html', '#history').then(close)
          }
        >
          View history
        </Button>
      </div>
      {recent.map((entry) => {
        const draft =
          entry.status === 'failed' ? draftFromEntry(entry) : undefined;

        return (
          <HistoryRow
            key={entry.id}
            entry={entry}
            now={now}
            actions={
              draft ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Send again"
                  onClick={() =>
                    void requestSend(draft, {
                      incognito: false,
                      retryOf: entry.id,
                    })
                  }
                >
                  <HugeiconsIcon icon={RepeatIcon} strokeWidth={1.8} />
                </Button>
              ) : null
            }
          />
        );
      })}
    </section>
  );
}
