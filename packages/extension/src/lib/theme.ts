import { themeSchema, type Theme } from './settings.ts';

/** Mirrors the stored theme so the next page load can apply it before React runs. */
const THEME_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;

  return matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function setRootClass(theme: Theme) {
  const root = document.documentElement;

  root.classList.remove('light', 'dark');
  root.classList.add(resolveTheme(theme));
}

/** Swaps the theme with transitions paused, so colors change at once instead of smearing. */
export function applyTheme(theme: Theme) {
  const pause = document.createElement('style');

  pause.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.append(pause);
  setRootClass(theme);
  getComputedStyle(document.documentElement).getPropertyValue('opacity');
  requestAnimationFrame(() => requestAnimationFrame(() => pause.remove()));

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be unavailable; the stored setting still applies after load.
  }
}

export function applyRememberedTheme() {
  try {
    const remembered = themeSchema.safeParse(localStorage.getItem(THEME_KEY));

    setRootClass(remembered.success ? remembered.data : 'system');
  } catch {
    setRootClass('system');
  }
}

export function watchSystemTheme(onChange: () => void) {
  const media = matchMedia(DARK_QUERY);

  media.addEventListener('change', onChange);

  return () => media.removeEventListener('change', onChange);
}
