import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useId, useState } from 'react';
import { browser } from 'wxt/browser';

import { SettingRow, SettingsSection } from '@/components/setting-row';
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
import {
  type HistoryMode,
  historyModeSchema,
  historyStore,
  type ImageMode,
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
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <SettingRow
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
  photo: {
    label: 'Photo',
    description: 'Shown right in the chat. Telegram compresses it.',
  },
  document: {
    label: 'File',
    description: 'Kept at full quality. Open it from the chat to view.',
  },
  link: {
    label: 'Link',
    description: 'Only the image’s address is sent, with a preview.',
  },
} satisfies Record<ImageMode, { label: string; description: string }>;

export function MessagesSection() {
  const { delivery } = useStore(settingsStore);

  return (
    <SettingsSection
      id="messages"
      title="Messages"
      description="How messages look when they arrive."
    >
      <SwitchRow
        label="Send silently"
        description="Messages arrive without a notification sound."
        checked={delivery.silent}
        onCheckedChange={(value) => void setDelivery('silent', value)}
      />
      <SwitchRow
        label="Show link previews"
        description="Telegram adds the page’s title and image under links."
        checked={delivery.linkPreview}
        onCheckedChange={(value) => void setDelivery('linkPreview', value)}
      />
      <SwitchRow
        label="Add an “Open page” button"
        description="Text, links and images get a button that opens the page they came from."
        checked={delivery.sourceButton}
        onCheckedChange={(value) => void setDelivery('sourceButton', value)}
      />
      <SettingRow
        label="Send images as"
        description={imageModes[delivery.imageMode].description}
        control={
          <ToggleGroup
            variant="outline"
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
    <SettingsSection
      id="hashtags"
      title="Hashtags"
      description="Tag messages so they’re easy to find in Telegram later."
    >
      <SwitchRow
        label="Offer hashtags"
        description="Pick one from the right-click menu or the popup when you send."
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
  full: {
    label: 'Everything',
    description: 'Keeps what you sent, so you can find it and send it again.',
  },
  minimal: {
    label: 'Times only',
    description:
      'Keeps when you sent something and what kind it was, not the content.',
  },
  off: {
    label: 'Off',
    description:
      'Nothing new is kept. Earlier history stays until you clear it.',
  },
} satisfies Record<HistoryMode, { label: string; description: string }>;

export function HistorySection() {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const stats = useStore(statsStore);
  const mode = settings.history.mode;

  return (
    <SettingsSection
      id="history-settings"
      title="History"
      description="Kept only in this browser, and never for private windows."
    >
      <SettingRow
        label="Keep"
        description={historyModes[mode].description}
        control={
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="Keep in history"
            value={[mode]}
            onValueChange={([next]) => {
              const parsed = historyModeSchema.safeParse(next);

              if (parsed.success) {
                void update((current) => ({
                  ...current,
                  history: { mode: parsed.data },
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
      <SettingRow
        label="Clear history"
        description={`${plural(history.length, { one: '# item is', other: '# items are' })} in history. ${plural(stats.sent, { one: '# message', other: '# messages' })} sent in all.`}
        control={
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={history.length === 0}
                />
              }
            >
              Clear history
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear history?</AlertDialogTitle>
                <AlertDialogDescription>
                  {`This deletes ${plural(history.length, { one: '# item', other: '# items' })} from this browser. It can’t be undone. Messages in Telegram stay.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void historyStore.set([])}
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

function ResetRow() {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const [resetting, setResetting] = useState(false);

  return (
    <SettingRow
      label="Reset Send to Telegram"
      description="Removes your chats, settings and history from this browser."
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
                  location.assign(browser.runtime.getURL('/welcome.html'));
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

export function GeneralSection() {
  const { appearance } = useStore(settingsStore);
  const shortcuts = useShortcuts();

  return (
    <SettingsSection id="general" title="General">
      <SettingRow
        label="Appearance"
        control={
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="Appearance"
            value={[appearance.theme]}
            onValueChange={([next]) => {
              const theme = themeSchema.safeParse(next);

              if (theme.success) {
                void update((settings) => ({
                  ...settings,
                  appearance: { theme: theme.data },
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
      <ResetRow />
    </SettingsSection>
  );
}
