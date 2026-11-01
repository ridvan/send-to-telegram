import { useSyncExternalStore } from 'react';

/*
 * Light, dark, or whatever the system uses. The choice is kept per visitor in
 * localStorage; the page draws from `data-theme` on <html>, which the script in
 * <head> sets before the first paint so there's no flash of the wrong one.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

const key = 'theme';
const darkQuery = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

/** The browser's bar above the page, matching its background. */
export const themeColors = { light: '#ffffff', dark: '#0b0b0b' } as const;

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(key);

    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia(darkQuery).matches);

  const theme = dark ? 'dark' : 'light';

  document.documentElement.dataset.theme = theme;

  chosenColor().content = themeColors[theme];
}

/**
 * The browser bar's color for the theme in use. The theme script adds the tag
 * and this keeps it current. React doesn't render it: it matches tags by their
 * attributes when it hydrates, so it would add another beside a changed one.
 */
function chosenColor() {
  const found = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );

  if (found) return found;

  const meta = document.createElement('meta');

  meta.name = 'theme-color';
  document.head.prepend(meta);

  return meta;
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(key);
    else localStorage.setItem(key, choice);
  } catch {
    // Private windows can refuse storage; the choice still holds for this page.
  }

  apply(choice);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  const query = window.matchMedia(darkQuery);
  const followSystem = () => apply(stored());

  listeners.add(listener);
  query.addEventListener('change', followSystem);

  return () => {
    listeners.delete(listener);
    query.removeEventListener('change', followSystem);
  };
}

/** The visitor's choice; "system" while rendering on the server. */
export function useThemeChoice() {
  return useSyncExternalStore(subscribe, stored, () => 'system' as const);
}

/**
 * Runs in <head> before anything paints, and again on each client-side
 * navigation; the same rules as `apply`.
 */
export const themeScript = `(function(){var c;try{c=localStorage.getItem('${key}')}catch(e){}var d=c==='dark'||(c!=='light'&&matchMedia('${darkQuery}').matches);document.documentElement.dataset.theme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.name='theme-color';document.head.prepend(m)}m.content=d?'${themeColors.dark}':'${themeColors.light}'})()`;
