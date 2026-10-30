import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useStore } from '@/hooks/use-store';
import { settingsStore } from '@/lib/settings';
import { cn } from '@/lib/utils';

function useChatNamesShown() {
  return useStore(settingsStore).appearance.showChatNames;
}

/**
 * A chat's name, blurred until revealed so it doesn't show on a shared screen.
 * The choice is remembered and applies on every page.
 */
export function ChatName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const shown = useChatNamesShown();

  return (
    <span
      className={cn(
        'transition duration-200 ease-out motion-reduce:transition-none',
        !shown && 'blur-xs select-none',
        className
      )}
    >
      {name}
    </span>
  );
}

/** Shows or blurs chat names everywhere `ChatName` is used. */
export function ChatNameToggle({
  size = 'icon',
}: {
  size?: 'icon' | 'icon-xs';
}) {
  const shown = useChatNamesShown();
  const label = shown ? 'Hide chat name' : 'Show chat name';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            tone="muted"
            aria-label={label}
            onClick={() =>
              void settingsStore.update((settings) => ({
                ...settings,
                appearance: { ...settings.appearance, showChatNames: !shown },
              }))
            }
          />
        }
      >
        <HugeiconsIcon
          icon={shown ? ViewOffSlashIcon : ViewIcon}
          strokeWidth={1.8}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
