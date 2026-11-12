import { TelegramError } from '@send-to-telegram/core';
import { describe, expect, it } from 'vitest';

import { failureCopy, toSendFailure } from './failure.ts';

describe('toSendFailure', () => {
  it('says how to fix a topic that was deleted or closed', () => {
    for (const description of [
      'Bad Request: message thread not found',
      'Bad Request: TOPIC_CLOSED',
    ]) {
      expect(toSendFailure(new TelegramError(400, description))).toMatchObject({
        reason: 'chat_unavailable',
        message: failureCopy.topic_unavailable,
      });
    }
  });

  it('keeps other refusals as Telegram words them', () => {
    expect(
      toSendFailure(new TelegramError(400, 'Bad Request: message is too long'))
        .message
    ).toBe('Telegram didn’t accept the message: message is too long');
  });
});
