import { createContext } from 'react';

export const storeBrowsers = {
  chrome: { name: 'Chrome', logo: '/chrome.svg' },
  edge: { name: 'Edge', logo: '/edge.svg' },
  firefox: { name: 'Firefox', logo: '/firefox.svg' },
} as const;

export type StoreBrowser = keyof typeof storeBrowsers;

const browserNames: readonly StoreBrowser[] = ['chrome', 'edge', 'firefox'];

export function isStoreBrowser(value: unknown): value is StoreBrowser {
  return browserNames.some((name) => name === value);
}

/**
 * How a store picture is drawn, set from the page's `?theme=` and `?browser=`:
 * light or dark, and the store it's for, so each one names only its browser.
 */
export const StoreLook = createContext<{
  theme: 'light' | 'dark';
  browser: StoreBrowser;
}>({ theme: 'dark', browser: 'chrome' });
