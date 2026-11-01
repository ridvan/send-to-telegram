import { Github01Icon, StarIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { Button } from '@/components/ui/button';
import { links } from '@/lib/links';
import { storeBrowsers } from '@/lib/store-look';
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
      <Button
        size="cta"
        variant="outline"
        render={<a href={links.edge} />}
        nativeButton={false}
      >
        <BrowserLogo src={storeBrowsers.edge.logo} />
        Add to {storeBrowsers.edge.name}
      </Button>
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
