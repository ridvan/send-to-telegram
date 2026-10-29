import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from '@/components/app-providers';

import {
  historyStore,
  onboardingStore,
  settingsStore,
  statsStore,
} from './settings.ts';
import { applyRememberedTheme } from './theme.ts';

/**
 * Loads every store before the first render, so pages never flash a loading
 * state for data that takes a millisecond to read.
 */
export async function mount(page: () => ReactNode) {
  applyRememberedTheme();
  await Promise.all([
    settingsStore.get(),
    historyStore.get(),
    statsStore.get(),
    onboardingStore.get(),
  ]);

  const container = document.getElementById('root');

  if (!container) throw new Error('The page has no #root element');

  createRoot(container).render(
    <StrictMode>
      <AppProviders>{page()}</AppProviders>
    </StrictMode>
  );
}
