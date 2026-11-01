import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';

import { Article } from '@/components/article';
import { links } from '@/lib/links';

const questions: { question: string; answer: ReactNode }[] = [
  {
    question: 'Which browsers does it work in?',
    answer: (
      <p>
        Chrome and Edge. Other browsers built on Chromium, such as Brave and
        Arc, can install it from the Chrome Web Store too. A Firefox version is
        on its way.
      </p>
    ),
  },
  {
    question: 'Do I need to create a Telegram bot?',
    answer: (
      <p>
        No. With S2T Relay, you press Start in Telegram and the chat is linked
        in seconds. Create your own bot with{' '}
        <a href={links.botFather}>@BotFather</a> when you want what’s sent to
        the chat to show up in the popup, or to send files.
      </p>
    ),
  },
  {
    question: 'Can S2T Relay read what I send?',
    answer: (
      <p>
        It passes your messages on to Telegram, but never stores or logs them,
        and <a href={links.relay}>its code is public</a>. If you’d rather
        nothing sits in between, use your own bot: the extension then talks to
        Telegram directly. The <a href="/privacy">privacy policy</a> lists
        everything the relay keeps.
      </p>
    ),
  },
  {
    question: 'Can I send to a group or a channel?',
    answer: (
      <p>
        Yes. Connect as many chats as you like, and the right-click menu asks
        which one to send to. To send to a channel with your own bot, make the
        bot an admin there.
      </p>
    ),
  },
  {
    question: 'Can I send files?',
    answer: (
      <p>
        With your own bot, yes: attach one in the popup, or paste or drop it in.
        S2T Relay sends text, links, pages and images.
      </p>
    ),
  },
  {
    question: 'Why does it ask for access to api.telegram.org?',
    answer: (
      <p>
        The first time you open a photo, video or file sent to your own bot, the
        extension asks to download it from Telegram so it can show it in the
        popup. It’s optional, and nothing else needs it.
      </p>
    ),
  },
  {
    question: 'I forgot my lock password. What now?',
    answer: (
      <p>
        On the lock screen, choose Forgot your password and enter the recovery
        code you saved when you turned on the lock. Without the password or the
        code, your data can’t be read: you can reset the extension there, which
        removes your chats, settings and history from this browser. Messages in
        Telegram stay.
      </p>
    ),
  },
  {
    question: 'I used version 1. Do my settings move over?',
    answer: (
      <p>
        Yes. Your chats, hashtags and history move over automatically when the
        extension updates.
      </p>
    ),
  },
  {
    question: 'Is it free?',
    answer: (
      <p>
        Yes, and open source under the MIT license. There’s no account, no ads
        and no paid plan.
      </p>
    ),
  },
  {
    question: 'Can I host the relay myself?',
    answer: (
      <p>
        Yes. It runs on Cloudflare Workers, and{' '}
        <a href={links.relay}>its README</a> walks through setting it up. Build
        the extension with WXT_RELAY_URL set to your relay’s address.
      </p>
    ),
  },
  {
    question: 'Something’s broken. Where do I report it?',
    answer: (
      <p>
        <a href={links.issues}>Open an issue on GitHub</a> with what you did and
        what happened. Ideas are welcome there too.
      </p>
    ),
  },
];

export function Faq() {
  return (
    <Article
      title="Questions and answers"
      lede="What people ask about the extension, S2T Relay and connecting your own bot."
    >
      <div className="flex flex-col border-b">
        {questions.map((item) => (
          <details key={item.question} className="group border-t">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium select-none [&::-webkit-details-marker]:hidden">
              {item.question}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={2}
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="pb-5 leading-relaxed text-pretty text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4">
              {item.answer}
            </div>
          </details>
        ))}
      </div>
    </Article>
  );
}
