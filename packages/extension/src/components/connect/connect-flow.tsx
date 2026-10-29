import {
  ArrowRight01Icon,
  FlashIcon,
  Key01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { hasRelay } from '@/lib/relay';
import type { Destination } from '@/lib/settings';

import { ConnectBot } from './connect-bot';
import { ConnectRelay } from './connect-relay';

type Method = 'relay' | 'bot';

const methods = [
  {
    method: 'relay',
    icon: FlashIcon,
    title: 'Use the Send to Telegram bot',
    description:
      'Press Start in Telegram and you’re done. Takes a few seconds.',
  },
  {
    method: 'bot',
    icon: Key01Icon,
    title: 'Use your own bot',
    description:
      'Messages go straight from your browser to Telegram. Takes about two minutes.',
  },
] satisfies {
  method: Method;
  icon: typeof FlashIcon;
  title: string;
  description: string;
}[];

/** Picks how to reach Telegram, then runs that setup. */
export function ConnectFlow({
  onConnected,
}: {
  onConnected: (destination: Destination) => void;
}) {
  const [method, setMethod] = useState<Method | undefined>(
    hasRelay ? undefined : 'bot'
  );

  if (method === 'relay') {
    return (
      <ConnectRelay
        onConnected={onConnected}
        onUseOwnBot={() => setMethod('bot')}
      />
    );
  }

  if (method === 'bot') {
    return (
      <ConnectBot
        onConnected={onConnected}
        {...(hasRelay && { onUseRelay: () => setMethod('relay') })}
      />
    );
  }

  return (
    <ItemGroup>
      {methods.map((option) => (
        <Item
          key={option.method}
          variant="outline"
          render={
            <button type="button" onClick={() => setMethod(option.method)} />
          }
        >
          <ItemMedia variant="tile">
            <HugeiconsIcon icon={option.icon} strokeWidth={1.8} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{option.title}</ItemTitle>
            <ItemDescription>{option.description}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={1.8}
              className="size-4 text-muted-foreground"
            />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
