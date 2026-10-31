import {
  Download04Icon,
  File01Icon,
  ImageNotFound01Icon,
  PauseIcon,
  PlayIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { DOWNLOAD_LIMIT } from '@send-to-telegram/core';
import { useRef, useState } from 'react';

import { IconTile } from '@/components/icon-tile';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useStore } from '@/hooks/use-store';
import { type FileState, useTelegramFile } from '@/hooks/use-telegram-file';
import { formatBytes, formatDuration } from '@/lib/format';
import {
  type InboxEntry,
  type InboxFile,
  type InboxPicture,
  settingsStore,
} from '@/lib/settings';
import {
  allowDownloads,
  downloadFile,
  FileFailure,
  type FileFailureReason,
} from '@/lib/telegram-files';
import { cn } from '@/lib/utils';

/** Sized before it loads, so the chat doesn't jump as pictures arrive. */
function aspectOf(picture: InboxPicture | undefined) {
  return picture?.width && picture.height
    ? `${picture.width} / ${picture.height}`
    : '4 / 3';
}

const failureCopy = {
  too_big: 'Over 20 MB, so it opens only in Telegram.',
  unavailable: 'Couldn’t load it.',
  not_allowed: 'To show media here, allow downloads from Telegram once.',
} satisfies Record<FileFailureReason, string>;

/** Why a file didn't load, with a way to ask again when that might help. */
function Failure({
  state,
  onRetry,
  centered = false,
}: {
  state: Extract<FileState, { status: 'failed' }>;
  onRetry: () => void;
  /** Sits in the middle of a picture's box. */
  centered?: boolean;
}) {
  if (state.reason === 'not_allowed') {
    return (
      <span
        className={
          centered
            ? 'flex flex-col items-center gap-1.5 text-xs text-received-muted'
            : 'flex flex-col items-start gap-1.5 text-xs text-received-muted'
        }
      >
        {failureCopy.not_allowed}
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            // Asked before any await: the browser needs the click.
            void allowDownloads().then((allowed) => {
              if (allowed) onRetry();
            });
          }}
        >
          Allow downloads
        </Button>
      </span>
    );
  }

  return (
    <span className="text-xs text-received-muted">
      {failureCopy[state.reason]}{' '}
      {state.reason === 'unavailable' ? (
        <Button variant="link" size="text" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </span>
  );
}

/**
 * Blurs a picture until it's clicked once, like Telegram's spoiler media. The
 * file still loads; only how it's drawn changes.
 */
function coverClass(covered: boolean) {
  return cn(
    'transition duration-300 ease-out motion-reduce:transition-none',
    // Scaled up so the blur's soft edges stay outside the box.
    covered && 'scale-110 blur-lg'
  );
}

/** Says a blurred picture opens with a click. */
function ShowPill() {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span className="flex items-center gap-1 rounded-full bg-black/55 py-1 pr-2.5 pl-2 text-xs font-medium text-white backdrop-blur-sm">
        <HugeiconsIcon icon={ViewIcon} strokeWidth={2} className="size-3.5" />
        Show
      </span>
    </span>
  );
}

/** The day it arrived, to name a saved photo. */
function savedName(message: InboxEntry, extension: string) {
  const day = new Date(message.receivedAt).toISOString().slice(0, 10);

  return `telegram-${day}.${extension}`;
}

const extensions = new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/flac', 'flac'],
  ['video/mp4', 'mp4'],
  ['video/quicktime', 'mov'],
  ['video/webm', 'webm'],
]);

/** The name a file is saved under: its own, its title, or the day it came. */
function fileNameOf(message: InboxEntry, file: InboxFile, extension: string) {
  if (message.fileName) return message.fileName;

  const known = extensions.get(file.mimeType ?? '') ?? extension;

  return file.title ? `${file.title}.${known}` : savedName(message, known);
}

function saveUrl(url: string, name: string) {
  Object.assign(document.createElement('a'), {
    href: url,
    download: name,
  }).click();
}

/**
 * Saves a received file to the computer. `save` takes the file's `blob:` URL
 * when it's already downloaded, such as a song that played, so it isn't
 * fetched twice.
 */
function useSaveFile(
  token: string,
  file: InboxFile,
  options: { name: string; type: string }
) {
  const { name, type } = options;
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<FileFailure>();

  async function save(url?: string) {
    if (saving) return;

    if (url) {
      saveUrl(url, name);

      return;
    }

    setSaving(true);
    setFailure(undefined);

    try {
      const blob = await downloadFile(token, file, {
        signal: new AbortController().signal,
        keep: false,
        type,
      });

      const objectUrl = URL.createObjectURL(blob);

      saveUrl(objectUrl, name);
      // Long enough for the browser to start saving it.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (cause) {
      setFailure(
        cause instanceof FileFailure
          ? cause
          : new FileFailure('unavailable', { cause })
      );
    } finally {
      setSaving(false);
    }
  }

  return { saving, failure, save };
}

/** Saves a file from the end of its row, or from a corner of a video. */
function SaveButton({
  label,
  saving,
  onSave,
  overlay = false,
}: {
  /** What it does, for screen readers: the file's name, or its kind. */
  label: string;
  saving: boolean;
  onSave: () => void;
  overlay?: boolean;
}) {
  return (
    <Button
      variant={overlay ? 'overlay' : 'ghost'}
      size={overlay ? 'corner' : 'icon'}
      aria-label={label}
      aria-disabled={saving}
      onClick={onSave}
      className={overlay ? 'absolute top-2 right-2' : undefined}
    >
      {saving ? (
        <Spinner />
      ) : (
        <HugeiconsIcon icon={Download04Icon} strokeWidth={1.8} />
      )}
    </Button>
  );
}

/** The full photo, opened from its bubble, with a way to save it. */
function PhotoViewer({
  token,
  message,
  file,
  previewUrl,
  open,
  onOpenChange,
}: {
  token: string;
  message: InboxEntry;
  file: InboxFile;
  previewUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state } = useTelegramFile(token, file, {
    wanted: open,
    keep: false,
    type: 'image/jpeg',
  });

  const url = state.status === 'ready' ? state.url : previewUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>
          {message.from ? `Photo from ${message.from}` : 'Photo'}
        </DialogTitle>
        <img
          src={url}
          alt={message.text ?? ''}
          className="max-h-[360px] w-full rounded-lg object-contain"
        />
        <DialogFooter>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={url} download={savedName(message, 'jpg')} />}
          >
            <HugeiconsIcon
              icon={Download04Icon}
              strokeWidth={1.8}
              data-icon="inline-start"
            />
            Save photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhotoMedia({
  token,
  message,
  file,
  hidden,
}: {
  token: string;
  message: InboxEntry;
  file: InboxFile;
  /** Blurred until the first click, which only reveals it. */
  hidden: boolean;
}) {
  const preview = file.preview ?? file;
  const [open, setOpen] = useState(false);
  // Until the popup closes, so a revealed photo stays revealed.
  const [revealed, setRevealed] = useState(false);
  const covered = hidden && !revealed;

  const { state, retry } = useTelegramFile(token, preview, {
    wanted: true,
    keep: true,
    type: 'image/jpeg',
  });

  if (state.status === 'failed') {
    return (
      <span
        className="flex aspect-(--aspect) w-full flex-col items-center justify-center gap-1.5 bg-received-muted/10 p-3 text-center"
        style={{ '--aspect': aspectOf(preview) }}
      >
        <HugeiconsIcon
          icon={ImageNotFound01Icon}
          strokeWidth={1.8}
          aria-hidden
          className="size-6 text-received-muted"
        />
        <Failure state={state} onRetry={retry} centered />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={covered ? 'Show photo' : 'Open photo'}
        disabled={state.status !== 'ready'}
        onClick={() => (covered ? setRevealed(true) : setOpen(true))}
        className="relative flex aspect-(--aspect) max-h-80 w-full items-center justify-center overflow-hidden bg-received-muted/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        style={{ '--aspect': aspectOf(preview) }}
      >
        {state.status === 'ready' ? (
          <>
            <img
              src={state.url}
              alt=""
              className={cn('size-full object-cover', coverClass(covered))}
            />
            {covered ? <ShowPill /> : null}
          </>
        ) : (
          <span className="text-received-muted">
            <Spinner />
          </span>
        )}
      </button>
      {state.status === 'ready' ? (
        <PhotoViewer
          token={token}
          message={message}
          file={file}
          previewUrl={state.url}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

/** A video or GIF: its first frame until clicked, then played in place. */
function VideoMedia({
  token,
  message,
  file,
  looped,
  hidden,
}: {
  token: string;
  message: InboxEntry;
  file: InboxFile;
  /** A GIF: plays silently on a loop, without controls. */
  looped: boolean;
  /** Its first frame is blurred until the first click, which only reveals it. */
  hidden: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const covered = hidden && !revealed;

  const frame = useTelegramFile(token, file.preview, {
    wanted: !playing,
    keep: true,
    type: 'image/jpeg',
  });

  const video = useTelegramFile(token, file, {
    wanted: playing,
    keep: false,
    type: 'video/mp4',
  });

  const aspectRatio = aspectOf(file.preview ?? file);
  const name = fileNameOf(message, file, 'mp4');
  const saver = useSaveFile(token, file, { name, type: 'video/mp4' });
  const ready = video.state.status === 'ready' ? video.state.url : undefined;

  // Known from the size Telegram reported, before trying to download it.
  const tooBig =
    (file.size ?? 0) > DOWNLOAD_LIMIT ||
    (video.state.status === 'failed' && video.state.reason === 'too_big') ||
    saver.failure?.reason === 'too_big';

  const save = tooBig ? null : (
    <SaveButton
      label={
        message.fileName ? `Save ${name}` : `Save ${looped ? 'GIF' : 'video'}`
      }
      saving={saver.saving}
      onSave={() => void saver.save(ready)}
      overlay
    />
  );

  const saveFailure =
    saver.failure && saver.failure.reason !== 'too_big' ? (
      <span className="px-3 pt-1.5">
        <Failure
          state={{ status: 'failed', reason: saver.failure.reason }}
          onRetry={() => void saver.save(ready)}
        />
      </span>
    ) : null;

  if (ready) {
    return (
      <span className="relative flex flex-col">
        <video
          src={ready}
          autoPlay
          playsInline
          controls={!looped}
          loop={looped}
          muted={looped}
          className="aspect-(--aspect) max-h-80 w-full bg-black"
          style={{ '--aspect': aspectRatio }}
        />
        {save}
        {saveFailure}
      </span>
    );
  }

  return (
    <span className="relative flex flex-col">
      <button
        type="button"
        aria-label={`${covered ? 'Show' : 'Play'} ${looped ? 'GIF' : 'video'}`}
        // A video too big to play can still be revealed.
        disabled={!covered && (video.state.status === 'loading' || tooBig)}
        onClick={() => {
          if (covered) {
            setRevealed(true);

            return;
          }

          if (video.state.status === 'failed') video.retry();

          setPlaying(true);
        }}
        className="relative flex aspect-(--aspect) max-h-80 w-full items-center justify-center overflow-hidden bg-black/80 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        style={{ '--aspect': aspectRatio }}
      >
        {frame.state.status === 'ready' ? (
          <img
            src={frame.state.url}
            alt=""
            className={cn(
              'absolute inset-0 size-full object-cover',
              coverClass(covered)
            )}
          />
        ) : null}
        {covered ? (
          <ShowPill />
        ) : tooBig ? null : (
          <span className="relative flex size-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            {video.state.status === 'loading' ? (
              <Spinner />
            ) : (
              <HugeiconsIcon
                icon={PlayIcon}
                strokeWidth={2}
                className="size-5"
              />
            )}
          </span>
        )}
        {file.duration || file.size ? (
          <span className="absolute top-2 left-2 rounded-full bg-black/55 px-1.5 text-xs leading-5 text-white tabular-nums backdrop-blur-sm">
            {[
              file.duration && formatDuration(file.duration),
              file.size && formatBytes(file.size),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </button>
      {save}
      {saveFailure}
      {tooBig || video.state.status === 'failed' ? (
        <span className="px-3 pt-1.5">
          <Failure
            state={
              tooBig
                ? { status: 'failed', reason: 'too_big' }
                : { status: 'failed', reason: 'unavailable' }
            }
            onRetry={video.retry}
          />
        </span>
      ) : null}
    </span>
  );
}

/** A voice message or song: a play button, how long it runs, and a save. */
function SoundMedia({
  token,
  message,
  file,
  label,
}: {
  token: string;
  message: InboxEntry;
  file: InboxFile;
  label: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const { state, retry } = useTelegramFile(token, file, {
    wanted: started,
    keep: false,
    type: 'audio/ogg',
  });

  const duration = file.duration ? formatDuration(file.duration) : undefined;
  const name = fileNameOf(message, file, 'ogg');
  const saver = useSaveFile(token, file, { name, type: 'audio/ogg' });
  const ready = state.status === 'ready' ? state.url : undefined;

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2.5">
        <Button
          variant="brand"
          size="play"
          aria-label={playing ? `Pause ${label}` : `Play ${label}`}
          aria-disabled={state.status === 'loading'}
          onClick={() => {
            if (state.status === 'failed') retry();

            if (!started) setStarted(true);
            else if (playing) audio.current?.pause();
            else void audio.current?.play();
          }}
        >
          {state.status === 'loading' ? (
            <Spinner />
          ) : (
            <HugeiconsIcon
              icon={playing ? PauseIcon : PlayIcon}
              strokeWidth={2}
            />
          )}
        </Button>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{label}</span>
          <span className="text-xs text-received-muted tabular-nums">
            {started && duration
              ? `${formatDuration(elapsed)} / ${duration}`
              : (duration ?? (file.size ? formatBytes(file.size) : ''))}
          </span>
        </span>
        <SaveButton
          label={
            message.media === 'voice' ? 'Save voice message' : `Save ${name}`
          }
          saving={saver.saving}
          onSave={() => void saver.save(ready)}
        />
      </span>
      {state.status === 'ready' ? (
        <audio
          ref={audio}
          src={state.url}
          autoPlay
          hidden
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        />
      ) : null}
      {state.status === 'failed' ? (
        <Failure state={state} onRetry={retry} />
      ) : saver.failure ? (
        <Failure
          state={{ status: 'failed', reason: saver.failure.reason }}
          onRetry={() => void saver.save(ready)}
        />
      ) : null}
    </span>
  );
}

/** A file: what it is, how big, and a button that saves it. */
function FileMedia({
  token,
  file,
  name,
}: {
  token: string;
  file: InboxFile;
  name: string;
}) {
  const saver = useSaveFile(token, file, {
    name,
    type: 'application/octet-stream',
  });

  const thumbnail = useTelegramFile(token, file.preview, {
    wanted: true,
    keep: true,
    type: 'image/jpeg',
  });

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2.5">
        {thumbnail.state.status === 'ready' ? (
          <img
            src={thumbnail.state.url}
            alt=""
            className="size-8 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <IconTile icon={File01Icon} tone="blue" />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{name}</span>
          {file.size ? (
            <span className="text-xs text-received-muted tabular-nums">
              {formatBytes(file.size)}
            </span>
          ) : null}
        </span>
        <SaveButton
          label={`Save ${name}`}
          saving={saver.saving}
          onSave={() => void saver.save()}
        />
      </span>
      {saver.failure ? (
        <Failure
          state={{ status: 'failed', reason: saver.failure.reason }}
          onRetry={() => void saver.save()}
        />
      ) : null}
    </span>
  );
}

/**
 * The media a received message carries, downloaded with the bot that got it.
 * `token` is that bot's; the hosted bot never receives messages.
 */
export function ReceivedMedia({
  token,
  message,
  file,
}: {
  token: string;
  message: InboxEntry;
  file: InboxFile;
}) {
  const hidden = useStore(settingsStore).privacy.blurMedia;

  switch (message.media) {
    case 'photo':
      return (
        <PhotoMedia
          token={token}
          message={message}
          file={file}
          hidden={hidden}
        />
      );
    case 'video':
    case 'animation':
      return (
        <VideoMedia
          token={token}
          message={message}
          file={file}
          looped={message.media === 'animation'}
          hidden={hidden}
        />
      );
    case 'voice':
      return (
        <SoundMedia
          token={token}
          message={message}
          file={file}
          label="Voice message"
        />
      );
    case 'audio':
      return (
        <SoundMedia
          token={token}
          message={message}
          file={file}
          label={file.title ?? message.fileName ?? 'Audio'}
        />
      );
    case 'file':
    case undefined:
      return (
        <FileMedia
          token={token}
          file={file}
          name={message.fileName ?? 'File'}
        />
      );
  }
}
