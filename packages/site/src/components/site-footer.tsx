import {
  Bug01Icon,
  ComputerIcon,
  FavouriteIcon,
  Github01Icon,
  Moon02Icon,
  News01Icon,
  Sun03Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { AppMark } from '@/components/app-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { links } from '@/lib/links';
import { setThemeChoice, useThemeChoice } from '@/lib/theme';

/** The release the site describes; the changelog has the details. */
const version = '2.0';

const actions = [
  {
    href: links.repository,
    label: 'Source code on GitHub',
    icon: Github01Icon,
  },
  { href: links.changelog, label: 'Changelog', icon: News01Icon },
  { href: links.issues, label: 'Report a problem', icon: Bug01Icon },
];

const themes = [
  { value: 'system', label: 'Match the system', icon: ComputerIcon },
  { value: 'light', label: 'Light', icon: Sun03Icon },
  { value: 'dark', label: 'Dark', icon: Moon02Icon },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="page flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4">
        <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <AppMark size="sm" />
          Send to Telegram
          <Badge variant="secondary">v{version}</Badge>
          <span className="hidden items-center gap-1 font-normal tracking-normal text-muted-foreground md:inline-flex">
            Made with
            <HugeiconsIcon
              icon={FavouriteIcon}
              strokeWidth={2}
              aria-hidden
              className="size-3.5 fill-current text-tint-red-to"
            />
            <span className="sr-only">love</span>
            for the note-takers and the bookmark keepers.
          </span>
        </span>
        <TooltipProvider delay={300}>
          <div className="flex items-center gap-3">
            <ul className="flex items-center gap-1">
              {actions.map((action) => (
                <li key={action.href}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          tone="muted"
                          aria-label={action.label}
                          render={<a href={action.href} />}
                          nativeButton={false}
                        />
                      }
                    >
                      <HugeiconsIcon icon={action.icon} strokeWidth={1.8} />
                    </TooltipTrigger>
                    <TooltipContent>{action.label}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
            <Separator
              orientation="vertical"
              className="h-5 data-vertical:self-center"
            />
            <ThemeSwitch />
          </div>
        </TooltipProvider>
      </div>
    </footer>
  );
}

/** Light, dark, or the system's choice, which is where it starts. */
function ThemeSwitch() {
  const choice = useThemeChoice();

  return (
    <ToggleGroup
      variant="segmented"
      size="icon-sm"
      aria-label="Appearance"
      value={[choice]}
      onValueChange={(values) => {
        const next = themes.find((theme) => theme.value === values[0]);

        if (next) setThemeChoice(next.value);
      }}
    >
      {themes.map((theme) => (
        <Tooltip key={theme.value}>
          <TooltipTrigger
            render={
              <ToggleGroupItem value={theme.value} aria-label={theme.label} />
            }
          >
            <HugeiconsIcon icon={theme.icon} strokeWidth={1.8} />
          </TooltipTrigger>
          <TooltipContent>{theme.label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
