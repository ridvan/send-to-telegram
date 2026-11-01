import {
  HeadContent,
  Scripts,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';

/** Pages drawn as pictures, such as the social card, with nothing around them. */
const bare = new Set(['/og']);

export function Document({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });

  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {bare.has(path) || path.startsWith('/store/') ? (
          children
        ) : (
          <div className="flex min-h-svh flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        )}
        <Scripts />
      </body>
    </html>
  );
}

export function NotFound() {
  return (
    <section className="page flex flex-col items-start gap-4 py-32">
      <h1 className="font-heading text-3xl tracking-tight">
        There’s no page here
      </h1>
      <p className="text-muted-foreground">
        The link may be old. Start from the home page.
      </p>
      <Button variant="outline" render={<a href="/" />} nativeButton={false}>
        Go to the home page
      </Button>
    </section>
  );
}

export function Failed({ reset }: ErrorComponentProps) {
  return (
    <section className="page flex flex-col items-start gap-4 py-32">
      <h1 className="font-heading text-3xl tracking-tight">
        This page didn’t load
      </h1>
      <p className="text-muted-foreground">
        Try again, and if it keeps happening, reload the page.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
