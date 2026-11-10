import { Link, useRouterState } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

import { AppMark } from '@/components/app-mark';
import { BrowserLogo } from '@/components/store-buttons';
import { Button } from '@/components/ui/button';
import { links } from '@/lib/links';
import { storeBrowsers, type StoreBrowser } from '@/lib/store-look';

// Router links, so a #section link scrolls there instead of being reset to
// the top by the router's own scroll handling.
const sections = [
  { to: '/', hash: 'features', label: 'Features' },
  { to: '/faq', label: 'FAQ' },
  { to: '/privacy', label: 'Privacy' },
] as const;

export function SiteHeader() {
  const path = useRouterState({ select: (state) => state.location.pathname });

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
      <div className="page relative flex h-14 items-center gap-4">
        <a
          href="/"
          className="flex items-center gap-2.5 text-sm font-semibold tracking-tight"
        >
          <AppMark size="sm" />
          <span className="sr-only sm:not-sr-only">Send to Telegram</span>
        </a>
        <nav
          aria-label="Pages"
          className="ml-auto md:absolute md:left-1/2 md:ml-0 md:-translate-x-1/2"
        >
          <ul className="flex items-center gap-1">
            {sections.map((section) => (
              <li key={section.label}>
                <Button
                  variant="ghost"
                  size="sm"
                  tone="muted"
                  aria-current={
                    !('hash' in section) && section.to === path
                      ? 'page'
                      : undefined
                  }
                  render={
                    'hash' in section ? (
                      <Link
                        to={section.to}
                        hash={section.hash}
                        resetScroll={false}
                        // Already there, the router sees no change; scroll anyway.
                        onClick={() =>
                          document
                            .getElementById(section.hash)
                            ?.scrollIntoView()
                        }
                      />
                    ) : (
                      <Link to={section.to} />
                    )
                  }
                  nativeButton={false}
                >
                  {section.label}
                </Button>
              </li>
            ))}
          </ul>
        </nav>
        <HeaderInstall />
      </div>
    </header>
  );
}

/**
 * The install button, for the browser in use. Phones can't install it, so
 * it's left out there.
 */
function HeaderInstall() {
  const browser = useSyncExternalStore<StoreBrowser>(
    ignore,
    currentBrowser,
    () => 'chrome'
  );

  const { name, logo } = storeBrowsers[browser];

  return (
    <div className="ml-auto hidden md:block">
      <Button
        size="sm"
        render={<a href={links[browser]} />}
        nativeButton={false}
      >
        <BrowserLogo src={logo} small />
        Add to {name}
      </Button>
    </div>
  );
}

const ignore = () => () => {};

/** Edge and Firefox get their own store; every other browser gets Chrome's. */
function currentBrowser(): StoreBrowser {
  const agent = navigator.userAgent;

  if (agent.includes('Edg/')) return 'edge';

  if (agent.includes('Firefox/')) return 'firefox';

  return 'chrome';
}
