import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/** A link inside a sentence, opening in a new tab. */
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="inline"
      size="text"
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noreferrer" />}
    >
      {children}
    </Button>
  );
}
