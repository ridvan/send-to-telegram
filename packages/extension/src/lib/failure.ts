import { isTopicUnavailable, TelegramError } from '@send-to-telegram/core';
import { z } from 'zod';

import { ComposeError } from './compose.ts';

export const failureReasonSchema = z.enum([
  'no_destination',
  'unauthorized',
  'chat_unavailable',
  'rate_limited',
  'network',
  'rejected',
  'unsendable',
  'locked',
]);

export type FailureReason = z.infer<typeof failureReasonSchema>;

/** A send that did not reach Telegram, with copy that says what to do next. */
export class SendFailure extends Error {
  override name = 'SendFailure';
  readonly reason: FailureReason;

  constructor(reason: FailureReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.reason = reason;
  }
}

export const failureCopy = {
  no_destination: 'Connect Telegram first, then send again.',
  locked:
    'Send to Telegram is locked. Unlock it with your password, then send again.',
  bot_unauthorized:
    'Telegram rejected the bot token. It may have been revoked in BotFather. Update it in settings.',
  chat_unavailable:
    'The bot can’t post to this chat. Open the chat in Telegram and press Start, or add the bot back to the group.',
  topic_unavailable:
    'The topic was closed or deleted. Reopen it in Telegram, or choose another one in settings.',
  rate_limited: 'Telegram is limiting messages. Try again in a few seconds.',
  network: 'Couldn’t reach Telegram. Check your connection and try again.',
  attachment_missing:
    'The file is no longer saved. Attach it again from the popup.',
} as const;

function telegramFailure(error: TelegramError): SendFailure {
  const options = { cause: error };

  if (error.code === 0) {
    return new SendFailure('network', failureCopy.network, options);
  }

  if (error.code === 401) {
    return new SendFailure(
      'unauthorized',
      failureCopy.bot_unauthorized,
      options
    );
  }

  if (error.code === 403 || /chat not found/i.test(error.message)) {
    return new SendFailure(
      'chat_unavailable',
      failureCopy.chat_unavailable,
      options
    );
  }

  if (isTopicUnavailable(error)) {
    return new SendFailure(
      'chat_unavailable',
      failureCopy.topic_unavailable,
      options
    );
  }

  if (error.code === 429) {
    return new SendFailure('rate_limited', failureCopy.rate_limited, options);
  }

  return new SendFailure(
    'rejected',
    `Telegram didn’t accept the message: ${error.message.replace(/^Bad Request: /, '')}`,
    options
  );
}

/** Normalizes anything thrown while sending into a SendFailure. */
export function toSendFailure(cause: unknown): SendFailure {
  if (cause instanceof SendFailure) return cause;

  if (cause instanceof TelegramError) return telegramFailure(cause);

  if (cause instanceof ComposeError) {
    return new SendFailure('unsendable', cause.message, { cause });
  }

  return new SendFailure('network', failureCopy.network, { cause });
}
