import { cn } from '@/lib/utils';

const sizes = { sm: 'size-5', md: 'size-8', lg: 'size-12' };

/** The extension icon, drawn from the same files the browser toolbar uses. */
export function AppMark({ size = 'md' }: { size?: keyof typeof sizes }) {
  return (
    <img
      src="/icon/128.png"
      alt=""
      className={cn('shrink-0 select-none', sizes[size])}
      draggable={false}
    />
  );
}
