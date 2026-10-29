import {
  Alert02Icon,
  Globe02Icon,
  Image02Icon,
  Link04Icon,
  TextIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ComponentProps, ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import {
  entryTitle,
  formatAgo,
  formatFullDate,
  hostname,
  kindLabel,
} from '@/lib/format';
import type { ContentKind, HistoryEntry } from '@/lib/settings';

const kindIcons = {
  selection: TextIcon,
  link: Link04Icon,
  image: Image02Icon,
  page: Globe02Icon,
} satisfies Record<ContentKind, typeof TextIcon>;

/** A relative time; the tooltip that wraps it shows the full date. */
function Timestamp({
  time,
  now,
  ...props
}: ComponentProps<'time'> & { time: number; now: number }) {
  return (
    <time
      {...props}
      dateTime={new Date(time).toISOString()}
      className="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
    >
      {formatAgo(time, now)}
    </time>
  );
}

/** One sent item: what it was, where it went and when. */
export function HistoryRow({
  entry,
  now,
  actions,
}: {
  entry: HistoryEntry;
  now: number;
  actions?: ReactNode;
}) {
  const failed = entry.status === 'failed';
  const source = hostname(entry.content?.pageUrl);

  const details = [
    failed ? 'Not sent' : kindLabel[entry.kind],
    entry.destinationName,
    entry.tag && `#${entry.tag}`,
    entry.kind !== 'page' && source,
  ].filter(Boolean);

  return (
    <Item size="xs" variant={failed ? 'failed' : 'default'}>
      <ItemMedia variant="tile">
        <HugeiconsIcon
          icon={failed ? Alert02Icon : kindIcons[entry.kind]}
          strokeWidth={1.8}
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <span className="truncate">{entryTitle(entry)}</span>
        </ItemTitle>
        <ItemDescription className="truncate">
          {details.join(' · ')}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {actions}
        <Tooltip>
          <TooltipTrigger
            render={<Timestamp time={entry.sentAt} now={now} />}
          />
          <TooltipContent>
            {failed && entry.error ? entry.error : formatFullDate(entry.sentAt)}
          </TooltipContent>
        </Tooltip>
      </ItemActions>
    </Item>
  );
}
