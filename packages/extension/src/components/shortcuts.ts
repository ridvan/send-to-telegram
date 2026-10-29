import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

export type Shortcut = { name: string; description: string; keys: string };

const isMac = navigator.userAgent.includes('Mac');

const macSymbols = new Map([
  ['Alt', '⌥'],
  ['Shift', '⇧'],
  ['Command', '⌘'],
  ['Ctrl', '⌃'],
  ['MacCtrl', '⌃'],
]);

/** Chrome reports "Alt+Shift+S" on every platform; Mac users read ⌥⇧S. */
export function formatKeys(shortcut: string): string {
  if (!isMac) return shortcut.replaceAll('+', ' + ');

  return shortcut
    .split('+')
    .map((key) => macSymbols.get(key) ?? key)
    .join('');
}

/** The extension's keyboard shortcuts as the browser currently has them set. */
export function useShortcuts(): Shortcut[] {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

  useEffect(() => {
    let active = true;

    void browser.commands.getAll().then((commands) => {
      if (!active) return;

      setShortcuts(
        commands.flatMap((command) =>
          command.name
            ? [
                {
                  name: command.name,
                  description:
                    command.name === '_execute_action'
                      ? 'Open Send to Telegram'
                      : (command.description ?? command.name),
                  keys: command.shortcut ? formatKeys(command.shortcut) : '',
                },
              ]
            : []
        )
      );
    });

    return () => {
      active = false;
    };
  }, []);

  return shortcuts;
}

/** Chrome-based browsers list every extension's shortcuts on one page. */
export const canOpenShortcutSettings = !import.meta.env.FIREFOX;

export async function openShortcutSettings() {
  await browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
}
