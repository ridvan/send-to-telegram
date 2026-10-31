import { isChatPattern, patternTile } from '@/lib/chat-patterns';
import type { ChatBackground } from '@/lib/settings';

/**
 * What's drawn behind the chat's messages, filling the nearest positioned
 * box over its `bg-chat`. A photo that's gone leaves the plain color.
 */
export function ChatWallpaper({
  background,
  photo,
}: {
  background: ChatBackground;
  photo: string | null;
}) {
  if (background === 'photo' && photo) {
    return (
      <span
        aria-hidden
        // Dimmed in dark mode, so light photos don't outshine the messages.
        className="pointer-events-none absolute inset-0 bg-(image:--photo) bg-cover bg-center dark:brightness-75"
        style={{ '--photo': `url("${photo}")` }}
      />
    );
  }

  if (!isChatPattern(background)) return null;

  const tile = patternTile(background);

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-chat-pattern mask-(--tile) mask-size-(--tile-size) mask-repeat"
      style={{ '--tile': tile.image, '--tile-size': tile.size }}
    />
  );
}
