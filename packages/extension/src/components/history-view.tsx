import {
  ArrowUpRight01Icon,
  Copy01Icon,
  Delete02Icon,
  RepeatIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useDeferredValue, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { announceDeletion } from '@/components/announce-deletion';
import { DeleteDialog } from '@/components/delete-dialog';
import { HistoryRow } from '@/components/history-row';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useQueued } from '@/hooks/use-queue';
import { useStore } from '@/hooks/use-store';
import { deleteMessages, telegramDeletion } from '@/lib/chat-actions';
import { draftFromEntry, requestSend } from '@/lib/client';
import { isHttpUrl } from '@/lib/compose';
import { formatDay, groupByDay, plural } from '@/lib/format';
import { sentText } from '@/lib/search';
import {
  type ContentKind,
  type Destination,
  type HistoryEntry,
  historyStore,
  settingsStore,
} from '@/lib/settings';

function removeEntry(entry: HistoryEntry) {
  void historyStore.update((history) =>
    history.filter((item) => item.id !== entry.id)
  );
  toast('Removed from history', {
    action: {
      label: 'Undo',
      onClick: () =>
        void historyStore.update((history) =>
          [...history, entry].toSorted((a, b) => b.sentAt - a.sentAt)
        ),
    },
  });
}

function RowAction({
  label,
  icon,
  onClick,
  href,
}: {
  label: string;
  icon: typeof Copy01Icon;
  onClick?: () => void;
  href?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          href ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={label}
              nativeButton={false}
              render={<a href={href} target="_blank" rel="noreferrer" />}
            />
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={label}
              onClick={onClick}
            />
          )
        }
      >
        <HugeiconsIcon icon={icon} strokeWidth={1.8} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** What opening a sent item's own address opens; anything else is its page. */
const openLabels: Partial<Record<ContentKind, string>> = {
  link: 'Open link',
  image: 'Open image',
  video: 'Open video',
  audio: 'Open audio',
};

/** Deletes in Telegram too, or removes it here with a way back. */
async function deleteEntry(entry: HistoryEntry, inTelegram: boolean) {
  if (!inTelegram) {
    removeEntry(entry);

    return;
  }

  const item = { direction: 'out', time: entry.sentAt, entry } as const;

  announceDeletion(await deleteMessages([item], { inTelegram }), 1);
}

function EntryActions({
  entry,
  waiting,
  destinations,
  now,
}: {
  entry: HistoryEntry;
  /** Failed, and waiting in the queue to be tried again. */
  waiting: boolean;
  destinations: Destination[];
  now: number;
}) {
  const [asking, setAsking] = useState(false);
  const deletable = telegramDeletion(entry, destinations, now).can;
  const draft = draftFromEntry(entry);
  const content = entry.content;
  const openUrl = [content?.url, content?.pageUrl].find(isHttpUrl);
  const copyText = content?.text ?? content?.url ?? content?.pageUrl;

  return (
    <div className="absolute inset-y-0 right-full mr-1 flex items-center gap-0.5 bg-background opacity-0 transition-opacity duration-100 group-focus-within/item:opacity-100 group-hover/item:opacity-100 before:absolute before:inset-y-0 before:right-full before:w-6 before:bg-linear-to-l before:from-background pointer-coarse:static pointer-coarse:opacity-100 pointer-coarse:before:hidden">
      {openUrl ? (
        <RowAction
          label={
            openUrl === content?.url
              ? (openLabels[entry.kind] ?? 'Open page')
              : 'Open page'
          }
          icon={ArrowUpRight01Icon}
          href={openUrl}
        />
      ) : null}
      {copyText ? (
        <RowAction
          label="Copy"
          icon={Copy01Icon}
          onClick={() => {
            void navigator.clipboard
              .writeText(copyText)
              .then(() => toast('Copied'));
          }}
        />
      ) : null}
      {draft ? (
        <RowAction
          label={waiting ? 'Send now' : 'Send again'}
          icon={RepeatIcon}
          onClick={async () => {
            const outcome = await requestSend(draft, {
              incognito: false,
              ...(entry.status === 'failed' && { retryOf: entry.id }),
            });

            if (outcome.ok) toast.success(`Sent to ${outcome.destination}`);
            else if (outcome.queued) toast(outcome.message);
            else toast.error(outcome.message);
          }}
        />
      ) : null}
      {/* One only this browser keeps goes at once, with Undo. */}
      <RowAction
        label={deletable ? 'Delete' : 'Remove from history'}
        icon={Delete02Icon}
        onClick={() => (deletable ? setAsking(true) : removeEntry(entry))}
      />
      {deletable ? (
        <DeleteDialog
          open={asking}
          onOpenChange={setAsking}
          count={1}
          deletable={1}
          partly={entry.status === 'failed'}
          onConfirm={(inTelegram) => deleteEntry(entry, inTelegram)}
        />
      ) : null}
    </div>
  );
}

export function HistoryView({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const searchId = useId();
  const history = useStore(historyStore);
  const settings = useStore(settingsStore);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [now] = useState(() => Date.now());
  const queuedFor = useQueued();

  const results = useMemo(
    () =>
      deferredQuery
        ? history.filter((entry) => sentText(entry).includes(deferredQuery))
        : history,
    [history, deferredQuery]
  );

  if (history.length === 0) {
    const off = settings.history.mode === 'off';

    return (
      <div className="py-16">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {off ? 'History is off' : 'Nothing sent yet'}
            </EmptyTitle>
            <EmptyDescription>
              {off
                ? 'Turn it on to keep a list of what you send.'
                : 'What you send shows up here.'}
            </EmptyDescription>
          </EmptyHeader>
          {off ? (
            <EmptyContent>
              <Button variant="outline" onClick={onOpenSettings}>
                Open history settings
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} />
          </InputGroupAddon>
          <InputGroupInput
            id={searchId}
            type="search"
            aria-label="Search history"
            placeholder="Search history"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('');
            }}
          />
        </InputGroup>
        <p
          className="text-sm text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {deferredQuery
            ? plural(results.length, { one: '# result', other: '# results' })
            : plural(history.length, { one: '# item', other: '# items' })}
        </p>
      </div>

      {results.length === 0 ? (
        <div className="py-8">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{`No results for “${query.trim()}”`}</EmptyTitle>
              <EmptyDescription>
                Search looks through text, links, notes and hashtags.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => setQuery('')}>
                Clear search
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        groupByDay(results, (entry) => entry.sentAt).map(([day, entries]) => (
          <section
            key={day}
            aria-labelledby={`day-${day}`}
            className="flex flex-col gap-1"
          >
            <h2
              id={`day-${day}`}
              className="sticky top-[var(--sticky-top,0px)] z-1 bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm"
            >
              {formatDay(day, now)}
            </h2>
            {entries.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                queued={queuedFor(entry.id)}
                now={now}
                actions={
                  <EntryActions
                    entry={entry}
                    waiting={queuedFor(entry.id) !== undefined}
                    destinations={settings.destinations}
                    now={now}
                  />
                }
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
