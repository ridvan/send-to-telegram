import {
  Camera01Icon,
  Cancel01Icon,
  GithubIcon,
  StarIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type ReactNode, useId, useState } from 'react';

import { useShortcuts } from '@/components/shortcuts';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useLock } from '@/hooks/use-lock';
import { useStore } from '@/hooks/use-store';
import {
  type AnnouncementId,
  type CardId,
  markAnnouncementSeen,
  nextAnnouncement,
  showsStarCard,
  STAR_CARD,
} from '@/lib/announcements';
import { openRepository } from '@/lib/client';
import { plural } from '@/lib/format';
import { announcementsStore, statsStore } from '@/lib/settings';

/** What each card offers to do; absent where the popup can't do it here. */
export type AnnouncementActions = Partial<Record<AnnouncementId, () => void>>;

/**
 * A new feature, told in the chat as Telegram tells you about its own: a
 * note from the chat itself, with a way to try it and one to dismiss it.
 */
function Card({
  icon,
  title,
  children,
  action,
  onDismiss,
}: {
  icon: typeof Camera01Icon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss: () => void;
}) {
  const titleId = useId();

  return (
    <aside
      aria-labelledby={titleId}
      className="relative flex max-w-64 animate-rise flex-col items-center gap-1 self-center rounded-2xl bg-service px-6 py-3 text-center text-xs text-service-foreground backdrop-blur-sm"
    >
      <div className="absolute top-1.5 right-1.5">
        <Button
          variant="ghost"
          size="icon-xs"
          tone="muted"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
      <HugeiconsIcon
        icon={icon}
        strokeWidth={1.8}
        aria-hidden
        className="mb-0.5 size-5"
      />
      <p id={titleId} className="font-semibold">
        {title}
      </p>
      {children}
      {action ? <div className="mt-1.5">{action}</div> : null}
    </aside>
  );
}

/** Its shortcut as the browser has it set, or nothing if it has none. */
function ShortcutKeys({ name, label }: { name: string; label: string }) {
  const keys = useShortcuts().find((shortcut) => shortcut.name === name)?.keys;

  if (!keys) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <Kbd>{keys}</Kbd>
      {label}
    </span>
  );
}

function Screenshots({
  onTry,
  onDismiss,
}: {
  onTry: (() => void) | undefined;
  onDismiss: () => void;
}) {
  return (
    <Card
      icon={Camera01Icon}
      title="New: screenshots"
      onDismiss={onDismiss}
      action={
        onTry ? (
          <Button variant="outline" size="xs" onClick={onTry}>
            Take a screenshot
          </Button>
        ) : undefined
      }
    >
      <p className="text-pretty">
        Send what the page shows, or drag out part of it. Both are under the
        paperclip and in the page’s menu.
      </p>
      <p className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
        <ShortcutKeys name="send-screenshot" label="Page" />
        <ShortcutKeys name="send-area-screenshot" label="Area" />
      </p>
    </Card>
  );
}

function Star({
  sent,
  onStar,
  onDismiss,
}: {
  sent: number;
  onStar: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card
      icon={GithubIcon}
      title={plural(sent, { one: '# message sent', other: '# messages sent' })}
      onDismiss={onDismiss}
      action={
        <Button variant="outline" size="xs" onClick={onStar}>
          {/* Not marked as a leading icon, which would pull it to the edge. */}
          <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
          Star on GitHub
        </Button>
      }
    >
      <p className="text-pretty">
        Send to Telegram is open source.
        <br />A star helps others find it.
      </p>
    </Card>
  );
}

/**
 * The newest feature this person hasn't seen yet, if any, else the star
 * card once. `onDismiss` runs once the card is gone, to put focus somewhere
 * useful.
 */
export function Announcement({
  actions,
  incognito,
  onDismiss,
}: {
  actions: AnnouncementActions;
  incognito: boolean;
  onDismiss: () => void;
}) {
  const { seen } = useStore(announcementsStore);
  const { sent } = useStore(statsStore);
  const locked = useLock().state === 'locked';
  const id = nextAnnouncement(seen);

  // Decided as the popup opens, so the card doesn't rise under the 100th
  // send or take a dismissed feature's place at once.
  const [star] = useState(() =>
    showsStarCard({ seen, sent, incognito, locked }) ? { sent } : undefined
  );

  function dismiss(seenId: CardId) {
    void markAnnouncementSeen(seenId);
    onDismiss();
  }

  if (!id) {
    if (!star || seen.includes(STAR_CARD)) return null;

    return (
      <Star
        sent={star.sent}
        onDismiss={() => dismiss(STAR_CARD)}
        onStar={() =>
          // Saved first: the popup may close as the tab opens.
          void markAnnouncementSeen(STAR_CARD)
            .catch((cause: unknown) => {
              console.error('Could not save the star card as seen', cause);
            })
            .then(async () => {
              await openRepository();
              // In case the popup stays open.
              onDismiss();
            })
        }
      />
    );
  }

  switch (id) {
    case 'screenshots':
      return (
        <Screenshots
          onTry={actions.screenshots}
          onDismiss={() => dismiss(id)}
        />
      );
  }
}
