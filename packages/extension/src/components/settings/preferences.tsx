import {
  ArrowUpRight01Icon,
  BubbleChatIcon,
  Clock01Icon,
  ComputerIcon,
  Delete02Icon,
  Globe02Icon,
  HashtagIcon,
  Image02Icon,
  KeyboardIcon,
  Link04Icon,
  Moon02Icon,
  NotificationOff01Icon,
  RotateLeft01Icon,
  Sun03Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useId, useState } from 'react';
import { browser } from 'wxt/browser';

import {
  type SettingIcon,
  SettingRow,
  SettingsSection,
} from '@/components/setting-row';
import {
  canOpenShortcutSettings,
  openShortcutSettings,
  useShortcuts,
} from '@/components/shortcuts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useStore } from '@/hooks/use-store';
import { plural } from '@/lib/format';
import { forgetFiles } from '@/lib/telegram-files';
import {
  type HistoryMode,
  historyModeSchema,
  historyStore,
  type ImageMode,
  inboxRemovedStore,
  inboxStore,
  imageModeSchema,
  type Settings,
  settingsStore,
  statsStore,
  type Theme,
  themeSchema,
} from '@/lib/settings';

import { TagEditor } from './tag-editor';

function update(change: (settings: Settings) => Settings) {
  return settingsStore.update(change);
}

function setDelivery<K extends keyof Settings['delivery']>(
  key: K,
  value: Settings['delivery'][K]
) {
  return update((settings) => ({
    ...settings,
    delivery: { ...settings.delivery, [key]: value },
  }));
}

function SwitchRow({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  icon: SettingIcon;
  label: string;
  description?: string | undefined;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <SettingRow
      icon={icon}
      label={label}
      description={description}
      htmlFor={id}
      control={
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      }
    />
  );
}

const imageModes = {
  photo: { label: 'Photo', description: 'Shown in the chat, compressed.' },
  document: {
    label: 'File',
    description: 'Full quality, opens from the chat.',
  },
  link: { label: 'Link', description: 'Only the address, with a preview.' },
} satisfies Record<ImageMode, { label: string; description: string }>;

export function MessagesSection() {
  const { delivery, composer } = useStore(settingsStore);

  return (
    <SettingsSection id="messages" title="Messages">
      <SwitchRow
        icon={{ icon: Globe02Icon, tone: 'pink' }}
        label="Attach the page link"
        description="Sends the page’s link, or its “Open page” button, with your note."
        checked={composer.attachPage}
        onCheckedChange={(attachPage) =>
          void update((settings) => ({
            ...settings,
            composer: { ...settings.composer, attachPage },
          }))
        }
      />
      <SwitchRow
        icon={{ icon: NotificationOff01Icon, tone: 'orange' }}
        label="Send silently"
        checked={delivery.silent}
        onCheckedChange={(value) => void setDelivery('silent', value)}
      />
      <SwitchRow
        icon={{ icon: Link04Icon, tone: 'blue' }}
        label="Show link previews"
        checked={delivery.linkPreview}
        onCheckedChange={(value) => void setDelivery('linkPreview', value)}
      />
      <SwitchRow
        icon={{ icon: ArrowUpRight01Icon, tone: 'violet' }}
        label="Add an “Open page” button"
        checked={delivery.sourceButton}
        onCheckedChange={(value) => void setDelivery('sourceButton', value)}
      />
      <SettingRow
        icon={{ icon: Image02Icon, tone: 'green' }}
        label="Send images as"
        wide
        description={imageModes[delivery.imageMode].description}
        control={
          <ToggleGroup
            variant="segmented"
            size="sm"
            aria-label="Send images as"
            value={[delivery.imageMode]}
            onValueChange={([next]) => {
              const mode = imageModeSchema.safeParse(next);

              if (mode.success) void setDelivery('imageMode', mode.data);
            }}
          >
            {imageModeSchema.options.map((mode) => (
              <ToggleGroupItem key={mode} value={mode}>
                {imageModes[mode].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
    </SettingsSection>
  );
}

export function TagsSection() {
  const { tags } = useStore(settingsStore);

  return (
    <SettingsSection id="hashtags" title="Hashtags">
      <SwitchRow
        icon={{ icon: HashtagIcon, tone: 'cyan' }}
        label="Suggest hashtags"
        description="In the right-click menu, and as you type # in a note."
        checked={tags.enabled}
        onCheckedChange={(enabled) =>
          void update((settings) => ({
            ...settings,
            tags: { ...settings.tags, enabled },
          }))
        }
      />
      {tags.enabled ? (
        <SettingRow label="Your hashtags">
          <TagEditor
            tags={tags.list}
            onChange={(list) =>
              void update((settings) => ({
                ...settings,
                tags: { ...settings.tags, list },
              }))
            }
          />
        </SettingRow>
      ) : null}
    </SettingsSection>
  );
}

const historyModes = {
  full: { label: 'Everything', description: 'Find and resend anything.' },
  minimal: {
    label: 'Times only',
    description: 'When and what kind, no content.',
  },
  off: { label: 'Off', description: 'Nothing new is kept.' },
} satisfies Record<HistoryMode, { label: string; description: string }>;

export function HistorySection() {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const inbox = useStore(inboxStore);
  const stats = useStore(statsStore);
  const mode = settings.history.mode;

  const hasOwnBot = settings.destinations.some(
    (destination) => destination.kind === 'bot'
  );

  // Messages sent to your bot are kept with history and cleared with it.
  const kept = history.length + inbox.length;

  return (
    <SettingsSection
      id="history-settings"
      title="History"
      description="Kept only in this browser, and never for private windows."
    >
      <SettingRow
        icon={{ icon: Clock01Icon, tone: 'pink' }}
        label="Keep"
        wide
        description={historyModes[mode].description}
        control={
          <ToggleGroup
            variant="segmented"
            size="sm"
            aria-label="Keep in history"
            value={[mode]}
            onValueChange={([next]) => {
              const parsed = historyModeSchema.safeParse(next);

              if (parsed.success) {
                void update((current) => ({
                  ...current,
                  history: { ...current.history, mode: parsed.data },
                }));
              }
            }}
          >
            {historyModeSchema.options.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {historyModes[option].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      {/* Other modes keep no content to draw. */}
      {mode === 'full' ? (
        <SwitchRow
          icon={{ icon: BubbleChatIcon, tone: 'blue' }}
          label="Show earlier messages in the chat"
          description={
            hasOwnBot
              ? 'Includes what you send to your bot from Telegram.'
              : undefined
          }
          checked={settings.history.showInChat}
          onCheckedChange={(showInChat) =>
            void update((current) => ({
              ...current,
              history: { ...current.history, showInChat },
            }))
          }
        />
      ) : null}
      <SettingRow
        icon={{ icon: Delete02Icon, tone: 'red' }}
        label="Clear history"
        description={`${plural(kept, { one: '# item', other: '# items' })}, ${plural(stats.sent, { one: '# sent in all', other: '# sent in all' })}`}
        control={
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" size="sm" disabled={kept === 0} />
              }
            >
              Clear history
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear history?</AlertDialogTitle>
                <AlertDialogDescription>
                  {`This deletes ${plural(kept, { one: '# item', other: '# items' })} from this browser. It can’t be undone. Messages in Telegram stay.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    void Promise.all([
                      historyStore.set([]),
                      inboxStore.set([]),
                      inboxRemovedStore.set([]),
                      forgetFiles(),
                    ])
                  }
                >
                  Clear history
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />
    </SettingsSection>
  );
}

const themes = {
  system: { label: 'System', icon: ComputerIcon },
  light: { label: 'Light', icon: Sun03Icon },
  dark: { label: 'Dark', icon: Moon02Icon },
} satisfies Record<Theme, { label: string; icon: typeof Sun03Icon }>;

function ResetRow({ onReset }: { onReset: () => void }) {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const [resetting, setResetting] = useState(false);

  return (
    <SettingRow
      icon={{ icon: RotateLeft01Icon, tone: 'red' }}
      label="Reset Send to Telegram"
      description="Removes chats, settings and history."
      control={
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="destructive" size="sm" />}
          >
            Reset
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Send to Telegram?</AlertDialogTitle>
              <AlertDialogDescription>
                {`This removes ${plural(settings.destinations.length, { one: '# chat', other: '# chats' })}, your settings and ${plural(history.length, { one: '# history item', other: '# history items' })} from this browser. It can’t be undone. Messages in Telegram stay.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);
                  await browser.storage.local.clear();
                  // Received photos are cached apart from storage.
                  await forgetFiles();
                  onReset();
                }}
              >
                Reset everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      }
    />
  );
}

/** `onReset` runs once storage is cleared, to leave a page that needs chats. */
export function GeneralSection({ onReset }: { onReset: () => void }) {
  const { appearance } = useStore(settingsStore);
  const shortcuts = useShortcuts();

  return (
    <SettingsSection id="general" title="General">
      <SettingRow
        icon={{ icon: Moon02Icon, tone: 'violet' }}
        label="Appearance"
        wide
        control={
          <ToggleGroup
            variant="segmented"
            size="sm"
            aria-label="Appearance"
            value={[appearance.theme]}
            onValueChange={([next]) => {
              const theme = themeSchema.safeParse(next);

              if (theme.success) {
                void update((settings) => ({
                  ...settings,
                  appearance: { ...settings.appearance, theme: theme.data },
                }));
              }
            }}
          >
            {themeSchema.options.map((theme) => (
              <ToggleGroupItem key={theme} value={theme}>
                <HugeiconsIcon
                  icon={themes[theme].icon}
                  strokeWidth={1.8}
                  data-icon="inline-start"
                />
                {themes[theme].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      <SettingRow
        icon={{ icon: KeyboardIcon, tone: 'blue' }}
        label="Keyboard shortcuts"
        description={
          canOpenShortcutSettings
            ? undefined
            : 'Change them in Add-ons and Themes: open the gear menu and choose Manage Extension Shortcuts.'
        }
        control={
          canOpenShortcutSettings ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openShortcutSettings()}
            >
              Change shortcuts
            </Button>
          ) : undefined
        }
      >
        {shortcuts.length > 0 ? (
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.name} className="contents">
                <dt className="text-muted-foreground">
                  {shortcut.description}
                </dt>
                <dd>
                  {shortcut.keys ? (
                    <Kbd>{shortcut.keys}</Kbd>
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </SettingRow>
      <ResetRow onReset={onReset} />
    </SettingsSection>
  );
}
