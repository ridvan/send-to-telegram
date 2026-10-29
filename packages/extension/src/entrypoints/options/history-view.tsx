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
import { useStore } from '@/hooks/use-store';
import { draftFromEntry, requestSend } from '@/lib/client';
import { isHttpUrl } from '@/lib/compose';
import { dayKey, entryTitle, formatDay, plural } from '@/lib/format';
import { type HistoryEntry, historyStore, settingsStore } from '@/lib/settings';

function searchableText(entry: HistoryEntry) {
  const content = entry.content;

  return [
    entryTitle(entry),
    content?.text,
    content?.note,
    content?.url,
    content?.pageUrl,
    content?.pageTitle,
    entry.tag && `#${entry.tag}`,
    entry.destinationName,
  ]
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase();
}

function groupByDay(entries: HistoryEntry[]) {
  const groups = new Map<number, HistoryEntry[]>();

  for (const entry of entries) {
    const key = dayKey(entry.sentAt);
    const group = groups.get(key);

    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  return [...groups];
}

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

function EntryActions({ entry }: { entry: HistoryEntry }) {
  const draft = draftFromEntry(entry);
  const content = entry.content;
  const openUrl = [content?.url, content?.pageUrl].find(isHttpUrl);
  const copyText = content?.text ?? content?.url ?? content?.pageUrl;

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover/item:opacity-100 group-focus-within/item:opacity-100 pointer-coarse:opacity-100">
      {openUrl ? (
        <RowAction
          label={
            entry.kind === 'link'
              ? 'Open link'
              : entry.kind === 'image'
                ? 'Open image'
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
          label="Send again"
          icon={RepeatIcon}
          onClick={async () => {
            const outcome = await requestSend(draft, {
              incognito: false,
              ...(entry.status === 'failed' && { retryOf: entry.id }),
            });

            if (outcome.ok) toast.success(`Sent to ${outcome.destination}`);
            else toast.error(outcome.message);
          }}
        />
      ) : null}
      <RowAction
        label="Remove from history"
        icon={Delete02Icon}
        onClick={() => removeEntry(entry)}
      />
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

  const results = useMemo(
    () =>
      deferredQuery
        ? history.filter((entry) =>
            searchableText(entry).includes(deferredQuery)
          )
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
                ? 'Turn it on to keep a list of what you send from this browser.'
                : 'Right-click text, a link, an image or the page, then choose Send to Telegram. It shows up here.'}
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
        groupByDay(results).map(([day, entries]) => (
          <section
            key={day}
            aria-labelledby={`day-${day}`}
            className="flex flex-col gap-1"
          >
            <h2
              id={`day-${day}`}
              className="sticky top-14 z-1 bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm"
            >
              {formatDay(day, now)}
            </h2>
            {entries.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                now={now}
                actions={<EntryActions entry={entry} />}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
