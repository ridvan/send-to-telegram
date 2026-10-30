import BoringAvatar from 'boring-avatars';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { patternColors, toneFor } from '@/lib/avatars';
import { initials } from '@/lib/format';
import type { ChatAvatarChoice } from '@/lib/settings';

/**
 * `seed` picks the color and pattern; pass the chat's title from Telegram so
 * renaming the chat here doesn't change it. Without `avatar`, it's initials.
 */
export function ChatAvatar({
  name,
  seed = name,
  avatar,
  size = 'default',
}: {
  name: string;
  seed?: string;
  avatar?: ChatAvatarChoice | undefined;
  size?: 'sm' | 'default' | 'lg' | 'xl';
}) {
  const tone = toneFor(seed);

  return (
    <Avatar size={size} aria-hidden>
      {avatar?.kind === 'emoji' ? (
        <AvatarFallback tone={tone} glyph="emoji">
          {avatar.emoji}
        </AvatarFallback>
      ) : avatar?.kind === 'pattern' ? (
        <BoringAvatar
          variant={avatar.style}
          name={seed}
          colors={patternColors(seed)}
          // A class, so a toggle's rule for icon sizes doesn't shrink it.
          className="size-full"
        />
      ) : (
        <>
          {avatar?.kind === 'image' ? (
            <AvatarImage src={avatar.dataUrl} alt="" />
          ) : null}
          <AvatarFallback tone={tone}>{initials(name)}</AvatarFallback>
        </>
      )}
    </Avatar>
  );
}
