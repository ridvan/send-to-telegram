import { ArrowLeft01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

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
import { plural } from '@/lib/format';

/**
 * The search field, in the header in place of the chat's name, as tall as the
 * header's buttons. Escape clears it first, then closes search.
 */
export function ChatSearchField({
  query,
  onQueryChange,
  onClose,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}) {
  return (
    <>
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
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;

            // Never closes the popup.
            event.preventDefault();

            if (query) onQueryChange('');
            else onClose();
          }}
        />
      </InputGroup>
    </>
  );
}

/** How many messages match, under the results as Telegram counts them. */
export function MatchCount({ count }: { count: number }) {
  return (
    <p className="self-center rounded-full bg-service px-2.5 py-0.5 text-xs font-medium text-service-foreground tabular-nums">
      {plural(count, { one: '# message', other: '# messages' })}
    </p>
  );
}

export function NoMatches({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{`No messages match “${query.trim()}”`}</EmptyTitle>
        <EmptyDescription>
          Search looks through text, links, notes, hashtags and file names.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onClear}>
          Clear search
        </Button>
      </EmptyContent>
    </Empty>
  );
}
