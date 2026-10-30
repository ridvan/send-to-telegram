import {
  ArrowLeft01Icon,
  Attachment01Icon,
  Cancel01Icon,
  Link01Icon,
  Search01Icon,
  Settings01Icon,
  Tick02Icon,
  Unlink04Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  type RefObject,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';

import { AppMark } from '@/components/app-mark';
import { ChatAvatar } from '@/components/chat-avatar';
import { ChatHistory } from '@/components/chat-history';
import { SelectionBar } from '@/components/chat-selection';
import { ChatName } from '@/components/chat-name';
import {
  ChatSearchField,
  MatchCount,
  NoMatches,
} from '@/components/chat-search';
import { HashtagSuggestions } from '@/components/hashtag-suggestions';
import { MenuItem } from '@/components/message-menu';
import { PlaneIcon } from '@/components/plane-icon';
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
  PrivacySection,
  TagsSection,
} from '@/components/settings/preferences';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ContextMenuContent } from '@/components/ui/context-menu';
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
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAttachment } from '@/hooks/use-attachment';
import { chatKey, useChatItems } from '@/hooks/use-chat-items';
import { useHashtagSuggestions } from '@/hooks/use-hashtag-suggestions';
import { useInbox } from '@/hooks/use-inbox';
import { useStore } from '@/hooks/use-store';
import { saveAttachment } from '@/lib/attachments';
import { deleteMessages } from '@/lib/chat-actions';
import { draftFromEntry, openExtensionPage, requestSend } from '@/lib/client';
import { plural } from '@/lib/format';
import type { Draft } from '@/lib/compose';
import { revealMessage } from '@/lib/reveal';
import { matchChatItems } from '@/lib/search';
import {
  avatarSeed,
  defaultDestination,
  destinationName,
  historyStore,
  type Settings,
  settingsStore,
} from '@/lib/settings';
import { cn } from '@/lib/utils';

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

type View = 'send' | 'search' | 'select' | 'settings';

/** Messages checked to delete together, by `chatKey`. */
type ChatSelection = {
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
};

type ChatSearch = {
  query: string;
  onClear: () => void;
  /** Closes search and scrolls the chat to the message picked. */
  onShow: (key: string) => void;
};

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
  const [query, setQuery] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  /** Back from search, typing goes to the note again. */
  function closeSearch() {
    flushSync(() => {
      setQuery('');
      show('send');
    });
    noteRef.current?.focus();
  }

  const [destinationId, setDestinationId] = useState(
    defaultDestination(settings)?.id
  );

  const chatShown =
    settings.history.mode === 'full' && settings.history.showInChat;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const items = useChatItems(settings, destinationId);
  // Read from the chat, so a message deleted elsewhere no longer counts.
  const chosen = items.filter((item) => selected.has(chatKey(item)));

  function startSelecting(key: string) {
    setSelected(new Set([key]));
    show('select');
  }

  function toggleSelected(key: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (!next.delete(key)) next.add(key);

      return next;
    });
  }

  function stopSelecting() {
    flushSync(() => {
      setSelected(new Set());
      show('send');
    });
    noteRef.current?.focus();
  }

  async function deleteSelected() {
    const count = chosen.length;

    await deleteMessages(chosen);
    stopSelecting();
    toast(
      plural(count, {
        one: 'Deleted # message from this browser',
        other: 'Deleted # messages from this browser',
      })
    );
  }

  /** Escape leaves selecting, unless it's closing the dialog that asks first. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (view !== 'select' || event.key !== 'Escape') return;

    if (
      event.target instanceof Element &&
      event.target.closest('[role="alertdialog"]')
    ) {
      return;
    }

    // Never closes the popup.
    event.preventDefault();
    stopSelecting();
  }

  return (
    <div className="flex h-[540px] w-[360px] flex-col" onKeyDown={onKeyDown}>
      {/* One header for the chat, its search and selecting messages, so each
          swaps what's in it and nothing else. */}
      {view === 'settings' ? null : (
        <header
          className={cn(
            // Edges on the chat's 12px gutter: icon buttons keep 8px around
            // their glyph, so they get 4px; the search field and Delete are
            // boxes that end at the gutter themselves.
            'flex h-14 shrink-0 items-center gap-1 border-b pl-1',
            view === 'search' || view === 'select' ? 'pr-3' : 'pr-1'
          )}
        >
          {view === 'search' ? (
            <ChatSearchField
              query={query}
              onQueryChange={setQuery}
              onClose={closeSearch}
            />
          ) : view === 'select' ? (
            <SelectionBar
              count={chosen.length}
              onCancel={stopSelecting}
              onDelete={() => void deleteSelected()}
            />
          ) : (
            <>
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
            </>
          )}
        </header>
      )}

      {view === 'settings' ? (
        // The back button's glyph on the chat's 12px gutter, as above.
        <header className="flex h-14 shrink-0 items-center gap-1 border-b px-1">
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
          settings. Search filters this same chat in place. */}
      <div hidden={view === 'settings'} className="min-h-0 flex-1">
        <Composer
          page={page}
          settings={settings}
          destinationId={destinationId}
          focusKey={focusKey}
          onOpenChatSettings={() => show('settings', 'chats')}
          onOpenTagSettings={() => show('settings', 'hashtags')}
          noteRef={noteRef}
          onStartSelecting={startSelecting}
          selection={
            view === 'select'
              ? { selected, onToggle: toggleSelected }
              : undefined
          }
          search={
            view === 'search'
              ? {
                  query,
                  onClear: () => setQuery(''),
                  onShow: (key) => {
                    // Closing renders at once, with enough of the chat to
                    // hold the message, so it can be scrolled to right away.
                    setFocusKey(key);
                    closeSearch();
                    revealMessage(key);
                  },
                }
              : undefined
          }
        />
      </div>

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
        <PrivacySection />
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
            <PlaneIcon className="absolute animate-depart" />
            <span className="animate-pop-late">
              <Spinner />
            </span>
          </>
        ) : (
          <PlaneIcon />
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
  noteRef,
  onStartSelecting,
  selection,
  search,
}: {
  page: PageContext;
  settings: Settings;
  destinationId: string | undefined;
  /** A message picked in search, kept on the page to scroll to. */
  focusKey: string | undefined;
  onOpenChatSettings: () => void;
  onOpenTagSettings: () => void;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  onStartSelecting: (key: string) => void;
  /** While selecting, messages are checked and the note waits. */
  selection: ChatSelection | undefined;
  /** While searching, the chat shows only what matches and the note waits. */
  search: ChatSearch | undefined;
}) {
  const noteId = useId();
  const [time, setTime] = useState(() => Date.now());

  const [mode, setMode] = useState<'page' | 'selection'>(
    page.selection ? 'selection' : 'page'
  );

  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const tags = settings.tags.enabled ? settings.tags.list : [];
  const attachPage = settings.composer.attachPage && page.url !== undefined;
  const busy = phase.name === 'sending' || phase.name === 'sent';
  const [firstSendAt, setFirstSendAt] = useState<number>();
  const earlier = useChatItems(settings, destinationId, firstSendAt);

  const destination = settings.destinations.find(
    (item) => item.id === destinationId
  );

  const { attached, problem, attach, remove, refuse } = useAttachment();
  const [dropping, setDropping] = useState(false);
  // The relay takes JSON, so files go only to chats with your own bot.
  const canAttach = destination?.kind === 'bot';

  function attachOrRefuse(file: File) {
    if (canAttach) attach(file);
    else {
      refuse(
        'Files go only to chats connected with your own bot. Switch to one of those chats to attach it.'
      );
    }
  }

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
      ...(attached && { attachment: attached.info }),
      ...(destinationId && { destinationId }),
    };

    setPhase({ name: 'sending' });
    setFirstSendAt((current) => current ?? Date.now());
    refuse(undefined);

    if (attached) {
      try {
        await saveAttachment(attached.info.id, attached.file);
      } catch (cause) {
        console.error('Could not keep the file for sending', cause);
        setPhase({
          name: 'failed',
          message: 'Couldn’t get the file ready to send. Try again.',
          canSetUp: false,
        });

        return;
      }
    }

    const outcome = await requestSend(draft, { incognito: page.incognito });

    if (outcome.ok) {
      setPhase({ name: 'sent', destination: outcome.destination });
      // The draft shows its tick, then takes its place in the chat, and the
      // field clears for the next message, as in Telegram.
      setTimeout(() => {
        setNote('');
        remove();
        setTime(Date.now());
        setFirstSendAt(undefined);
        setPhase({ name: 'idle' });
        noteRef.current?.focus();
      }, 1000);

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

  const searching = search !== undefined;
  // Searching or selecting: the chat is looked through, not written to.
  const browsing = searching || selection !== undefined;

  const typed = useDeferredValue(
    search?.query.trim().toLocaleLowerCase() ?? ''
  );

  // Not deferred on close, so the full chat is back in the same render and a
  // picked message can be scrolled to.
  const term = searching ? typed : '';

  const matches = useMemo(() => matchChatItems(earlier, term), [earlier, term]);

  const noMatches = term !== '' && matches.length === 0;

  /** Kept as the choice for next time, for every page. */
  function setAttachPage(next: boolean) {
    void settingsStore.update((current) => ({
      ...current,
      composer: { ...current.composer, attachPage: next },
    }));
    noteRef.current?.focus();
  }

  function removeAttachment() {
    remove();
    noteRef.current?.focus();
  }

  // The draft's right-click menu, while it can still change.
  const draftMenu = (
    <ContextMenuContent>
      {page.url === undefined ? null : (
        <MenuItem
          icon={attachPage ? Unlink04Icon : Link01Icon}
          onClick={() => setAttachPage(!attachPage)}
        >
          {attachPage ? 'Remove page link' : 'Attach page link'}
        </MenuItem>
      )}
      {attached ? (
        <MenuItem icon={Cancel01Icon} onClick={removeAttachment}>
          Remove file
        </MenuItem>
      ) : null}
    </ContextMenuContent>
  );

  const draftMenuDisabled =
    busy || browsing || (page.url === undefined && !attached);

  /** A pasted screenshot or copied file goes with the message. */
  function onNotePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = event.clipboardData.files[0];

    if (!file || busy) return;

    event.preventDefault();
    attachOrRefuse(file);
  }

  /** Files dropped anywhere on the chat; the popup never opens them itself. */
  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = busy || browsing ? 'none' : 'copy';
    setDropping(!busy && !browsing);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    setDropping(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;

    event.preventDefault();
    setDropping(false);

    const file = event.dataTransfer.files[0];

    if (file && !busy && !browsing) attachOrRefuse(file);
  }

  const suggestions = useHashtagSuggestions({
    tags,
    value: note,
    onValueChange: setNote,
    textarea: noteRef,
    disabled: busy,
  });

  /** Enter sends, as in Telegram; Shift+Enter starts a new line. */
  function onNoteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // An open hashtag list takes Enter to pick a tag instead.
    if (suggestions.onKeyDown(event)) return;

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
    <div
      className="relative flex h-full flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dropping ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand/60 bg-background/85 text-sm font-medium text-brand backdrop-blur-sm"
        >
          {canAttach ? 'Drop to attach' : 'Files go only to your own bot'}
        </div>
      ) : null}
      {/* Reversed around a single child, so it opens scrolled to the newest
          message and stays there as the draft grows. Keyed so another chat
          opens at its newest message too. */}
      <div
        key={destinationId}
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-chat p-3"
      >
        <div
          className={
            noMatches ? 'my-auto flex flex-col gap-3' : 'flex flex-col gap-3'
          }
        >
          {noMatches && search ? (
            <NoMatches query={search.query} onClear={search.onClear} />
          ) : null}

          <ChatHistory
            items={matches}
            delivery={settings.delivery}
            botToken={
              destination?.kind === 'bot' ? destination.token : undefined
            }
            now={time}
            draftBelow={!term}
            focusKey={focusKey}
            onPick={search?.onShow}
            select={{
              selected: selection?.selected,
              onToggle: (key) => selection?.onToggle(key),
              onStart: onStartSelecting,
            }}
          />

          {term && !noMatches ? <MatchCount count={matches.length} /> : null}

          <p aria-live="polite" className="sr-only">
            {term
              ? plural(matches.length, {
                  one: '# message',
                  other: '# messages',
                })
              : ''}
          </p>

          {/* Always wrapped, so searching doesn't rebuild the draft: it dims
              while you search or select, and steps aside once you type. */}
          <div
            inert={browsing}
            hidden={term !== ''}
            className="flex flex-col gap-3 transition-opacity duration-150 inert:opacity-50"
          >
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
                <ToggleGroupItem value="selection">
                  Selected text
                </ToggleGroupItem>
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
              delivery={settings.delivery}
              status={statusOf[phase.name]}
              time={time}
              standOut={earlier.length > 0}
              attachment={attached && { ...attached.info, url: attached.url }}
              onRemoveAttachment={busy ? undefined : removeAttachment}
              onRemovePageLink={busy ? undefined : () => setAttachPage(false)}
              menu={draftMenu}
              menuDisabled={draftMenuDisabled}
            />

            {problem ? (
              <Alert variant="destructive">
                <AlertTitle>Can’t attach this file</AlertTitle>
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            ) : null}

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
      </div>

      <div
        inert={browsing}
        className={cn(
          'relative flex items-end gap-1 border-t py-2.5 pr-3 transition-opacity duration-150 inert:opacity-50',
          // The first glyph or letter on the chat's 12px gutter: the attach
          // button keeps 8px around its glyph, the bare field 4px.
          canAttach ? 'pl-1' : 'pl-2'
        )}
      >
        {suggestions.list ? (
          <HashtagSuggestions
            {...suggestions.list}
            onManage={onOpenTagSettings}
          />
        ) : null}
        {canAttach ? (
          <AttachButton disabled={busy} onPick={attachOrRefuse} />
        ) : null}
        <label htmlFor={noteId} className="sr-only">
          Note
        </label>
        <Textarea
          ref={noteRef}
          id={noteId}
          variant="bare"
          value={note}
          {...suggestions.fieldProps}
          onChange={(event) => {
            setNote(event.target.value);
            suggestions.sync(event.target);
          }}
          onKeyDown={onNoteKeyDown}
          onPaste={onNotePaste}
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

/** Opens the file picker; pasting or dropping a file does the same. */
function AttachButton({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    // As tall as the send button, so on a one-line note both glyphs share
    // the line's centre.
    <div className="flex h-9 shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              tone="muted"
              aria-label="Attach a file"
              disabled={disabled}
              onClick={() => input.current?.click()}
            />
          }
        >
          <HugeiconsIcon icon={Attachment01Icon} strokeWidth={1.8} />
        </TooltipTrigger>
        <TooltipContent>Attach a file</TooltipContent>
      </Tooltip>
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];

          // Cleared, so picking the same file again still counts.
          event.target.value = '';

          if (file) onPick(file);
        }}
      />
    </div>
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
      // 8px in from the header's 4px, the avatar on the chat's 12px gutter.
      <div className="group/name flex min-w-0 flex-1 items-center gap-2.5 px-2">
        <ChatAvatar
          name={destinationName(current)}
          seed={avatarSeed(current)}
          avatar={current.avatar}
        />
        <ChatName
          name={destinationName(current)}
          className="truncate text-sm font-medium"
        />
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
            avatar={current.avatar}
          />
          <SelectValue>
            {(id: string) => {
              const item = destinations.find((each) => each.id === id);

              return item ? (
                <ChatName name={destinationName(item)} className="truncate" />
              ) : null;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {destinations.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <ChatAvatar
                  name={destinationName(item)}
                  seed={avatarSeed(item)}
                  avatar={item.avatar}
                  size="sm"
                />
                <ChatName name={destinationName(item)} />
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
