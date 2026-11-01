import { cn } from '@/lib/utils';

const sizes = { sm: 'size-6', md: 'size-8', lg: 'size-14', xl: 'size-28' };

/** The extension icon: Telegram's plane on a floppy disk. */
export function AppMark({ size = 'md' }: { size?: keyof typeof sizes }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      width={64}
      height={64}
      className={cn('shrink-0 select-none', sizes[size])}
      draggable={false}
    />
  );
}
