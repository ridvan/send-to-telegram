import { useId, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useStore } from '@/hooks/use-store';
import {
  findChats,
  lookUpChat,
  parseTopicLink,
  sendTestMessage,
} from '@/lib/bot-setup';
import { updateDestination } from '@/lib/destinations';
import { toSendFailure } from '@/lib/failure';
import { isSameChat } from '@/lib/inbox';
import {
  type Destination,
  destinationName,
  isSamePlace,
  settingsStore,
  type Topic,
  topicName,
} from '@/lib/settings';

/** The radio value for General, which is the chat itself. */
const GENERAL = 'general';

function messageOf(cause: unknown) {
  return toSendFailure(cause).message;
}

/**
 * Points a group chat at one of its topics, or back at General. Bots can't
 * list topics, so the ones people write in show up as they do; a pasted link
 * covers bots that can't see those messages.
 */
export function TopicDialog({
  destination,
  onClose,
}: {
  destination: Destination;
  onClose: () => void;
}) {
  const formId = useId();
  const linkId = useId();
  const settings = useStore(settingsStore);
  const [forum, setForum] = useState<boolean>();
  const [lookupError, setLookupError] = useState<string>();
  const [webhook, setWebhook] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const [topics, setTopics] = useState<Topic[]>(
    destination.topic ? [destination.topic] : []
  );

  const [selected, setSelected] = useState(
    destination.topic ? String(destination.topic.id) : GENERAL
  );

  const chatName = destination.chatTitle ?? `Chat ${destination.chatId}`;

  /** Adds topics not listed yet; a name learned later fills in a number. */
  function addTopics(found: Topic[]) {
    setTopics((known) => {
      const next = [...known];

      for (const topic of found) {
        const index = next.findIndex((item) => item.id === topic.id);

        if (index === -1) next.push(topic);
        else if (topic.name) next[index] = topic;
      }

      return next;
    });
  }

  usePoll(
    async () => {
      if (forum === undefined) {
        // Shown rather than waited on: a bot removed from the group, a revoked
        // token or no connection would otherwise wait for good. Tried again
        // on the next poll, so the error clears once it's fixed.
        let chat;

        try {
          chat = await lookUpChat(destination.token, destination.chatId);
        } catch (cause) {
          setLookupError(
            cause instanceof Error ? cause.message : messageOf(cause)
          );

          return;
        }

        setLookupError(undefined);
        setForum(chat.is_forum === true);

        if (!chat.is_forum) return;
      }

      const lookup = await findChats(destination.token);

      if (lookup.status === 'webhook') {
        setWebhook(true);

        return;
      }

      addTopics(
        lookup.chats.flatMap(({ chat, topic }) =>
          topic && isSameChat(chat, destination.chatId) ? [topic] : []
        )
      );
    },
    2500,
    forum !== false && !webhook
  );

  function addLink() {
    const parsed = parseTopicLink(link, destination.chatId);

    if (!parsed.ok) {
      setLinkError(parsed.message);

      return;
    }

    setLinkError(undefined);
    addTopics([{ id: parsed.id }]);
    setSelected(String(parsed.id));
    setLink('');
  }

  async function save() {
    const topic =
      selected === GENERAL
        ? null
        : (topics.find((item) => String(item.id) === selected) ?? null);

    const { topic: _previous, ...rest } = destination;
    const moved = topic ? { ...rest, topic } : rest;

    const taken = settings.destinations.find(
      (other) => other.id !== destination.id && isSamePlace(other, moved)
    );

    if (taken) {
      setSaveError(
        `“${destinationName(taken)}” already sends there. Choose another topic, or remove that chat first.`
      );

      return;
    }

    setSaving(true);
    setSaveError(undefined);

    try {
      await sendTestMessage(destination.token, destination.chatId, topic?.id);
      await updateDestination(destination.id, { topic });
      toast.success(`Test message sent to ${destinationName(moved)}`);
      onClose();
    } catch (cause) {
      setSaveError(messageOf(cause));
      setSaving(false);
    }
  }

  const waiting =
    forum !== false && !webhook && !lookupError && topics.length === 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a topic</DialogTitle>
          <DialogDescription>
            {`Send to one topic of ${chatName}. Write a message in the topic you want, and it shows up here.`}
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <RadioGroup
            aria-label="Topic"
            value={selected}
            onValueChange={(value) => {
              setSelected(String(value));
              setSaveError(undefined);
            }}
          >
            <FieldLabel htmlFor={`${formId}-general`}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>General</FieldTitle>
                  <FieldDescription>The group’s main chat</FieldDescription>
                </FieldContent>
                <RadioGroupItem value={GENERAL} id={`${formId}-general`} />
              </Field>
            </FieldLabel>
            {topics.map((topic) => {
              const id = `${formId}-topic-${topic.id}`;

              return (
                <FieldLabel key={topic.id} htmlFor={id}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{topicName(topic)}</FieldTitle>
                      {topic.name ? (
                        <FieldDescription>{`Topic ${topic.id}`}</FieldDescription>
                      ) : null}
                    </FieldContent>
                    <RadioGroupItem value={String(topic.id)} id={id} />
                  </Field>
                </FieldLabel>
              );
            })}
          </RadioGroup>

          {forum === false ? (
            <Alert>
              <AlertDescription>
                This group has no topics. Turn them on in the group’s settings
                in Telegram, then try again.
              </AlertDescription>
            </Alert>
          ) : webhook ? (
            <Alert>
              <AlertDescription>
                This bot sends its updates to a webhook, so topics can’t be
                found here. Paste the topic’s link instead.
              </AlertDescription>
            </Alert>
          ) : lookupError ? (
            <Alert variant="destructive">
              <AlertDescription>{lookupError}</AlertDescription>
            </Alert>
          ) : waiting ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Spinner />
              Waiting for a message in a topic
            </p>
          ) : null}
        </form>

        {forum === false ? null : (
          <Collapsible open={linkOpen || webhook} onOpenChange={setLinkOpen}>
            {webhook ? null : (
              <CollapsibleTrigger
                render={<Button variant="link" size="text" tone="muted" />}
              >
                Paste a topic link instead
              </CollapsibleTrigger>
            )}
            <CollapsibleContent>
              <div className="pt-3">
                <Field data-invalid={linkError !== undefined}>
                  <FieldLabel htmlFor={linkId}>Topic link</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={linkId}
                      value={link}
                      onChange={(event) => setLink(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addLink();
                      }}
                      placeholder="https://t.me/c/1234567890/42"
                      spellCheck={false}
                      code
                      aria-invalid={linkError !== undefined}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        onClick={addLink}
                        disabled={!link.trim()}
                      >
                        Add topic
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {linkError ? (
                    <FieldError>{linkError}</FieldError>
                  ) : (
                    <FieldDescription>
                      In Telegram, right-click the topic and copy its link.
                    </FieldDescription>
                  )}
                </Field>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Save and send a test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
