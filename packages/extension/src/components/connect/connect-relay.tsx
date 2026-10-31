import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Pairing } from '@send-to-telegram/core';
import { useState } from 'react';
import { browser } from 'wxt/browser';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePoll } from '@/hooks/use-poll';
import { SendFailure, toSendFailure } from '@/lib/failure';
import {
  clientName,
  createDeviceToken,
  deviceStatus,
  pairingLink,
  RELAY_URL,
  startPairing,
} from '@/lib/relay';
import type { RelayDestination } from '@/lib/settings';

import { StartButton } from './illustrations';
import { Steps, Step } from './steps';

type Phase =
  | { name: 'idle' }
  | { name: 'opening' }
  | { name: 'waiting'; pairing: Pairing; token: string }
  | { name: 'linked' }
  | { name: 'expired' }
  | { name: 'failed'; message: string };

/**
 * Links this browser to a chat with the hosted bot: open a one-time link,
 * press Start in Telegram, and the relay reports the chat back here.
 */
export function ConnectRelay({
  onConnected,
  onUseOwnBot,
}: {
  onConnected: (destination: RelayDestination) => void;
  onUseOwnBot: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });

  async function open(group: boolean) {
    const reusable = phase.name === 'waiting' ? phase : undefined;

    if (reusable) {
      await browser.tabs.create({ url: pairingLink(reusable.pairing, group) });

      return;
    }

    setPhase({ name: 'opening' });

    try {
      const token = createDeviceToken();
      const pairing = await startPairing(RELAY_URL, token, await clientName());

      setPhase({ name: 'waiting', pairing, token });
      await browser.tabs.create({ url: pairingLink(pairing, group) });
    } catch (cause) {
      setPhase({ name: 'failed', message: toSendFailure(cause).message });
    }
  }

  usePoll(
    async () => {
      if (phase.name !== 'waiting') return;

      if (Date.now() > phase.pairing.expiresAt) {
        setPhase({ name: 'expired' });

        return;
      }

      try {
        const status = await deviceStatus(RELAY_URL, phase.token);

        if (status.status === 'linked') {
          // Stops the poll, so the chat is added once.
          setPhase({ name: 'linked' });
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
          setPhase({ name: 'expired' });
        }
      }
    },
    2000,
    phase.name === 'waiting'
  );

  const waiting = phase.name === 'waiting';

  return (
    <div className="flex flex-col gap-6">
      <Steps>
        <Step
          index={1}
          title="Open the bot in Telegram"
          done={waiting || phase.name === 'linked'}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="brand"
              onClick={() => void open(false)}
              disabled={phase.name === 'opening'}
            >
              {phase.name === 'opening' ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Open Telegram
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                strokeWidth={2}
                data-icon="inline-end"
              />
            </Button>
            <Button
              variant="ghost"
              tone="muted"
              onClick={() => void open(true)}
              disabled={phase.name === 'opening'}
            >
              Add to a group
            </Button>
          </div>
        </Step>
        <Step index={2} title="Press Start" active={waiting}>
          <div className="flex flex-col gap-3">
            <StartButton bot="Send to Telegram" />
            {waiting ? (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Spinner />
                Waiting for Telegram
              </p>
            ) : null}
          </div>
        </Step>
      </Steps>

      {phase.name === 'expired' ? (
        <Alert>
          <AlertTitle>The link expired</AlertTitle>
          <AlertDescription>
            Links work for 10 minutes. Open Telegram again to get a new one.
          </AlertDescription>
        </Alert>
      ) : null}

      {phase.name === 'failed' ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t start</AlertTitle>
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      ) : null}

      <p className="text-xs text-pretty text-muted-foreground">
        Messages pass through the Send to Telegram server, which doesn’t read or
        store them, so what people send the bot stays in Telegram.{' '}
        <Button variant="link" size="text" tone="muted" onClick={onUseOwnBot}>
          Use your own bot instead
        </Button>
      </p>
    </div>
  );
}
