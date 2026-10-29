import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/format';

export function ChatAvatar({
  name,
  size = 'default',
}: {
  name: string;
  size?: 'sm' | 'default' | 'lg';
}) {
  return (
    <Avatar size={size} aria-hidden>
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
