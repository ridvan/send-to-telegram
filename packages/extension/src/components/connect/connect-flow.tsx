import { useState } from 'react';

import { hasRelay } from '@/lib/relay';
import type { Destination } from '@/lib/settings';

import { ConnectBot } from './connect-bot';
import { ConnectRelay } from './connect-relay';

/**
 * Starts with the quickest way to connect: the hosted bot when there is one.
 * Each setup links to the other, so nobody has to choose before they start.
 */
export function ConnectFlow({
  onConnected,
}: {
  onConnected: (destination: Destination) => void;
}) {
  const [method, setMethod] = useState<'relay' | 'bot'>(
    hasRelay ? 'relay' : 'bot'
  );

  if (method === 'relay') {
    return (
      <ConnectRelay
        onConnected={onConnected}
        onUseOwnBot={() => setMethod('bot')}
      />
    );
  }

  return (
    <ConnectBot
      onConnected={onConnected}
      {...(hasRelay && { onUseRelay: () => setMethod('relay') })}
    />
  );
}
