import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';

import { DeleteDialog } from '@/components/delete-dialog';
import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/format';

/**
 * The header while selecting messages, in place of the chat's name like
 * search: a way out, how many are selected, and Delete, which asks first.
 */
export function SelectionBar({
  count,
  deletable,
  onCancel,
  onDelete,
}: {
  count: number;
  /** How many of them Telegram would delete too. */
  deletable: number;
  onCancel: () => void;
  onDelete: (inTelegram: boolean) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);

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
      <Button
        variant="destructive"
        size="sm"
        disabled={count === 0}
        onClick={() => setAsking(true)}
      >
        Delete
      </Button>
      <DeleteDialog
        open={asking}
        onOpenChange={setAsking}
        count={count}
        deletable={deletable}
        onConfirm={onDelete}
      />
    </>
  );
}
