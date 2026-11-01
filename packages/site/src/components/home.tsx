import { Connect } from '@/components/sections/connect';
import { Features } from '@/components/sections/features';
import { Hero } from '@/components/sections/hero';
import { Kinds } from '@/components/sections/kinds';

export function Home() {
  return (
    <>
      <Hero />
      <Kinds />
      <Connect />
      <Features />
    </>
  );
}
