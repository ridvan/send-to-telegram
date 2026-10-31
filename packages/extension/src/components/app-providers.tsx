import { useEffect, type ReactNode } from 'react';

import { LockGate, type LockScreenSize } from '@/components/lock-screen';
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

export function AppProviders({
  lockScreen,
  children,
}: {
  lockScreen: LockScreenSize;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delay={400}>
      {/* Locked settings read as defaults; the remembered theme stays applied. */}
      <LockGate size={lockScreen}>
        <ThemeSync />
        {children}
      </LockGate>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
