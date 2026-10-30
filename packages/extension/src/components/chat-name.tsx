import { useStore } from '@/hooks/use-store';
import { settingsStore } from '@/lib/settings';
import { cn } from '@/lib/utils';

/**
 * A chat's name, blurred when the person asks so it doesn't show on a shared
 * screen. Hovering it, or a `group/name` around it, reveals it; the delay keeps
 * a passing cursor from flashing it, and keyboard focus reveals it at once.
 */
export function ChatName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const shown = useStore(settingsStore).appearance.showChatNames;

  return (
    <span
      className={cn(
        'transition duration-200 ease-out motion-reduce:transition-none',
        !shown &&
          'blur-xs select-none hover:blur-none hover:delay-300 group-hover/name:blur-none group-hover/name:delay-300 group-focus-visible/name:blur-none group-focus-visible/name:delay-0',
        className
      )}
    >
      {name}
    </span>
  );
}
