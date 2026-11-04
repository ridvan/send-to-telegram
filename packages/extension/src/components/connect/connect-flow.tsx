import { useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { links } from '@/lib/links';
import { hasRelay } from '@/lib/relay';
import type { Destination } from '@/lib/settings';

import { ConnectBot } from './connect-bot';
import { ConnectRelay } from './connect-relay';
import { TextLink } from './text-link';

type Method = 'relay' | 'bot';

const methods = {
  relay: {
    title: 'S2T Relay',
    badge: 'Ready in seconds',
    description: 'Press Start in Telegram and you’re done. Sends one way.',
  },
  bot: {
    title: 'Your own bot',
    badge: 'Direct, two-way',
    description:
      'Nothing in between, and what you send the bot shows up in the popup. About two minutes.',
  },
} satisfies Record<
  Method,
  { title: string; badge: string; description: string }
>;

/**
 * Both ways to connect, side by side with what each is good at, starting on
 * the quicker one. Builds without a relay go straight to your own bot.
 */
export function ConnectFlow({
  onConnected,
}: {
  onConnected: (destination: Destination) => void;
}) {
  const id = useId();
  const [method, setMethod] = useState<Method>('relay');

  if (!hasRelay) return <ConnectBot onConnected={onConnected} />;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <RadioGroup
          aria-label="How to connect"
          value={method}
          onValueChange={(next) => {
            if (next === 'relay' || next === 'bot') setMethod(next);
          }}
          className="sm:grid-cols-2"
        >
          {(['relay', 'bot'] as const).map((option) => (
            <FieldLabel key={option} htmlFor={`${id}-${option}`}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>
                    {methods[option].title}
                    <Badge variant="secondary">{methods[option].badge}</Badge>
                  </FieldTitle>
                  <FieldDescription>
                    {methods[option].description}
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem value={option} id={`${id}-${option}`} />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          Not sure?{' '}
          <TextLink href={links.compare}>Compare them on s2t.dev</TextLink>
        </p>
      </div>

      {/* Both stay mounted, so switching back keeps the relay's link. */}
      <div hidden={method !== 'relay'}>
        <ConnectRelay onConnected={onConnected} active={method === 'relay'} />
      </div>
      <div hidden={method !== 'bot'}>
        <ConnectBot onConnected={onConnected} />
      </div>
    </div>
  );
}
