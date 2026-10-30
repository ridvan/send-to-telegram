import { useId, useRef, useState } from 'react';

import { ChatAvatar } from '@/components/chat-avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  avatarPatterns,
  photoToDataUrl,
  singleEmoji,
  suggestedEmojis,
} from '@/lib/avatars';
import { updateDestination } from '@/lib/destinations';
import {
  type AvatarPattern,
  avatarPatternSchema,
  avatarSeed,
  type ChatAvatarChoice,
  type Destination,
  destinationName,
} from '@/lib/settings';

const modes = {
  initials: 'Initials',
  emoji: 'Emoji',
  pattern: 'Pattern',
  image: 'Photo',
};

type Mode = keyof typeof modes;

function isMode(value: string): value is Mode {
  return Object.hasOwn(modes, value);
}

const patternNames: Record<AvatarPattern, string> = {
  beam: 'Beam',
  marble: 'Marble',
  pixel: 'Pixel',
  sunset: 'Sunset',
  ring: 'Ring',
  bauhaus: 'Bauhaus',
};

export function AvatarDialog({
  destination,
  onClose,
}: {
  destination: Destination;
  onClose: () => void;
}) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const current = destination.avatar;
  const name = destinationName(destination);
  const seed = avatarSeed(destination);

  const [mode, setMode] = useState<Mode>(current?.kind ?? 'initials');

  // Each kind keeps its pick, so trying another and coming back loses nothing.
  const [emoji, setEmoji] = useState(
    current?.kind === 'emoji' ? current.emoji : (suggestedEmojis[0] ?? '📚')
  );

  // One typed earlier shows in the field, since the grid can't mark it.
  const [typed, setTyped] = useState(
    current?.kind === 'emoji' && !suggestedEmojis.includes(current.emoji)
      ? current.emoji
      : ''
  );

  const [pattern, setPattern] = useState<AvatarPattern>(
    current?.kind === 'pattern' ? current.style : 'beam'
  );

  const [photo, setPhoto] = useState(
    current?.kind === 'image' ? current.dataUrl : undefined
  );

  const [photoError, setPhotoError] = useState(false);

  const typedEmoji = singleEmoji(typed);

  const typedInvalid = typed.trim() !== '' && !typedEmoji;

  const choices: Record<Mode, ChatAvatarChoice | undefined> = {
    initials: undefined,
    emoji: { kind: 'emoji', emoji },
    pattern: { kind: 'pattern', style: pattern },
    image: photo ? { kind: 'image', dataUrl: photo } : undefined,
  };

  const choice = choices[mode];

  // Only the emoji field's own mistake holds back saving, and only there.
  const canSave =
    mode === 'initials' ||
    (choice !== undefined && (mode !== 'emoji' || !typedInvalid));

  async function pick(file: File) {
    try {
      setPhoto(await photoToDataUrl(file));
      setPhotoError(false);
    } catch {
      setPhotoError(true);
    }
  }

  async function save() {
    await updateDestination(destination.id, { avatar: choice ?? null });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change avatar</DialogTitle>
          <DialogDescription>
            Only you see it, in the popup and menus.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <ChatAvatar name={name} seed={seed} avatar={choice} size="xl" />
          <ToggleGroup
            variant="segmented"
            size="sm"
            aria-label="Avatar"
            value={[mode]}
            onValueChange={([next]) => {
              if (next && isMode(next)) setMode(next);
            }}
          >
            {Object.entries(modes).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {mode === 'emoji' ? (
          <div className="flex flex-col gap-3">
            <ToggleGroup
              spacing={1}
              size="glyph"
              aria-label="Emoji"
              className="grid grid-cols-8 justify-items-center"
              value={typedEmoji ? [] : [emoji]}
              onValueChange={([next]) => {
                if (!next) return;

                setEmoji(next);
                setTyped('');
              }}
            >
              {suggestedEmojis.map((each) => (
                <ToggleGroupItem key={each} value={each} aria-label={each}>
                  {each}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Field data-invalid={typedInvalid || undefined}>
              <FieldLabel htmlFor={inputId}>Or use any emoji</FieldLabel>
              <Input
                id={inputId}
                value={typed}
                placeholder="🦊"
                maxLength={16}
                aria-invalid={typedInvalid || undefined}
                onChange={(event) => {
                  setTyped(event.target.value);

                  const next = singleEmoji(event.target.value);

                  if (next) setEmoji(next);
                }}
              />
              {typedInvalid ? (
                <FieldError>Enter one emoji, such as 🦊.</FieldError>
              ) : null}
            </Field>
          </div>
        ) : null}

        {mode === 'pattern' ? (
          <ToggleGroup
            variant="swatch"
            size="fit"
            spacing={1}
            aria-label="Pattern"
            className="w-full justify-between"
            value={[pattern]}
            onValueChange={([next]) => {
              const style = avatarPatternSchema.safeParse(next);

              if (style.success) setPattern(style.data);
            }}
          >
            {avatarPatterns.map((style) => (
              <ToggleGroupItem
                key={style}
                value={style}
                aria-label={patternNames[style]}
              >
                <ChatAvatar
                  name={name}
                  seed={seed}
                  avatar={{ kind: 'pattern', style }}
                  size="lg"
                />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}

        {mode === 'image' ? (
          <Field>
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
            >
              {photo ? 'Choose another photo' : 'Choose a photo'}
            </Button>
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
            {photoError ? (
              <FieldError>
                Couldn’t open that file. Pick a PNG or JPEG photo.
              </FieldError>
            ) : null}
          </Field>
        ) : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={!canSave} onClick={() => void save()}>
            Save avatar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
