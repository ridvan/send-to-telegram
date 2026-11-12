import { ArrowUpRight01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  botTokenSchema,
  chatIdSchema,
  chatTitle,
} from '@send-to-telegram/core';
import { useId, useRef, useState } from 'react';

import { ChatAvatar } from '@/components/chat-avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { usePoll } from '@/hooks/use-poll';
import {
  findChats,
  type FoundChat,
  foundChatKey,
  lookUpChat,
  sendTestMessage,
  verifyToken,
} from '@/lib/bot-setup';
import { toSendFailure } from '@/lib/failure';
import { chatTypeLabel } from '@/lib/format';
import { type BotDestination, topicName } from '@/lib/settings';

import { BotFatherChat } from './illustrations';
import { Steps, Step } from './steps';
import { TextLink } from './text-link';

type TokenState =
  | { name: 'empty' }
  | { name: 'checking' }
  | { name: 'valid'; token: string; username: string }
  | { name: 'invalid'; message: string };

const FORMAT_HINT =
  'A token looks like 123456789:AAH4… Copy the whole line BotFather sent.';

/** "Group › Topic" for a topic, as destinations are named. */
function foundTitle({ chat, topic }: FoundChat) {
  return topic ? `${chatTitle(chat)} › ${topicName(topic)}` : chatTitle(chat);
}

function foundDescription({ chat, topic }: FoundChat) {
  const type = chatTypeLabel[chat.type];

  if (topic) return `Topic · ${type}`;

  if (chat.is_forum) return `${type} · General`;

  return chat.username ? `${type} · @${chat.username}` : type;
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : toSendFailure(cause).message;
}

/**
 * Connects a bot the person owns: check the token, find the chat from the
 * bot's recent updates, then prove it works with a test message.
 */
export function ConnectBot({
  onConnected,
}: {
  onConnected: (destination: BotDestination) => void;
}) {
  const tokenId = useId();
  const chatIdInput = useId();
  const latestCheck = useRef(0);
  const [token, setToken] = useState('');
  const [tokenState, setTokenState] = useState<TokenState>({ name: 'empty' });
  const [chats, setChats] = useState<FoundChat[]>([]);
  const [webhook, setWebhook] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualError, setManualError] = useState<string>();
  const [checkingManual, setCheckingManual] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string>();

  const valid = tokenState.name === 'valid' ? tokenState : undefined;
  const selected = chats.find((found) => foundChatKey(found) === selectedId);

  async function check(value: string, strict: boolean) {
    const parsed = botTokenSchema.safeParse(value);
    const attempt = ++latestCheck.current;

    if (!parsed.success) {
      setTokenState(
        value.trim() && strict
          ? { name: 'invalid', message: FORMAT_HINT }
          : { name: 'empty' }
      );

      return;
    }

    setTokenState({ name: 'checking' });

    try {
      const username = await verifyToken(parsed.data);

      if (attempt === latestCheck.current) {
        setTokenState({ name: 'valid', token: parsed.data, username });
      }
    } catch (cause) {
      if (attempt === latestCheck.current) {
        setTokenState({ name: 'invalid', message: messageOf(cause) });
      }
    }
  }

  usePoll(
    async () => {
      if (!valid) return;

      const lookup = await findChats(valid.token);

      if (lookup.status === 'webhook') {
        setWebhook(true);

        return;
      }

      setChats((known) => {
        const fresh = new Map(
          lookup.chats.map((found) => [foundChatKey(found), found])
        );

        // A topic first seen without its name takes one learned later.
        const updated = known.map((item) => {
          const later = fresh.get(foundChatKey(item));

          return item.topic && !item.topic.name && later?.topic?.name
            ? later
            : item;
        });

        const keys = new Set(known.map(foundChatKey));

        return [
          ...updated,
          ...lookup.chats.filter((found) => !keys.has(foundChatKey(found))),
        ];
      });
      setSelectedId(
        (current) =>
          current ?? (lookup.chats[0] && foundChatKey(lookup.chats[0]))
      );
    },
    2500,
    valid !== undefined && !webhook
  );

  async function addManualChat() {
    if (!valid) return;

    const parsed = chatIdSchema.safeParse(manualId.trim());

    if (!parsed.success) {
      setManualError(
        'Enter a number like 123456789, or a channel’s @username.'
      );

      return;
    }

    setCheckingManual(true);
    setManualError(undefined);

    try {
      const chatId = /^-?\d+$/.test(String(parsed.data))
        ? Number(parsed.data)
        : parsed.data;

      const chat = await lookUpChat(valid.token, chatId);

      const found = { chat };

      setChats((known) => [
        found,
        ...known.filter((item) => foundChatKey(item) !== foundChatKey(found)),
      ]);
      setSelectedId(foundChatKey(found));
      setManualId('');
    } catch (cause) {
      setManualError(messageOf(cause));
    } finally {
      setCheckingManual(false);
    }
  }

  async function connect() {
    if (!valid || !selected) return;

    setConnecting(true);
    setConnectError(undefined);

    try {
      const { chat, topic } = selected;

      await sendTestMessage(valid.token, chat.id, topic?.id);
      onConnected({
        id: crypto.randomUUID(),
        kind: 'bot',
        token: valid.token,
        chatId: chat.id,
        chatTitle: chatTitle(chat),
        chatType: chat.type,
        ...(topic && { topic }),
        botUsername: valid.username,
      });
    } catch (cause) {
      setConnectError(messageOf(cause));
      setConnecting(false);
    }
  }

  const botLink = valid ? `https://t.me/${valid.username}` : '';

  return (
    <div className="flex flex-col gap-6">
      <Steps>
        <Step
          index={1}
          title="Create a bot"
          done={valid !== undefined}
          description={
            <>
              Open <TextLink href="https://t.me/BotFather">@BotFather</TextLink>
              , send <code className="font-mono text-xs">/newbot</code> and pick
              a name. Paste the token it replies with.
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {valid ? null : <BotFatherChat />}
            <Field data-invalid={tokenState.name === 'invalid'}>
              <FieldLabel htmlFor={tokenId}>Bot token</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={tokenId}
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value);
                    void check(event.target.value, false);
                  }}
                  onBlur={() => void check(token, true)}
                  placeholder="123456789:AAH4kYbPq…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={tokenState.name === 'invalid'}
                  code
                />
                <InputGroupAddon align="inline-end">
                  {tokenState.name === 'checking' ? <Spinner /> : null}
                  {valid ? (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="text-success"
                    />
                  ) : null}
                </InputGroupAddon>
              </InputGroup>
              {tokenState.name === 'invalid' ? (
                <FieldError>{tokenState.message}</FieldError>
              ) : (
                <FieldDescription>
                  {valid
                    ? `Works for @${valid.username}.`
                    : 'Keep it private. Anyone with it can post as your bot.'}
                </FieldDescription>
              )}
            </Field>
          </div>
        </Step>

        <Step
          index={2}
          title="Choose a chat"
          active={valid !== undefined}
          done={selected !== undefined}
          description={
            valid ? (
              <>
                Open <TextLink href={botLink}>{`@${valid.username}`}</TextLink>{' '}
                and press Start, or add it to a group or channel. For a topic,
                write in it.
              </>
            ) : undefined
          }
        >
          {valid ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={botLink} target="_blank" rel="noreferrer" />}
                >
                  {`Open @${valid.username}`}
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    strokeWidth={2}
                    data-icon="inline-end"
                  />
                </Button>
                <Button
                  variant="ghost"
                  tone="muted"
                  nativeButton={false}
                  render={
                    <a
                      href={`${botLink}?startgroup=true`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  Add to a group
                </Button>
              </div>

              {chats.length > 0 ? (
                <div className="animate-rise">
                  <RadioGroup
                    aria-label="Chat"
                    value={selectedId ?? ''}
                    onValueChange={(value) => setSelectedId(String(value))}
                  >
                    {chats.map((found) => {
                      const key = foundChatKey(found);
                      const id = `${tokenId}-chat-${key}`;
                      const title = foundTitle(found);

                      return (
                        <FieldLabel key={key} htmlFor={id}>
                          <Field orientation="horizontal">
                            <ChatAvatar name={title} size="sm" />
                            <FieldContent>
                              <FieldTitle>{title}</FieldTitle>
                              <FieldDescription>
                                {foundDescription(found)}
                              </FieldDescription>
                            </FieldContent>
                            <RadioGroupItem value={key} id={id} />
                          </Field>
                        </FieldLabel>
                      );
                    })}
                  </RadioGroup>
                </div>
              ) : null}

              {webhook ? (
                <Alert>
                  <AlertDescription>
                    This bot sends its updates to a webhook, so its chats can’t
                    be listed here. Enter the chat ID instead.
                  </AlertDescription>
                </Alert>
              ) : chats.length === 0 ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Spinner />
                  {`Waiting for a message to @${valid.username}`}
                </p>
              ) : null}

              <Collapsible
                open={manualOpen || webhook}
                onOpenChange={setManualOpen}
              >
                {webhook ? null : (
                  <CollapsibleTrigger
                    render={<Button variant="link" size="text" tone="muted" />}
                  >
                    Enter a chat ID instead
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent>
                  <div className="pt-3">
                    <Field data-invalid={manualError !== undefined}>
                      <FieldLabel htmlFor={chatIdInput}>Chat ID</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id={chatIdInput}
                          value={manualId}
                          onChange={(event) => setManualId(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void addManualChat();
                          }}
                          placeholder="-1001234567890"
                          spellCheck={false}
                          code
                          aria-invalid={manualError !== undefined}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            onClick={() => void addManualChat()}
                            disabled={checkingManual || !manualId.trim()}
                          >
                            {checkingManual ? <Spinner /> : null}
                            Find chat
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                      {manualError ? (
                        <FieldError>{manualError}</FieldError>
                      ) : (
                        <FieldDescription>
                          Groups and channels start with -100. The bot must
                          already be a member.
                        </FieldDescription>
                      )}
                    </Field>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : null}
        </Step>
      </Steps>

      {connectError ? (
        <Alert variant="destructive">
          <AlertDescription>{connectError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button
          onClick={() => void connect()}
          disabled={!selected || connecting}
        >
          {connecting ? <Spinner data-icon="inline-start" /> : null}
          Connect and send a test
        </Button>
      </div>
    </div>
  );
}
