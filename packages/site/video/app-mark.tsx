import { Img, staticFile } from 'remotion';

import { cn } from '@/lib/utils';

const sizes = { sm: 'size-6', md: 'size-8', lg: 'size-14', xl: 'size-28' };

/**
 * The extension icon, as the site's `AppMark` draws it, loaded through
 * Remotion so a frame waits for it.
 */
export function AppMark({ size = 'md' }: { size?: keyof typeof sizes }) {
  return (
    <Img
      src={staticFile('logo.svg')}
      alt=""
      width={64}
      height={64}
      className={cn('shrink-0 select-none', sizes[size])}
      draggable={false}
    />
  );
}
