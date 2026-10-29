import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useId, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { MAX_TAGS, TAG_PATTERN } from '@/lib/settings';
import { cn } from '@/lib/utils';

function move(list: string[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);

  if (item !== undefined) next.splice(to, 0, item);

  return next;
}

/**
 * Hashtags as chips: type to add, drag or press Alt with an arrow key to
 * reorder, Delete or the × button to remove. Order matches the menus.
 */
export function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [dragged, setDragged] = useState<number>();
  const full = tags.length >= MAX_TAGS;

  function add() {
    const tag = draft.trim().replace(/^#+/, '').toLowerCase();

    if (!tag) return;

    if (!TAG_PATTERN.test(tag)) {
      setError(
        'Use letters, numbers and underscores. Telegram ends a hashtag at any other character.'
      );

      return;
    }

    if (tags.includes(tag)) {
      setError(`#${tag} is already in the list.`);

      return;
    }

    onChange([...tags, tag]);
    setDraft('');
    setError(undefined);
  }

  function onChipKey(event: KeyboardEvent, index: number) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onChange(tags.filter((_, position) => position !== index));

      return;
    }

    if (!event.altKey) return;

    const target =
      event.key === 'ArrowLeft'
        ? index - 1
        : event.key === 'ArrowRight'
          ? index + 1
          : -1;

    if (target < 0 || target >= tags.length) return;

    event.preventDefault();
    onChange(move(tags, index, target));

    // Keep focus on the chip that moved.
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-tag-index="${target}"]`)
        ?.focus();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {tags.length > 0 ? (
        <ul
          aria-label="Hashtags"
          aria-describedby={hintId}
          className="flex flex-wrap gap-1.5"
        >
          {tags.map((tag, index) => (
            <li
              key={tag}
              data-tag-index={index}
              tabIndex={0}
              draggable
              onDragStart={() => setDragged(index)}
              onDragEnd={() => setDragged(undefined)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragged !== undefined && dragged !== index) {
                  onChange(move(tags, dragged, index));
                }
              }}
              onKeyDown={(event) => onChipKey(event, index)}
              className={cn(
                'flex h-7 cursor-grab items-center gap-0.5 rounded-md border bg-background pr-0.5 pl-2 text-sm outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing',
                dragged === index && 'opacity-50'
              )}
            >
              <span className="text-muted-foreground">#</span>
              {tag}
              <Button
                variant="ghost"
                size="icon-xs"
                tabIndex={-1}
                aria-label={`Remove #${tag}`}
                onClick={() => onChange(tags.filter((item) => item !== tag))}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p id={hintId} className="sr-only">
        Press Alt with the left or right arrow to move a hashtag, and Delete to
        remove it.
      </p>

      <Field data-invalid={error !== undefined}>
        <FieldLabel htmlFor={inputId} className="sr-only">
          New hashtag
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon>#</InputGroupAddon>
          <InputGroupInput
            id={inputId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                add();
              }
            }}
            placeholder="read_later"
            disabled={full}
            maxLength={33}
            aria-invalid={error !== undefined}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={add} disabled={full || !draft.trim()}>
              Add
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>
            {full
              ? `That’s the limit of ${MAX_TAGS}. Remove one to add another.`
              : 'Drag to reorder. The order is the same in the menus.'}
          </FieldDescription>
        )}
      </Field>
    </div>
  );
}
