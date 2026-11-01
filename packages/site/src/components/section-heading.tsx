import type { ReactNode } from 'react';

/** A section's title and the sentence or two that sets it up. */
export function SectionHeading({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <h2 id={id} className="font-heading text-3xl tracking-tight sm:text-4xl">
        {title}
      </h2>
      {children ? (
        <p className="text-lg text-muted-foreground">{children}</p>
      ) : null}
    </div>
  );
}
