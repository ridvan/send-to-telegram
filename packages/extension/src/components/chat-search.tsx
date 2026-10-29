import { ArrowLeft01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useDeferredValue, useMemo, useState } from 'react';

import { ChatHistory } from '@/components/chat-history';
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
import { useChatItems } from '@/hooks/use-chat-items';
import { plural } from '@/lib/format';
import { receivedText, sentText } from '@/lib/search';
import type { Settings } from '@/lib/settings';

/**
 * Searches this chat, both ways, as Telegram searches inside a chat: the
 * chat shows in full until you type, then only what matches.
 */
export function ChatSearch({
  settings,
  destinationId,
  botToken,
  onClose,
  onShow,
}: {
  settings: Settings;
  destinationId: string | undefined;
  botToken: string | undefined;
  onClose: () => void;
  /** Closes search and scrolls the chat to the message picked. */
  onShow: (key: string) => void;
}) {
  const [query, setQuery] = useState('');
  const term = useDeferredValue(query.trim().toLocaleLowerCase());
  const items = useChatItems(settings, destinationId);
  const [now] = useState(() => Date.now());

  const matches = useMemo(
    () =>
      term
        ? items.filter((item) =>
            (item.direction === 'out'
              ? sentText(item.entry)
              : receivedText(item.message)
            ).includes(term)
          )
        : items,
    [items, term]
  );

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close search"
          onClick={onClose}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
        </Button>
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search this chat"
            placeholder="Search this chat"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;

              // Escape clears first, then closes, and never closes the popup.
              event.preventDefault();

              if (query) setQuery('');
              else onClose();
            }}
          />
        </InputGroup>
      </header>

      <p aria-live="polite" className="sr-only">
        {term
          ? plural(matches.length, { one: '# message', other: '# messages' })
          : ''}
      </p>

      {term && matches.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center bg-chat p-3">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{`No messages match “${query.trim()}”`}</EmptyTitle>
              <EmptyDescription>
                Search looks through text, links, notes, hashtags and file
                names.
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
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-chat p-3">
          <div className="flex flex-col gap-3">
            <ChatHistory
              key={term}
              items={matches}
              delivery={settings.delivery}
              botToken={botToken}
              now={now}
              draftBelow={false}
              onPick={onShow}
            />
            {term ? (
              <p className="self-center rounded-full bg-service px-2.5 py-0.5 text-xs font-medium text-service-foreground tabular-nums">
                {plural(matches.length, {
                  one: '# message',
                  other: '# messages',
                })}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
