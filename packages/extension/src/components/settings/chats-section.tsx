import { Add01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { ChatAvatar } from '@/components/chat-avatar';
import { AvatarDialog } from '@/components/settings/avatar-dialog';
import { TopicDialog } from '@/components/settings/topic-dialog';
import { ConnectBot } from '@/components/connect/connect-bot';
import { SettingsSection } from '@/components/setting-row';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { useStore } from '@/hooks/use-store';
import {
  addDestination,
  makeDefault,
  removeDestination,
  sendTest,
  updateDestination,
} from '@/lib/destinations';
import { chatTypeLabel } from '@/lib/format';
import {
  avatarSeed,
  type Destination,
  destinationName,
  settingsStore,
} from '@/lib/settings';

function via(destination: Destination) {
  const type = destination.topic
    ? 'Topic'
    : destination.chatType
      ? chatTypeLabel[destination.chatType]
      : 'Chat';

  return destination.botUsername
    ? `${type} · @${destination.botUsername}`
    : `${type} · ${destination.chatId}`;
}

function RenameDialog({
  destination,
  onClose,
}: {
  destination: Destination;
  onClose: () => void;
}) {
  const inputId = useId();
  const [label, setLabel] = useState(destination.label ?? '');

  async function save() {
    await updateDestination(destination.id, { label });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>
            Only you see this name, in menus and history.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${inputId}-form`}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field>
            <FieldLabel htmlFor={inputId}>Name</FieldLabel>
            <Input
              id={inputId}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={destination.chatTitle ?? 'Saved links'}
              maxLength={64}
              autoFocus
            />
            <FieldDescription>
              Leave empty to use the chat’s name from Telegram.
            </FieldDescription>
          </Field>
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form={`${inputId}-form`}>
            Save name
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({
  destination,
  onClose,
}: {
  destination: Destination;
  onClose: () => void;
}) {
  const name = destinationName(destination);

  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Remove “${name}”?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This browser stops sending to the chat. Your bot and the messages
            already in Telegram stay as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              await removeDestination(destination);
              toast(`Removed ${name}`);
              onClose();
            }}
          >
            Remove chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type Editing = {
  action: 'rename' | 'avatar' | 'topic' | 'remove';
  destination: Destination;
};

function ChatRow({
  destination,
  isDefault,
  onEdit,
}: {
  destination: Destination;
  isDefault: boolean;
  onEdit: (editing: Editing) => void;
}) {
  const name = destinationName(destination);

  async function test() {
    const pending = toast.loading(`Sending a test message to ${name}`);

    try {
      await sendTest(destination);
      toast.success(`Test message sent to ${name}`, { id: pending });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : 'Couldn’t send the test message.',
        { id: pending }
      );
    }
  }

  return (
    <Item size="sm">
      <ItemMedia>
        <ChatAvatar
          name={name}
          seed={avatarSeed(destination)}
          avatar={destination.avatar}
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          <span className="truncate">{name}</span>
          {isDefault ? <Badge variant="secondary">Default</Badge> : null}
        </ItemTitle>
        <ItemDescription className="truncate">
          {via(destination)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${name}`}
              />
            }
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              {isDefault ? null : (
                <DropdownMenuItem
                  onClick={() => void makeDefault(destination.id)}
                >
                  Make default
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => void test()}>
                Send a test message
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onEdit({ action: 'rename', destination })}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onEdit({ action: 'avatar', destination })}
              >
                Change avatar
              </DropdownMenuItem>
              {destination.chatType === 'supergroup' || destination.topic ? (
                <DropdownMenuItem
                  onClick={() => onEdit({ action: 'topic', destination })}
                >
                  {destination.topic ? 'Change topic' : 'Choose a topic'}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onEdit({ action: 'remove', destination })}
              >
                Remove
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}

/**
 * Connecting opens Telegram in a tab, which closes the popup, so the popup
 * passes `onAdd` to hand off to the options page instead of the dialog here.
 */
export function ChatsSection({
  onAdd,
  addOnOpen = false,
}: {
  onAdd?: () => void;
  /** Opens the add dialog right away, for the popup's hand-off. */
  addOnOpen?: boolean;
}) {
  const settings = useStore(settingsStore);
  const [adding, setAdding] = useState(addOnOpen);
  const [editing, setEditing] = useState<Editing>();
  const destinations = settings.destinations;
  const defaultId = settings.defaultDestinationId ?? destinations[0]?.id;

  const addButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => (onAdd ? onAdd() : setAdding(true))}
    >
      <HugeiconsIcon
        icon={Add01Icon}
        strokeWidth={2}
        data-icon="inline-start"
      />
      Add chat
    </Button>
  );

  return (
    <SettingsSection
      id="chats"
      title="Chats"
      description="Where your messages arrive. With more than one, the right-click menu asks which to use."
      action={destinations.length > 0 ? addButton : undefined}
    >
      {destinations.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No chat connected</EmptyTitle>
            <EmptyDescription>
              Connect a chat to start sending pages, links and text to Telegram.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{addButton}</EmptyContent>
        </Empty>
      ) : (
        <ItemGroup>
          {destinations.map((destination) => (
            <ChatRow
              key={destination.id}
              destination={destination}
              isDefault={destination.id === defaultId}
              onEdit={setEditing}
            />
          ))}
        </ItemGroup>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-148">
          <DialogHeader>
            <DialogTitle>Add a chat</DialogTitle>
            <DialogDescription>
              Send to yourself, a group or a channel.
            </DialogDescription>
          </DialogHeader>
          <ConnectBot
            onConnected={async (destination) => {
              await addDestination(destination);
              setAdding(false);
              toast.success(`${destinationName(destination)} is connected`);
            }}
          />
        </DialogContent>
      </Dialog>

      {editing?.action === 'rename' ? (
        <RenameDialog
          destination={editing.destination}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {editing?.action === 'avatar' ? (
        <AvatarDialog
          destination={editing.destination}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {editing?.action === 'topic' ? (
        <TopicDialog
          destination={editing.destination}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {editing?.action === 'remove' ? (
        <RemoveDialog
          destination={editing.destination}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </SettingsSection>
  );
}
