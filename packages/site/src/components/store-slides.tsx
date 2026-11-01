import { use, type ReactNode } from 'react';

import { AppMark } from '@/components/app-mark';
import { HeroCard } from '@/components/hero-card';
import { HeroDemo } from '@/components/hero-demo';
import { Rings } from '@/components/rings';
import { WayPreview } from '@/components/sections/connect';
import { FeatureTiles } from '@/components/sections/features';
import { StoreLook } from '@/lib/store-look';

/*
 * The pictures for the Chrome Web Store and Edge Add-ons listings, drawn from
 * the site's own parts. Each one fills the window it's captured in: 1280 by
 * 800 for screenshots, 440 by 280 for the small tile, 1400 by 560 for the
 * marquee.
 */

/** The picture's page, dark or light. */
function Canvas({
  className = '',
  size = 'h-screen w-screen',
  children,
}: {
  className?: string;
  /**
   * The window by default. Headless Chrome won't open a window narrower than
   * about 500px, so the small tile draws at its own size and gets cropped.
   */
  size?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-theme={use(StoreLook).theme}
      className={`relative overflow-hidden bg-background text-foreground ${size} ${className}`}
    >
      {children}
    </div>
  );
}

/** A screenshot: what it shows in a line, then the picture of it. */
function Slide({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <Canvas className="flex flex-col gap-10 px-20 pt-16">
      <div className="relative flex max-w-4xl flex-col gap-3">
        <h1 className="font-heading text-6xl leading-none tracking-tight">
          {title}
        </h1>
        <p className="text-2xl text-muted-foreground">{text}</p>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </Canvas>
  );
}

export function HeroSlide() {
  // Each store's pictures name only its own browser.
  const browser = use(StoreLook).browser;

  return (
    <Canvas>
      <HeroCard
        layout="screenshot"
        lede="Right-click anything on a page, or write in the popup."
        prefix="Free for"
        browsers={[browser]}
      />
    </Canvas>
  );
}

export function RightClickSlide() {
  return (
    <Slide
      title="Right-click to send"
      text="Selected text, a link, an image or the whole page, to any of your chats."
    >
      <HeroDemo hold="menu" />
    </Slide>
  );
}

export function PopupSlide() {
  return (
    <Slide
      title="Add a note, a photo or a hashtag"
      text="The popup shows your message the way it will arrive."
    >
      <HeroDemo hold="draft" />
    </Slide>
  );
}

export function ConnectSlide() {
  return (
    <Slide
      title="Connect in seconds, or bring your own bot"
      text="S2T Relay links a chat when you press Start. Your own bot works both ways."
    >
      <div className="grid h-full grid-cols-2 grid-rows-1 gap-10 pb-16">
        <WayPreview id="relay" />
        <WayPreview id="own-bot" />
      </div>
    </Slide>
  );
}

export function DetailsSlide() {
  return (
    <Slide
      title="Yours, down to the details"
      text="No account and no analytics. Your chats and history stay in your browser."
    >
      <FeatureTiles />
    </Slide>
  );
}

/** The icon's middle on the small tile, which the rings spread from. */
const tileIcon = { x: 220, y: 96 };

export function SmallTile() {
  return (
    <Canvas size="h-70 w-110">
      <Rings
        width={440}
        height={280}
        x={tileIcon.x}
        y={tileIcon.y}
        radii={[64, 96, 128]}
        fade={170}
        fadeBelow={tileIcon.y + 56}
      />
      <div className="relative flex size-full flex-col items-center justify-center gap-4">
        <span className="rounded-3xl border bg-card p-3 shadow-lifted">
          <AppMark size="lg" />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <span className="font-heading text-4xl leading-none tracking-tight">
            Send to Telegram
          </span>
          <span className="text-base text-muted-foreground">
            Send what you right-click to your chats
          </span>
        </div>
      </div>
    </Canvas>
  );
}

export function Marquee() {
  const browser = use(StoreLook).browser;

  return (
    <Canvas>
      <HeroCard layout="marquee" prefix="Free for" browsers={[browser]} />
    </Canvas>
  );
}
