import { Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col gap-6">{children}</ol>;
}

/** A numbered instruction; `done` swaps the number for a check. */
export function Step({
  index,
  title,
  description,
  active = true,
  done = false,
  children,
}: {
  index: number;
  title: ReactNode;
  description?: ReactNode;
  active?: boolean;
  done?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-x-3 gap-y-3">
      <span
        aria-hidden
        className={cn(
          'flex size-6 items-center justify-center rounded-full border text-xs font-medium tabular-nums transition-colors duration-200',
          done && 'border-transparent bg-primary text-primary-foreground',
          !done && active && 'border-foreground/30 text-foreground',
          !done && !active && 'text-muted-foreground'
        )}
      >
        {done ? (
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2.5}
            className="size-3.5"
          />
        ) : (
          index
        )}
      </span>
      <div className="flex flex-col gap-1 pt-0.5">
        <p
          className={cn(
            'text-sm font-medium',
            !active && !done && 'text-muted-foreground'
          )}
        >
          {title}
        </p>
        {description ? (
          <div className="text-sm text-pretty text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {children ? <div className="col-start-2 min-w-0">{children}</div> : null}
    </li>
  );
}
