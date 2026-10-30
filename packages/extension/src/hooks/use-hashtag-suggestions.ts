import {
  type KeyboardEvent,
  type RefObject,
  type TextareaHTMLAttributes,
  useId,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import { hashtagAtCaret, insertHashtag, matchHashtags } from '@/lib/hashtags';

/**
 * Offers saved hashtags while one is typed in `textarea`, as Telegram does.
 * The note stays plain text: a picked tag is written into it.
 */
export function useHashtagSuggestions({
  tags,
  value,
  onValueChange,
  textarea,
  disabled,
}: {
  tags: string[];
  value: string;
  onValueChange: (value: string) => void;
  textarea: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
}) {
  const listId = useId();
  // Left unset while the field is blurred or has a range selected.
  const [caret, setCaret] = useState<number>();
  const [highlight, setHighlight] = useState({ query: '', index: 0 });
  // The `#` that Escape closed the list for, until the caret leaves that word.
  const [dismissed, setDismissed] = useState<number>();

  const found =
    caret === undefined || disabled ? undefined : hashtagAtCaret(value, caret);

  const matches = found ? matchHashtags(tags, found.query) : [];

  const shown =
    found !== undefined && matches.length > 0 && dismissed !== found.start;

  // A new letter starts the highlight over at the first match.
  const active =
    found && highlight.query === found.query
      ? Math.min(highlight.index, matches.length - 1)
      : 0;

  function sync(field: HTMLTextAreaElement) {
    const { selectionStart, selectionEnd } = field;
    const next = selectionStart === selectionEnd ? selectionStart : undefined;

    setCaret(next);

    if (next === undefined || !hashtagAtCaret(field.value, next)) {
      setDismissed(undefined);
    }
  }

  function pick(tag: string) {
    if (!found) return;

    const next = insertHashtag(value, found, tag);

    // Committed first, so the caret lands in the new text.
    flushSync(() => onValueChange(next.text));
    textarea.current?.setSelectionRange(next.caret, next.caret);
    setCaret(next.caret);
  }

  function move(by: number) {
    if (!found) return;

    const index = (active + by + matches.length) % matches.length;

    setHighlight({ query: found.query, index });
  }

  /** Handles a key the list uses and says so, so the field doesn't act on it too. */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!shown || event.nativeEvent.isComposing) return false;

    const tag = matches[active];

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (
      (event.key === 'Enter' || event.key === 'Tab') &&
      !event.shiftKey &&
      tag
    ) {
      pick(tag);
    } else if (event.key === 'Escape') {
      setDismissed(found.start);
    } else {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    return true;
  }

  const optionId = (index: number) => `${listId}-${index}`;

  const fieldProps: TextareaHTMLAttributes<HTMLTextAreaElement> = {
    onSelect: (event) => sync(event.currentTarget),
    onFocus: (event) => sync(event.currentTarget),
    onBlur: () => setCaret(undefined),
    'aria-autocomplete': shown ? 'list' : undefined,
    'aria-controls': shown ? listId : undefined,
    'aria-activedescendant': shown ? optionId(active) : undefined,
  };

  return {
    list: shown
      ? {
          id: listId,
          matches,
          active,
          optionId,
          onPick: pick,
          onHighlight: (index: number) =>
            setHighlight({ query: found.query, index }),
        }
      : undefined,
    onKeyDown,
    sync,
    fieldProps,
  };
}
