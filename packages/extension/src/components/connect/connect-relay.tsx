import {
  ArrowUpRight01Icon,
  ComputerIcon,
  Copy01Icon,
  SmartPhone01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Pairing } from '@send-to-telegram/core';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePoll } from '@/hooks/use-poll';
import { SendFailure, toSendFailure } from '@/lib/failure';
import { links } from '@/lib/links';
import {
  clientName,
  createDeviceToken,
  deviceStatus,
  pairingLink,
  RELAY_URL,
  startPairing,
} from '@/lib/relay';
import type { RelayDestination } from '@/lib/settings';
import { cn } from '@/lib/utils';

import { QrCode } from './qr-code';
import { TextLink } from './text-link';

type Phase =
  | { name: 'creating' }
  | { name: 'waiting'; pairing: Pairing; token: string }
  | { name: 'linked'; pairing: Pairing }
  | { name: 'expired'; pairing: Pairing }
  | { name: 'failed'; message: string };

type Audience = 'me' | 'group';

/**
 * On a phone there's nothing to scan the code with, so the link leads.
 * iPadOS asks for desktop sites as a Mac, so a Mac with touch is an iPad.
 */
const onPhone =
  /Android|iPhone|iPad/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * The link still waiting for Start, kept while the page is open so closing
 * and reopening Add chat picks it up instead of asking the relay for another.
 */
let pending: { pairing: Pairing; token: string } | undefined;

function reusable() {
  return pending && Date.now() < pending.pairing.expiresAt
    ? pending
    : undefined;
}

/**
 * Links this browser to a chat with the hosted bot. The one-time link is
 * ready as the page opens, as a code to scan with the phone most people
 * keep Telegram on, and as a link for Telegram on this computer. Pressing
 * Start in Telegram links the chat, and the relay reports it back here.
 */
export function ConnectRelay({
  onConnected,
  active = true,
}: {
  onConnected: (destination: RelayDestination) => void;
  /** False while another way to connect is showing; the link waits, unchecked. */
  active?: boolean;
}) {
  const ids = useId();

  const [phase, setPhase] = useState<Phase>(() => {
    const kept = reusable();

    return kept ? { name: 'waiting', ...kept } : { name: 'creating' };
  });

  const [audience, setAudience] = useState<Audience>('me');
  const started = useRef(false);

  async function create() {
    setPhase({ name: 'creating' });

    try {
      const token = createDeviceToken();
      const pairing = await startPairing(RELAY_URL, token, await clientName());

      pending = { pairing, token };
      setPhase({ name: 'waiting', pairing, token });
    } catch (cause) {
      setPhase({ name: 'failed', message: toSendFailure(cause).message });
    }
  }

  // A link kept from earlier in this page is already waiting.
  const createOnOpen = useEffectEvent(() => {
    if (phase.name === 'creating') void create();
  });

  useEffect(() => {
    // Strict mode runs effects twice; one link is enough.
    if (started.current) return;
    started.current = true;
    createOnOpen();
  }, []);

  const retryOnline = useEffectEvent(() => {
    if (phase.name === 'failed') void create();
  });

  useEffect(() => {
    // A link that couldn't start offline starts once the connection is back.
    window.addEventListener('online', retryOnline);

    return () => window.removeEventListener('online', retryOnline);
  }, []);

  usePoll(
    async () => {
      if (phase.name !== 'waiting') return;

      if (Date.now() > phase.pairing.expiresAt) {
        pending = undefined;
        setPhase({ name: 'expired', pairing: phase.pairing });

        return;
      }

      try {
        const status = await deviceStatus(RELAY_URL, phase.token);

        if (status.status === 'linked') {
          // Stops the poll, so the chat is added once.
          pending = undefined;
          setPhase({ name: 'linked', pairing: phase.pairing });
          onConnected({
            id: crypto.randomUUID(),
            kind: 'relay',
            relayUrl: RELAY_URL,
            deviceToken: phase.token,
            chatTitle: status.chat.title,
            chatType: status.chat.type,
          });
        }
      } catch (cause) {
        if (cause instanceof SendFailure && cause.reason === 'unauthorized') {
          pending = undefined;
          setPhase({ name: 'expired', pairing: phase.pairing });
        }
      }
    },
    2000,
    active && phase.name === 'waiting'
  );

  const group = audience === 'group';

  const pairing =
    phase.name === 'creating' || phase.name === 'failed'
      ? undefined
      : phase.pairing;

  const link = pairing ? pairingLink(pairing, group) : '';
  const usable = phase.name === 'waiting';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium" id={`${ids}-audience`}>
          Send to
        </p>
        <ToggleGroup
          variant="segmented"
          size="sm"
          aria-labelledby={`${ids}-audience`}
          value={[audience]}
          onValueChange={([next]) => {
            if (next === 'me' || next === 'group') setAudience(next);
          }}
        >
          <ToggleGroupItem value="me">Yourself</ToggleGroupItem>
          <ToggleGroupItem value="group">A group</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border">
        {onPhone ? null : (
          <section
            aria-labelledby={`${ids}-phone`}
            className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center"
          >
            <CodeTile phase={phase} link={link} group={group} />
            <div className="flex flex-col gap-3">
              <Lane id={`${ids}-phone`} icon={SmartPhone01Icon}>
                On your phone
              </Lane>
              <ol className="flex flex-col gap-2.5 text-sm">
                <Instruction index={1}>
                  Scan the code with your camera
                </Instruction>
                <Instruction index={2}>
                  {group
                    ? 'Pick the group and add the bot'
                    : 'Press Start in Telegram'}
                </Instruction>
              </ol>
            </div>
          </section>
        )}

        <section
          aria-labelledby={`${ids}-computer`}
          className={cn(
            'flex flex-col gap-3 p-5',
            onPhone ? undefined : 'border-t'
          )}
        >
          <Lane
            id={`${ids}-computer`}
            icon={onPhone ? SmartPhone01Icon : ComputerIcon}
          >
            {onPhone ? 'In Telegram' : 'On this computer'}
          </Lane>
          <div className="flex flex-wrap gap-2">
            <InputGroup className="min-w-0 flex-1 basis-56">
              <InputGroupInput
                aria-label="Link to the bot"
                value={link}
                placeholder="t.me/…"
                readOnly
                disabled={!usable}
                code
                onFocus={(event) => event.target.select()}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Copy link"
                  disabled={!usable}
                  onClick={() =>
                    void navigator.clipboard.writeText(link).then(
                      () => toast('Copied link'),
                      () =>
                        toast.error(
                          'Couldn’t copy. Select the link and copy it yourself.'
                        )
                    )
                  }
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <Button
              variant={onPhone ? 'brand' : 'outline'}
              className={onPhone ? 'order-first' : undefined}
              disabled={!usable}
              {...(usable && {
                nativeButton: false,
                render: <a href={link} target="_blank" rel="noreferrer" />,
              })}
            >
              {group ? 'Choose a group' : 'Open Telegram'}
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                strokeWidth={2}
                data-icon="inline-end"
              />
            </Button>
          </div>
          {onPhone ? null : (
            <p className="text-xs text-muted-foreground">
              Opens Telegram Desktop. On Telegram Web, paste it into Saved
              Messages and click it.
            </p>
          )}
        </section>

        <Status phase={phase} group={group} onRenew={() => void create()} />
      </div>

      <p className="text-xs text-muted-foreground">
        S2T Relay passes messages on to Telegram without reading or storing
        them. <TextLink href={links.privacy}>See what it keeps</TextLink>
      </p>
    </div>
  );
}

function Lane({
  id,
  icon,
  children,
}: {
  id: string;
  icon: typeof ComputerIcon;
  children: string;
}) {
  return (
    <h3
      id={id}
      className="flex items-center gap-2 text-sm font-medium text-foreground"
    >
      <HugeiconsIcon
        icon={icon}
        strokeWidth={1.8}
        className="size-4 text-muted-foreground"
      />
      {children}
    </h3>
  );
}

function Instruction({ index, children }: { index: number; children: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground"
      >
        {index}
      </span>
      {children}
    </li>
  );
}

/** The code to scan, or what stands in for it while there isn't one to use. */
function CodeTile({
  phase,
  link,
  group,
}: {
  phase: Phase;
  link: string;
  group: boolean;
}) {
  const tile = 'size-40 shrink-0';

  if (phase.name === 'waiting') {
    return (
      <QrCode
        value={link}
        label={
          group
            ? 'Code that opens S2T Relay in Telegram to add it to a group'
            : 'Code that opens S2T Relay in Telegram'
        }
        className={cn(tile, 'animate-rise')}
      />
    );
  }

  if (phase.name === 'expired' || phase.name === 'linked') {
    return (
      <div aria-hidden className={cn(tile, 'relative')}>
        <QrCode
          value={link}
          label=""
          className="size-full opacity-15 blur-xs"
        />
        <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-muted-foreground">
          {phase.name === 'linked' ? (
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="size-8 text-success"
            />
          ) : (
            'Expired'
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        tile,
        'flex items-center justify-center rounded-xl border border-dashed bg-muted/40 text-muted-foreground'
      )}
    >
      {phase.name === 'creating' ? <Spinner /> : null}
    </div>
  );
}

/** One line under both ways that says what's happening and what to do. */
function Status({
  phase,
  group,
  onRenew,
}: {
  phase: Phase;
  group: boolean;
  onRenew: () => void;
}) {
  const base =
    'flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-t bg-muted/40 px-5 py-2.5 text-sm';

  if (phase.name === 'expired' || phase.name === 'failed') {
    return (
      <div role="alert" className={cn(base, 'justify-between')}>
        <span
          className={cn(
            'text-pretty',
            phase.name === 'failed'
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {phase.name === 'failed'
            ? phase.message
            : 'This link expired. Links work for 10 minutes.'}
        </span>
        <Button variant="outline" size="sm" onClick={onRenew}>
          {phase.name === 'failed' ? 'Try again' : 'Get a new link'}
        </Button>
      </div>
    );
  }

  return (
    <p role="status" className={cn(base, 'text-muted-foreground')}>
      {phase.name === 'linked' ? (
        <HugeiconsIcon
          icon={Tick02Icon}
          strokeWidth={2}
          className="size-4 text-success"
        />
      ) : (
        // The line is the live region; the spinner shouldn't announce too.
        <Spinner role="presentation" aria-hidden />
      )}
      {phase.name === 'creating' ? 'Getting a link' : null}
      {phase.name === 'waiting'
        ? group
          ? 'Waiting for the bot to join a group'
          : 'Waiting for you to press Start'
        : null}
      {phase.name === 'linked' ? 'Connected' : null}
    </p>
  );
}
