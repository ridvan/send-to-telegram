import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatCount, plural } from '@/lib/format';

/**
 * The header while selecting messages, in place of the chat's name like
 * search: a way out, how many are selected, and Delete, which asks first.
 */
export function SelectionBar({
  count,
  onCancel,
  onDelete,
}: {
  count: number;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cancel selection"
        autoFocus
        onClick={onCancel}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
      </Button>
      <h1
        aria-live="polite"
        className="flex-1 px-1 text-sm font-semibold tabular-nums"
      >
        {`${formatCount(count)} selected`}
      </h1>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="destructive" size="sm" disabled={count === 0} />
          }
        >
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {plural(count, {
                one: 'Delete # message?',
                other: 'Delete # messages?',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              They’re removed from this browser only. Messages in Telegram stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              {count === 1 ? 'Delete message' : 'Delete messages'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
