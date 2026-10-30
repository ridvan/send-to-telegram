import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Saved hashtags matching the one being typed, above the field like
 * Telegram's. Focus stays in the field, which drives the highlight, so a
 * press here mustn't take focus away from it.
 */
export function HashtagSuggestions({
  id,
  matches,
  active,
  optionId,
  onPick,
  onHighlight,
  onManage,
}: {
  id: string;
  matches: string[];
  active: number;
  optionId: (index: number) => string;
  onPick: (tag: string) => void;
  onHighlight: (index: number) => void;
  onManage: () => void;
}) {
  const activeId = optionId(active);

  useEffect(() => {
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  return (
    <div
      className="absolute inset-x-2 bottom-full z-20 mb-1 flex animate-in flex-col rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 fade-in-0 slide-in-from-bottom-2"
      onMouseDown={(event) => event.preventDefault()}
    >
      <ul
        id={id}
        role="listbox"
        aria-label="Hashtags"
        className="flex max-h-44 flex-col overflow-y-auto"
      >
        {matches.map((tag, index) => (
          <li
            key={tag}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            onMouseMove={() => onHighlight(index)}
            onClick={() => onPick(tag)}
            className="cursor-default truncate rounded-md px-2 py-1.5 select-none aria-selected:bg-accent aria-selected:text-accent-foreground"
          >
            <span className="text-muted-foreground">#</span>
            {tag}
          </li>
        ))}
      </ul>
      <p className="mt-1 border-t px-2 pt-1.5 pb-1 text-xs">
        <Button variant="link" size="text" tone="muted" onClick={onManage}>
          Edit hashtags
        </Button>
      </p>
    </div>
  );
}
