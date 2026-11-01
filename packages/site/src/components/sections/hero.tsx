import { HeroArt } from '@/components/hero-art';
import { HeroDemo } from '@/components/hero-demo';
import { StoreButtons } from '@/components/store-buttons';

export function Hero() {
  return (
    <section className="page flex flex-col gap-12 pt-12 pb-24 sm:pt-16">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex max-w-2xl flex-col items-start gap-6">
          <h1 className="font-heading text-4xl tracking-tight text-balance sm:text-6xl">
            Send text, links and images to Telegram
            <span
              aria-hidden
              className="ml-0.5 align-top text-xl font-medium text-muted-foreground sm:text-3xl"
            >
              *
            </span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            A browser extension that sends what you right-click to your Telegram
            chat, group or channel, or anything you like from its popup.
          </p>
          <StoreButtons />
          <p className="max-w-md text-xs text-muted-foreground">
            <span aria-hidden>* </span>
            Telegram is a trademark of its owner. Send to Telegram is a free,
            open-source extension and isn’t affiliated with Telegram.
          </p>
        </div>
        <div className="hidden -translate-y-3 lg:block">
          <HeroArt />
        </div>
      </div>
      <HeroDemo />
    </section>
  );
}
