import {
  Download04Icon,
  File01Icon,
  ImageNotFound01Icon,
  PauseIcon,
  PlayIcon,
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
import { type FileState, useTelegramFile } from '@/hooks/use-telegram-file';
import { formatBytes, formatDuration } from '@/lib/format';
import type { InboxEntry, InboxFile, InboxPicture } from '@/lib/settings';
import {
  allowDownloads,
  downloadFile,
  FileFailure,
  type FileFailureReason,
} from '@/lib/telegram-files';

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

/** The day it arrived, to name a saved photo. */
function savedName(message: InboxEntry, extension: string) {
  const day = new Date(message.receivedAt).toISOString().slice(0, 10);

  return `telegram-${day}.${extension}`;
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
}: {
  token: string;
  message: InboxEntry;
  file: InboxFile;
}) {
  const preview = file.preview ?? file;
  const [open, setOpen] = useState(false);

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
        aria-label="Open photo"
        disabled={state.status !== 'ready'}
        onClick={() => setOpen(true)}
        className="relative flex aspect-(--aspect) max-h-80 w-full items-center justify-center overflow-hidden bg-received-muted/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        style={{ '--aspect': aspectOf(preview) }}
      >
        {state.status === 'ready' ? (
          <img src={state.url} alt="" className="size-full object-cover" />
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
  file,
  looped,
}: {
  token: string;
  file: InboxFile;
  /** A GIF: plays silently on a loop, without controls. */
  looped: boolean;
}) {
  const [playing, setPlaying] = useState(false);

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

  if (video.state.status === 'ready') {
    return (
      <video
        src={video.state.url}
        autoPlay
        playsInline
        controls={!looped}
        loop={looped}
        muted={looped}
        className="aspect-(--aspect) max-h-80 w-full bg-black"
        style={{ '--aspect': aspectRatio }}
      />
    );
  }

  // Known from the size Telegram reported, before trying to download it.
  const tooBig =
    (file.size ?? 0) > DOWNLOAD_LIMIT ||
    (video.state.status === 'failed' && video.state.reason === 'too_big');

  return (
    <span className="flex flex-col">
      <button
        type="button"
        aria-label={looped ? 'Play GIF' : 'Play video'}
        disabled={video.state.status === 'loading' || tooBig}
        onClick={() => {
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
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        {tooBig ? null : (
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

/** A voice message or song: a play button and how long it runs. */
function SoundMedia({
  token,
  file,
  label,
}: {
  token: string;
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

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2.5">
        <Button
          variant="brand"
          size="send"
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
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{label}</span>
          <span className="text-xs text-received-muted tabular-nums">
            {started && duration
              ? `${formatDuration(elapsed)} / ${duration}`
              : (duration ?? (file.size ? formatBytes(file.size) : ''))}
          </span>
        </span>
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
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<FileFailure>();

  const thumbnail = useTelegramFile(token, file.preview, {
    wanted: true,
    keep: true,
    type: 'image/jpeg',
  });

  async function save() {
    setSaving(true);
    setFailure(undefined);

    try {
      const blob = await downloadFile(token, file, {
        signal: new AbortController().signal,
        keep: false,
        type: 'application/octet-stream',
      });

      const url = URL.createObjectURL(blob);

      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: name,
      });

      link.click();
      // Long enough for the browser to start saving it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Save ${name}`}
          aria-disabled={saving}
          onClick={() => {
            if (!saving) void save();
          }}
        >
          {saving ? (
            <Spinner />
          ) : (
            <HugeiconsIcon icon={Download04Icon} strokeWidth={1.8} />
          )}
        </Button>
      </span>
      {failure ? (
        <Failure
          state={{ status: 'failed', reason: failure.reason }}
          onRetry={() => void save()}
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
  switch (message.media) {
    case 'photo':
      return <PhotoMedia token={token} message={message} file={file} />;
    case 'video':
    case 'animation':
      return (
        <VideoMedia
          token={token}
          file={file}
          looped={message.media === 'animation'}
        />
      );
    case 'voice':
      return <SoundMedia token={token} file={file} label="Voice message" />;
    case 'audio':
      return (
        <SoundMedia
          token={token}
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
