import { useSyncExternalStore } from 'react';
import { browser } from 'wxt/browser';

import { AppMark } from '@/components/app-mark';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { HistoryView } from '@/components/history-view';
import { BackupSection } from '@/components/settings/backup-section';
import { ChatsSection } from '@/components/settings/chats-section';
import { LockSection } from '@/components/settings/lock-section';
import {
  GeneralSection,
  HistorySection,
  MessagesSection,
  PrivacySection,
  TagsSection,
} from '@/components/settings/preferences';

function subscribeToHash(onChange: () => void) {
  addEventListener('hashchange', onChange);

  return () => removeEventListener('hashchange', onChange);
}

const readHash = () => location.hash.slice(1);

/** The popup links here with `#add-chat`, since connecting would close it. */
const addOnOpen = readHash() === 'add-chat';

function restart() {
  location.assign(browser.runtime.getURL('/welcome.html'));
}

function navigate(hash: string) {
  history.replaceState(null, '', `#${hash}`);
  dispatchEvent(new HashChangeEvent('hashchange'));
}

export function Options() {
  const hash = useSyncExternalStore(subscribeToHash, readHash);
  const view = hash === 'history' ? 'history' : 'settings';
  const version = browser.runtime.getManifest().version;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-6">
          <AppMark size="sm" />
          <span className="text-sm font-semibold">Send to Telegram</span>
          <Tabs
            value={view}
            onValueChange={(next) =>
              navigate(next === 'history' ? 'history' : '')
            }
            className="ml-auto"
          >
            <TabsList variant="line">
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-12 px-6 py-10 [--sticky-top:3.5rem]">
        {view === 'history' ? (
          <HistoryView
            onOpenSettings={() => {
              navigate('history-settings');
              requestAnimationFrame(() =>
                document.getElementById('history-settings')?.scrollIntoView()
              );
            }}
          />
        ) : (
          <>
            <ChatsSection addOnOpen={addOnOpen} />
            <MessagesSection />
            <TagsSection />
            <HistorySection />
            <PrivacySection />
            <LockSection />
            <BackupSection />
            <GeneralSection onReset={restart} />
          </>
        )}
      </main>

      <footer className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 px-6 pb-10 text-xs text-muted-foreground">
        <span className="tabular-nums">{`Version ${version}`}</span>
        <span>Not affiliated with Telegram.</span>
      </footer>
    </div>
  );
}
