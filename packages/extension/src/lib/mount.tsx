import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from '@/components/app-providers';
import type { LockScreenSize } from '@/components/lock-screen';

import { loadLock } from './lock.ts';
import './settings.ts';
import { applyRememberedTheme } from './theme.ts';

/**
 * Loads every store before the first render, so pages never flash a loading
 * state for data that takes a millisecond to read.
 */
export async function mount(
  page: () => ReactNode,
  lockScreen: LockScreenSize = 'page'
) {
  applyRememberedTheme();
  // Reads the stores too, once it knows whether they can be opened.
  await loadLock();

  const container = document.getElementById('root');

  if (!container) throw new Error('The page has no #root element');

  createRoot(container).render(
    <StrictMode>
      <AppProviders lockScreen={lockScreen}>{page()}</AppProviders>
    </StrictMode>
  );
}
