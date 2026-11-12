import type { IncomingMessage, Update } from '@send-to-telegram/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { findChats, parseTopicLink, topicNamesIn } from './bot-setup.ts';

const group = {
  id: -100123,
  type: 'supergroup',
  title: 'Design crit',
  is_forum: true,
} as const;

function inTopic(
  id: number,
  messageId: number,
  fields: Partial<IncomingMessage> = {}
): Update {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      chat: group,
      message_thread_id: id,
      is_topic_message: true,
      ...fields,
    },
  };
}

describe('topicNamesIn', () => {
  it('names topics from their first message, a rename, or a reply', () => {
    const names = topicNamesIn([
      inTopic(50, 50, { forum_topic_created: { name: 'Reviews' } }),
      inTopic(50, 51, { forum_topic_edited: { name: 'Crit reviews' } }),
      // Still carries the first name after the rename.
      inTopic(50, 52, {
        text: 'Hi',
        reply_to_message: {
          message_id: 50,
          forum_topic_created: { name: 'Reviews' },
        },
      }),
      inTopic(60, 61, {
        text: 'Specs',
        reply_to_message: {
          message_id: 60,
          forum_topic_created: { name: 'Handoff' },
        },
      }),
      // A reply to another message names nothing.
      inTopic(70, 72, {
        reply_to_message: {
          message_id: 71,
          forum_topic_created: { name: 'Wrong' },
        },
      }),
    ]);

    expect([...names]).toEqual([
      ['-100123:50', 'Crit reviews'],
      ['-100123:60', 'Handoff'],
    ]);
  });
});

describe('findChats', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists a topic written in as its own chat, beside the group', async () => {
    const updates: Update[] = [
      {
        update_id: 1,
        my_chat_member: {
          chat: group,
          from: { id: 8, is_bot: false, first_name: 'Ana' },
          new_chat_member: { status: 'member' },
        },
      },
      inTopic(50, 51, {
        text: 'Hi',
        reply_to_message: {
          message_id: 50,
          forum_topic_created: { name: 'Reviews' },
        },
      }),
      inTopic(60, 61, { text: 'No name seen' }),
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ ok: true, result: updates }))
      )
    );

    const lookup = await findChats('1:x');

    expect(lookup).toEqual({
      status: 'ok',
      chats: [
        { chat: group, topic: { id: 60 } },
        { chat: group, topic: { id: 50, name: 'Reviews' } },
        { chat: group },
      ],
    });
  });
});

describe('parseTopicLink', () => {
  it('reads a topic from its link, a message link in it, or a number', () => {
    expect(parseTopicLink('https://t.me/c/123/42', -100123)).toEqual({
      ok: true,
      id: 42,
    });
    expect(parseTopicLink('t.me/c/123/42/108', -100123)).toEqual({
      ok: true,
      id: 42,
    });
    expect(parseTopicLink('https://t.me/designcrit/42', -100123)).toEqual({
      ok: true,
      id: 42,
    });
    expect(parseTopicLink(' 42 ', '@designcrit')).toEqual({ ok: true, id: 42 });
  });

  it('refuses other groups and anything else', () => {
    expect(parseTopicLink('https://t.me/c/999/42', -100123).ok).toBe(false);
    expect(parseTopicLink('https://t.me/other/42', '@designcrit').ok).toBe(
      false
    );
    expect(parseTopicLink('https://example.com/42', -100123).ok).toBe(false);
    expect(parseTopicLink('0', -100123).ok).toBe(false);
    expect(parseTopicLink('Reviews', -100123).ok).toBe(false);
  });
});
