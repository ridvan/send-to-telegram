import { useId, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { plural } from '@/lib/format';

function describe(
  count: number,
  deletable: number,
  inTelegram: boolean,
  partly: boolean
) {
  if (partly && count === 1) {
    return inTelegram && deletable > 0
      ? 'It’s removed here, and the parts that went are deleted for everyone in the chat.'
      : 'It’s removed from this browser only. The parts that went stay in Telegram.';
  }

  if (!inTelegram || deletable === 0) {
    return count === 1
      ? 'It’s removed from this browser only. The message stays in Telegram.'
      : 'They’re removed from this browser only. Messages in Telegram stay.';
  }

  if (deletable < count) {
    return 'The ones Telegram still allows are deleted for everyone in the chat. The rest are removed from this browser only.';
  }

  return count === 1
    ? 'It’s deleted here and for everyone in the chat.'
    : 'They’re deleted here and for everyone in the chat.';
}

/**
 * Asks before deleting, with Telegram's own choice to delete for everyone
 * when the bot still can. `deletable` counts the messages it can.
 */
export function DeleteDialog({
  open,
  onOpenChange,
  count,
  deletable,
  partly = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  deletable: number;
  /** One long text that failed after some of its parts went. */
  partly?: boolean;
  /** Resolves once done; the dialog waits for it, then closes. */
  onConfirm: (inTelegram: boolean) => Promise<void>;
}) {
  const id = useId();
  const [inTelegram, setInTelegram] = useState(true);
  const [busy, setBusy] = useState(false);

  // Each time it opens, ticked as Telegram's own dialog is, whatever the
  // last message chose.
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) setInTelegram(true);
  }

  async function confirm() {
    if (busy) return;

    setBusy(true);

    try {
      await onConfirm(inTelegram && deletable > 0);
    } finally {
      setBusy(false);
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count === 1
              ? 'Delete message?'
              : plural(count, {
                  one: 'Delete # message?',
                  other: 'Delete # messages?',
                })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {describe(count, deletable, inTelegram, partly)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deletable > 0 ? (
          <Field orientation="horizontal">
            <Checkbox
              id={id}
              checked={inTelegram}
              onCheckedChange={setInTelegram}
            />
            <FieldLabel htmlFor={id}>Also delete in Telegram</FieldLabel>
          </Field>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? <Spinner /> : null}
            {count === 1 ? 'Delete message' : 'Delete messages'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
