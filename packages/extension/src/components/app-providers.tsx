import { useEffect, type ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useStore } from '@/hooks/use-store';
import { settingsStore } from '@/lib/settings';
import { applyTheme, watchSystemTheme } from '@/lib/theme';

function ThemeSync() {
  const theme = useStore(settingsStore).appearance.theme;

  useEffect(() => {
    applyTheme(theme);

    if (theme !== 'system') return undefined;

    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delay={400}>
      <ThemeSync />
      {children}
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
