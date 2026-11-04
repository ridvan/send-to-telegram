import { ImageAdd01Icon, PaintBoardIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { chatPatterns } from '@send-to-telegram/core/chat-patterns';
import { useRef, useState } from 'react';

import { ChatWallpaper } from '@/components/chat-wallpaper';
import { SettingRow } from '@/components/setting-row';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useStore } from '@/hooks/use-store';
import { photoToBackground } from '@/lib/chat-photo';
import {
  type ChatBackground,
  chatBackgroundSchema,
  chatPhotoStore,
  settingsStore,
} from '@/lib/settings';

const names = {
  plain: 'Plain',
  doodles: 'Doodles',
  space: 'Space',
  garden: 'Garden',
  waves: 'Waves',
  lattice: 'Hemp leaf',
  petals: 'Petals',
  photo: 'Your photo',
} satisfies Record<ChatBackground, string>;

function choose(chatBackground: ChatBackground) {
  return settingsStore.update((settings) => ({
    ...settings,
    appearance: { ...settings.appearance, chatBackground },
  }));
}

/** Picks what's behind the popup's chat, each choice drawn as it will look. */
export function ChatBackgroundRow() {
  const { chatBackground } = useStore(settingsStore).appearance;
  const photo = useStore(chatPhotoStore);
  const fileInput = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);

  async function pick(file: File) {
    try {
      await chatPhotoStore.set(await photoToBackground(file));
      await choose('photo');
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  async function removePhoto() {
    await chatPhotoStore.set(null);
    await choose('doodles');
  }

  const options: ChatBackground[] = ['plain', ...chatPatterns, 'photo'];

  return (
    <SettingRow
      icon={{ icon: PaintBoardIcon, tone: 'cyan' }}
      label="Chat background"
    >
      <div className="flex flex-col gap-2 pt-1">
        <ToggleGroup
          variant="tile"
          size="fit"
          spacing={2}
          aria-label="Chat background"
          className="grid w-full max-w-80 grid-cols-4"
          value={[chatBackground]}
          onValueChange={([next]) => {
            const picked = chatBackgroundSchema.safeParse(next);

            if (!picked.success) return;

            // Without a photo yet, the tile asks for one first.
            if (picked.data === 'photo' && !photo) fileInput.current?.click();
            else void choose(picked.data);
          }}
        >
          {options.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              aria-label={
                option === 'photo' && !photo ? 'Choose a photo' : names[option]
              }
            >
              <span className="relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg bg-chat text-muted-foreground">
                <ChatWallpaper background={option} photo={photo} preview />
                {option === 'photo' && !photo ? (
                  <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={1.8} />
                ) : null}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];

            // Cleared, so picking the same file again still counts.
            event.target.value = '';

            if (file) void pick(file);
          }}
        />
        {failed ? (
          <FieldError>
            Couldn’t open that file. Pick a PNG or JPEG photo.
          </FieldError>
        ) : null}
        {photo && chatBackground === 'photo' ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              Choose another photo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              tone="muted"
              onClick={() => void removePhoto()}
            >
              Remove photo
            </Button>
          </div>
        ) : null}
      </div>
    </SettingRow>
  );
}
