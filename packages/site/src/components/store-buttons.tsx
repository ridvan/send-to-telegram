import { Github01Icon, StarIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { Button } from '@/components/ui/button';
import { links } from '@/lib/links';
import { storeBrowsers, type StoreBrowser } from '@/lib/store-look';
import { cn } from '@/lib/utils';

/** A browser's own logo, drawn at the size of the button's icons. */
export function BrowserLogo({
  src,
  small = false,
}: {
  src: string;
  small?: boolean;
}) {
  return (
    <img
      src={src}
      alt=""
      width={20}
      height={20}
      draggable={false}
      data-icon="inline-start"
      className={cn('shrink-0 select-none', small ? 'size-4' : 'size-5')}
    />
  );
}

/**
 * The other stores, named without “Add to”: the Chrome button before them
 * already says what they do, and the row keeps to one line.
 */
const otherStores: readonly StoreBrowser[] = ['edge', 'firefox'];

/** Where to get the extension, in the order most people need it, then a star. */
export function StoreButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="cta"
        render={<a href={links.chrome} />}
        nativeButton={false}
      >
        <BrowserLogo src={storeBrowsers.chrome.logo} />
        Add to {storeBrowsers.chrome.name}
      </Button>
      {otherStores.map((browser) => (
        <Button
          key={browser}
          size="cta"
          variant="outline"
          render={
            <a
              href={links[browser]}
              aria-label={`Add to ${storeBrowsers[browser].name}`}
            />
          }
          nativeButton={false}
        >
          <BrowserLogo src={storeBrowsers[browser].logo} />
          {storeBrowsers[browser].name}
        </Button>
      ))}
      <Button
        size="cta"
        variant="ghost"
        render={<a href={links.repository} />}
        nativeButton={false}
      >
        <HugeiconsIcon
          icon={Github01Icon}
          strokeWidth={1.8}
          data-icon="inline-start"
        />
        Star on GitHub
        <HugeiconsIcon
          icon={StarIcon}
          strokeWidth={1.8}
          aria-hidden
          className="star-on-hover"
        />
      </Button>
    </div>
  );
}
