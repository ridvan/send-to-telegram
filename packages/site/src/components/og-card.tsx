import { HeroCard } from '@/components/hero-card';

/** 1200 by 630, the size link previews use; always dark. */
export function OgCard() {
  return (
    <div
      data-theme="dark"
      className="relative h-screen w-screen overflow-hidden bg-background text-foreground"
    >
      <HeroCard
        layout="og"
        prefix="Free extension for"
        browsers={['chrome', 'edge']}
      />
    </div>
  );
}
