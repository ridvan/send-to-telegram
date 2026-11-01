import { Fragment } from 'react';

import { AppMark } from '@/components/app-mark';
import { HeroArt } from '@/components/hero-art';
import { BrowserLogo } from '@/components/store-buttons';
import { storeBrowsers, type StoreBrowser } from '@/lib/store-look';
import { cn } from '@/lib/utils';

/** How each picture spaces the card for its size. */
const layouts = {
  og: { row: 'gap-10 px-18', text: 'gap-8', art: 'w-120' },
  screenshot: { row: 'gap-12 px-20', text: 'gap-8', art: 'w-128' },
  marquee: { row: 'gap-16 px-24', text: 'gap-7', art: 'w-120' },
};

/**
 * The name, the headline and the browsers it's for, beside the hero's art:
 * the social card's and the store's first pictures. It fills its window.
 */
export function HeroCard({
  layout,
  lede,
  prefix,
  browsers,
}: {
  layout: keyof typeof layouts;
  /** A line under the headline. */
  lede?: string;
  /** What comes before the browsers, such as “Free for”. */
  prefix: string;
  browsers: readonly StoreBrowser[];
}) {
  const spacing = layouts[layout];

  return (
    <div className={cn('relative flex size-full items-center', spacing.row)}>
      <div className={cn('flex min-w-0 flex-1 flex-col', spacing.text)}>
        <span className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <AppMark size="md" />
          Send to Telegram
        </span>
        <h1 className="font-heading text-7xl leading-none tracking-tight">
          Send text, links and images to Telegram
        </h1>
        {lede ? <p className="text-2xl text-muted-foreground">{lede}</p> : null}
        <p className="text-2xl whitespace-nowrap text-muted-foreground">
          {prefix}{' '}
          {browsers.map((browser, index) => (
            <Fragment key={browser}>
              {index > 0 ? ' and ' : null}
              <span className="inline-flex items-center gap-2 align-middle text-foreground">
                <BrowserLogo src={storeBrowsers[browser].logo} />
                {storeBrowsers[browser].name}
              </span>
            </Fragment>
          ))}
        </p>
      </div>
      <div className={cn('shrink-0', spacing.art)}>
        <HeroArt still />
      </div>
    </div>
  );
}
