import {
  ArrowLeft01Icon,
  HashtagIcon,
  Link04Icon,
  Search01Icon,
  SentIcon,
  Settings01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { browser } from 'wxt/browser';

import { AppMark } from '@/components/app-mark';
import { ChatAvatar } from '@/components/chat-avatar';
import { ChatHistory } from '@/components/chat-history';
import { ChatSearch } from '@/components/chat-search';
import {
  MessagePreview,
  type MessageStatus,
} from '@/components/message-preview';
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
import { Kbd } from '@/components/ui/kbd';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useChatItems } from '@/hooks/use-chat-items';
import { useInbox } from '@/hooks/use-inbox';
import { useStore } from '@/hooks/use-store';
import { draftFromEntry, openExtensionPage, requestSend } from '@/lib/client';
import type { Draft } from '@/lib/compose';
import { revealMessage } from '@/lib/reveal';
import {
  avatarSeed,
  defaultDestination,
  destinationName,
  historyStore,
  type Settings,
  settingsStore,
} from '@/lib/settings';

import type { PageContext } from './page';

type Phase =
  | { name: 'idle' }
  | { name: 'sending' }
  | { name: 'sent'; destination: string }
  | { name: 'failed'; message: string; canSetUp: boolean };

const statusOf = {
  idle: 'draft',
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
} satisfies Record<Phase['name'], MessageStatus>;

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

type View = 'send' | 'search' | 'settings';

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

function HeaderButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: typeof Search01Icon;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            tone="muted"
            aria-label={label}
            onClick={onClick}
          />
        }
      >
        <HugeiconsIcon icon={icon} strokeWidth={1.8} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Drawn like a Telegram chat: the chat you're sending to on top, earlier
 * messages and yours in the middle, and the note field at the bottom. The
 * chat is the history here; the full list lives on the settings page. Fixed
 * height so switching views doesn't resize the popup window, which browsers
 * animate poorly. Chrome caps popups at 600px.
 */
function Shell({ page, settings }: { page: PageContext; settings: Settings }) {
  const { view, show } = useNavigation();
  const [focusKey, setFocusKey] = useState<string>();

  const [destinationId, setDestinationId] = useState(
    defaultDestination(settings)?.id
  );

  const destination = settings.destinations.find(
    (item) => item.id === destinationId
  );

  const botToken = destination?.kind === 'bot' ? destination.token : undefined;

  const chatShown =
    settings.history.mode === 'full' && settings.history.showInChat;

  return (
    <div className="flex h-[540px] w-[360px] flex-col">
      {view === 'send' ? (
        <header className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
          <ChatPicker
            settings={settings}
            value={destinationId}
            onChange={setDestinationId}
          />
          {chatShown ? (
            <HeaderButton
              label="Search"
              icon={Search01Icon}
              onClick={() => show('search')}
            />
          ) : null}
          <HeaderButton
            label="Settings"
            icon={Settings01Icon}
            onClick={() => show('settings')}
          />
        </header>
      ) : null}

      {view === 'settings' ? (
        <header className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            autoFocus
            onClick={() => show('send')}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
          </Button>
          <h1 className="text-sm font-semibold">Settings</h1>
        </header>
      ) : null}

      {/* Kept mounted so a half-written note survives a search or a look at
          settings. */}
      <div hidden={view !== 'send'} className="min-h-0 flex-1">
        <Composer
          page={page}
          settings={settings}
          destinationId={destinationId}
          focusKey={focusKey}
          onOpenChatSettings={() => show('settings', 'chats')}
          onOpenTagSettings={() => show('settings', 'hashtags')}
        />
      </div>

      {view === 'search' ? (
        <ChatSearch
          settings={settings}
          destinationId={destinationId}
          botToken={botToken}
          onClose={() => show('send')}
          onShow={(key) => {
            // Rendered at once, with enough of the chat to hold the message,
            // so it can be scrolled to right away.
            flushSync(() => {
              setFocusKey(key);
              show('send');
            });
            revealMessage(key);
          }}
        />
      ) : null}

      {view === 'settings' ? (
        <div className="min-h-0 flex-1 animate-enter">
          <ScrollArea className="h-full">
            <SettingsPanel />
          </ScrollArea>
        </div>
      ) : null}
    </div>
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
    <main className="flex w-[360px] flex-col items-center gap-5 px-8 pt-10 pb-8 text-center">
      <AppMark size="lg" />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-base font-semibold">Send anything to Telegram</h1>
        <p className="text-sm text-muted-foreground">
          Connect a chat once, then send pages, links and text in one click.
        </p>
      </div>
      <Button
        variant="brand"
        size="lg"
        autoFocus
        onClick={() => void openExtensionPage('/welcome.html').then(close)}
      >
        Connect Telegram
      </Button>
    </main>
  );
}

function SendButton({ phase, onSend }: { phase: Phase; onSend: () => void }) {
  const busy = phase.name === 'sending' || phase.name === 'sent';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="brand"
            size="send"
            aria-label="Send"
            aria-keyshortcuts="Enter"
            aria-disabled={busy}
            onClick={onSend}
            className="relative overflow-hidden"
          />
        }
      >
        {phase.name === 'sent' ? (
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2.5}
            className="animate-pop"
          />
        ) : phase.name === 'sending' ? (
          <>
            <HugeiconsIcon
              icon={SentIcon}
              strokeWidth={2}
              className="absolute animate-depart"
            />
            <span className="animate-pop-late">
              <Spinner />
            </span>
          </>
        ) : (
          <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
        )}
      </TooltipTrigger>
      <TooltipContent>
        Send
        <Kbd>↵</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

function Composer({
  page,
  settings,
  destinationId,
  focusKey,
  onOpenChatSettings,
  onOpenTagSettings,
}: {
  page: PageContext;
  settings: Settings;
  destinationId: string | undefined;
  /** A message picked in search, kept on the page to scroll to. */
  focusKey: string | undefined;
  onOpenChatSettings: () => void;
  onOpenTagSettings: () => void;
}) {
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [time] = useState(() => Date.now());

  const [mode, setMode] = useState<'page' | 'selection'>(
    page.selection ? 'selection' : 'page'
  );

  const [note, setNote] = useState('');
  const [tag, setTag] = useState<string>();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const tags = settings.tags.enabled ? settings.tags.list : [];
  const attachPage = settings.composer.attachPage && page.url !== undefined;
  const busy = phase.name === 'sending' || phase.name === 'sent';
  const [firstSendAt, setFirstSendAt] = useState<number>();
  const earlier = useChatItems(settings, destinationId, firstSendAt);

  const destination = settings.destinations.find(
    (item) => item.id === destinationId
  );

  useInbox(
    destination,
    !page.incognito &&
      settings.history.mode === 'full' &&
      settings.history.showInChat
  );

  async function send() {
    if (busy) return;

    const draft: Draft = {
      kind: mode,
      ...(attachPage && page.url && { pageUrl: page.url }),
      ...(attachPage && page.title && { pageTitle: page.title }),
      ...(mode === 'selection' && page.selection && { text: page.selection }),
      ...(note.trim() && { note }),
      ...(tag && { tag }),
      ...(destinationId && { destinationId }),
    };

    setPhase({ name: 'sending' });
    setFirstSendAt((current) => current ?? Date.now());

    const outcome = await requestSend(draft, { incognito: page.incognito });

    if (outcome.ok) {
      setPhase({ name: 'sent', destination: outcome.destination });
      setTimeout(close, 1000);

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

  /** Enter sends, as in Telegram; Shift+Enter starts a new line. */
  function onNoteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Reversed around a single child, so it opens scrolled to the newest
          message and stays there as the draft grows. Keyed so another chat
          opens at its newest message too. */}
      <div
        key={destinationId}
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-chat p-3"
      >
        <div className="flex flex-col gap-3">
          <ChatHistory
            items={earlier}
            delivery={settings.delivery}
            botToken={
              destination?.kind === 'bot' ? destination.token : undefined
            }
            now={time}
            draftBelow
            focusKey={focusKey}
          />

          {page.selection ? (
            <ToggleGroup
              variant="segmented"
              size="sm"
              aria-label="What to send"
              value={[mode]}
              onValueChange={([next]) => {
                if (next === 'page' || next === 'selection') setMode(next);
              }}
              className="self-center"
            >
              <ToggleGroupItem value="selection">Selected text</ToggleGroupItem>
              <ToggleGroupItem value="page">Page link</ToggleGroupItem>
            </ToggleGroup>
          ) : null}

          {phase.name === 'failed' ? null : (
            <LastFailure
              inChat={(id) =>
                earlier.some(
                  (item) => item.direction === 'out' && item.entry.id === id
                )
              }
            />
          )}

          <MessagePreview
            kind={mode}
            pageUrl={attachPage ? page.url : undefined}
            pageTitle={attachPage ? page.title : undefined}
            favIconUrl={page.favIconUrl}
            text={page.selection}
            note={note}
            tag={tag}
            delivery={settings.delivery}
            status={statusOf[phase.name]}
            time={time}
            standOut={earlier.length > 0}
          />

          {phase.name === 'failed' ? (
            <Alert variant="destructive">
              <AlertTitle>Not sent</AlertTitle>
              <AlertDescription>
                {phase.message}{' '}
                {phase.canSetUp ? (
                  <Button
                    variant="link"
                    size="text"
                    onClick={onOpenChatSettings}
                  >
                    Open chat settings
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <p role="status" className="sr-only">
            {phase.name === 'sent' ? `Sent to ${phase.destination}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-end gap-1 border-t py-2.5 pr-3 pl-1.5">
        {page.url ? (
          <PageLinkToggle
            pressed={attachPage}
            onPressedChange={(pressed) =>
              void settingsStore.update((current) => ({
                ...current,
                composer: { ...current.composer, attachPage: pressed },
              }))
            }
          />
        ) : null}
        {tags.length > 0 ? (
          <TagPicker
            tags={tags}
            value={tag}
            onChange={(next) => {
              setTag(next);
              noteRef.current?.focus();
            }}
            onManage={onOpenTagSettings}
          />
        ) : null}
        <label htmlFor={noteId} className="sr-only">
          Note
        </label>
        <Textarea
          ref={noteRef}
          id={noteId}
          variant="bare"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={onNoteKeyDown}
          readOnly={busy}
          placeholder="Add a note"
          rows={1}
          autoFocus
        />
        <SendButton phase={phase} onSend={() => void send()} />
      </div>
    </div>
  );
}

/** Whether the page's link goes with the message; the choice is kept for next time. */
function PageLinkToggle({
  pressed,
  onPressedChange,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            variant="accent"
            size="icon"
            aria-label="Attach page link"
            pressed={pressed}
            onPressedChange={onPressedChange}
          />
        }
      >
        <HugeiconsIcon icon={Link04Icon} strokeWidth={1.8} />
      </TooltipTrigger>
      <TooltipContent>
        {pressed ? 'Page link attached' : 'Attach page link'}
      </TooltipContent>
    </Tooltip>
  );
}

/** A hashtag for the message, picked from a menu so the field keeps its room. */
function TagPicker({
  tags,
  value,
  onChange,
  onManage,
}: {
  tags: string[];
  value: string | undefined;
  onChange: (tag: string | undefined) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Toggle
                  variant="accent"
                  size="icon"
                  aria-label={value ? `Hashtag: #${value}` : 'Add a hashtag'}
                  pressed={value !== undefined}
                />
              }
            />
          }
        >
          <HugeiconsIcon icon={HashtagIcon} strokeWidth={1.8} />
        </TooltipTrigger>
        <TooltipContent>{value ? `#${value}` : 'Add a hashtag'}</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" className="w-auto max-w-80">
        <ToggleGroup
          size="sm"
          variant="chip"
          spacing={1}
          aria-label="Hashtag"
          value={value ? [value] : []}
          onValueChange={([next]) => {
            onChange(next);
            setOpen(false);
          }}
          className="flex-wrap"
        >
          {tags.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              #{item}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs">
          <Button
            variant="link"
            size="text"
            tone="muted"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            Edit hashtags
          </Button>
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The newest send failed, likely from the right-click menu: this is what the
 * red toolbar badge pointed at, so say why. Left out when the failed message
 * already shows in this chat, with its own way to send it again.
 */
function LastFailure({ inChat }: { inChat: (entryId: string) => boolean }) {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const [retrying, setRetrying] = useState(false);
  const entry = history[0];

  if (
    settings.history.mode === 'off' ||
    entry?.status !== 'failed' ||
    inChat(entry.id)
  ) {
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

/** The chat a message goes to, in the header like a Telegram chat's name. */
function ChatPicker({
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

  if (!current) return <span className="flex-1" />;

  if (destinations.length === 1) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5">
        <ChatAvatar
          name={destinationName(current)}
          seed={avatarSeed(current)}
        />
        <span className="truncate text-sm font-medium">
          {destinationName(current)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1">
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
          size="lg"
          aria-label="Send to"
          className="min-w-0"
        >
          <ChatAvatar
            name={destinationName(current)}
            seed={avatarSeed(current)}
          />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {destinations.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <ChatAvatar
                  name={destinationName(item)}
                  seed={avatarSeed(item)}
                  size="sm"
                />
                {destinationName(item)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
