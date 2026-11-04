import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useStore } from '@/hooks/use-store';
import { settingsStore, type Theme, themeSchema } from '@/lib/settings';

const themes = {
  system: { label: 'System', icon: ComputerIcon },
  light: { label: 'Light', icon: Sun03Icon },
  dark: { label: 'Dark', icon: Moon02Icon },
} satisfies Record<Theme, { label: string; icon: typeof Sun03Icon }>;

/**
 * System, light or dark, saved with the other settings so every page follows.
 * `compact` shows only the icons, with the names in tooltips.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme } = useStore(settingsStore).appearance;

  return (
    <ToggleGroup
      variant="segmented"
      size="sm"
      aria-label="Appearance"
      value={[theme]}
      onValueChange={([next]) => {
        const parsed = themeSchema.safeParse(next);

        if (parsed.success) {
          void settingsStore.update((settings) => ({
            ...settings,
            appearance: { ...settings.appearance, theme: parsed.data },
          }));
        }
      }}
    >
      {themeSchema.options.map((option) => {
        const { label, icon } = themes[option];

        if (!compact) {
          return (
            <ToggleGroupItem key={option} value={option}>
              <HugeiconsIcon
                icon={icon}
                strokeWidth={1.8}
                data-icon="inline-start"
              />
              {label}
            </ToggleGroupItem>
          );
        }

        return (
          <Tooltip key={option}>
            <TooltipTrigger
              render={<ToggleGroupItem value={option} aria-label={label} />}
            >
              <HugeiconsIcon icon={icon} strokeWidth={1.8} />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
