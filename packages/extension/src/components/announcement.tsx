import { Camera01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type ReactNode, useId } from 'react';

import { useShortcuts } from '@/components/shortcuts';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useStore } from '@/hooks/use-store';
import {
  type AnnouncementId,
  markAnnouncementSeen,
  nextAnnouncement,
} from '@/lib/announcements';
import { announcementsStore } from '@/lib/settings';

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

/**
 * The newest feature this person hasn't seen yet, if any. `onDismiss` runs
 * once the card is gone, to put focus somewhere useful.
 */
export function Announcement({
  actions,
  onDismiss,
}: {
  actions: AnnouncementActions;
  onDismiss: () => void;
}) {
  const { seen } = useStore(announcementsStore);
  const id = nextAnnouncement(seen);

  if (!id) return null;

  function dismiss(seenId: AnnouncementId) {
    void markAnnouncementSeen(seenId);
    onDismiss();
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
