import {
  Alert02Icon,
  Globe02Icon,
  Image02Icon,
  Link04Icon,
  MusicNote01Icon,
  TextIcon,
  Video01Icon,
} from '@hugeicons/core-free-icons';
import type { ComponentProps, ReactNode } from 'react';

import { IconTile, type TileTone } from '@/components/icon-tile';
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

const kindTiles = {
  selection: { icon: TextIcon, tone: 'orange' },
  link: { icon: Link04Icon, tone: 'violet' },
  image: { icon: Image02Icon, tone: 'green' },
  video: { icon: Video01Icon, tone: 'cyan' },
  audio: { icon: MusicNote01Icon, tone: 'pink' },
  page: { icon: Globe02Icon, tone: 'blue' },
} satisfies Record<ContentKind, { icon: typeof TextIcon; tone: TileTone }>;

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
    <Item size="xs">
      <ItemMedia>
        {failed ? (
          <IconTile icon={Alert02Icon} tone="red" />
        ) : (
          <IconTile {...kindTiles[entry.kind]} />
        )}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <span className="truncate">{entryTitle(entry)}</span>
        </ItemTitle>
        <ItemDescription className="truncate">
          {details.join(' · ')}
        </ItemDescription>
      </ItemContent>
      {/* Actions show over the end of the title on hover, so they don't
          take its room the rest of the time. */}
      <ItemActions className="relative self-stretch">
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
