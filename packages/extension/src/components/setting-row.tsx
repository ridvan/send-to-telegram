import type { SentIcon } from '@hugeicons/core-free-icons';
import { cva } from 'class-variance-authority';
import { createContext, use, type ReactNode } from 'react';

import { IconTile, type TileTone } from '@/components/icon-tile';

type Density = 'comfortable' | 'compact';

const DensityContext = createContext<Density>('comfortable');

/**
 * Sets how settings lay out below it: `comfortable` for the options page,
 * `compact` for the 360px popup, where sections lose their cards and wide
 * controls move under their label.
 */
export function SettingsDensity({
  density,
  children,
}: {
  density: Density;
  children: ReactNode;
}) {
  return <DensityContext value={density}>{children}</DensityContext>;
}

const rowVariants = cva(
  'flex flex-col border-b border-border/70 last:border-0',
  {
    variants: {
      density: {
        comfortable: 'gap-3 py-4 first:pt-0 last:pb-0',
        compact: 'gap-2.5 py-2.5',
      },
    },
  }
);

const rowHeaderVariants = cva('flex justify-between', {
  variants: {
    density: {
      comfortable: 'items-center gap-6',
      compact: 'items-center gap-4',
    },
    wide: { true: '', false: '' },
  },
  compoundVariants: [
    {
      density: 'compact',
      wide: true,
      className: 'flex-col items-stretch gap-2.5',
    },
  ],
});

export type SettingIcon = { icon: typeof SentIcon; tone: TileTone };

/** One setting: label and description on the left, its control on the right. */
export function SettingRow({
  icon,
  label,
  description,
  htmlFor,
  control,
  wide = false,
  children,
}: {
  /** A colored icon before the label, so rows are found by eye, not read. */
  icon?: SettingIcon;
  label: ReactNode;
  description?: ReactNode;
  /** Ties the label to the control, so clicking the label toggles it. */
  htmlFor?: string;
  control?: ReactNode;
  /** The control is too wide to sit beside the label in the popup. */
  wide?: boolean;
  /** Full-width content under the row, such as an editor. */
  children?: ReactNode;
}) {
  const density = use(DensityContext);
  const LabelTag = htmlFor ? 'label' : 'div';

  return (
    <div className={rowVariants({ density })}>
      <div className={rowHeaderVariants({ density, wide })}>
        <div className="flex min-w-0 items-center gap-3">
          {icon ? <IconTile {...icon} size="sm" /> : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <LabelTag htmlFor={htmlFor} className="text-sm font-medium">
              {label}
            </LabelTag>
            {description ? (
              <div className="text-sm text-pretty text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {control ? (
          <div
            className={
              // Under the label in the popup; line up with the label's text.
              icon && wide && density === 'compact'
                ? 'flex shrink-0 items-center gap-2 pl-10'
                : 'flex shrink-0 items-center gap-2'
            }
          >
            {control}
          </div>
        ) : null}
      </div>
      {/* Line up with the label's text when an icon sits before it. */}
      {icon && children ? <div className="pl-10">{children}</div> : children}
    </div>
  );
}

const sectionVariants = cva('flex flex-col', {
  variants: {
    density: {
      comfortable: 'scroll-mt-24 gap-4',
      compact: 'gap-1 px-4 pt-5',
    },
  },
});

const sectionHeaderVariants = cva('flex justify-between gap-4', {
  variants: {
    density: { comfortable: 'items-end', compact: 'items-center' },
  },
});

const sectionTitleVariants = cva('font-semibold tracking-tight', {
  variants: {
    density: { comfortable: 'text-base', compact: 'text-sm' },
  },
});

const sectionBodyVariants = cva('', {
  variants: {
    density: {
      comfortable: 'rounded-xl border bg-card px-5 py-4',
      // Items pad themselves; bleed them so their text lines up with rows.
      compact: 'pt-1 [&>[data-slot=item-group]]:-mx-3',
    },
  },
});

/** A titled group of settings rows. */
export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const density = use(DensityContext);

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={sectionVariants({ density })}
      id={id}
    >
      <div className={sectionHeaderVariants({ density })}>
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className={sectionTitleVariants({ density })}>
            {title}
          </h2>
          {/* The popup leaves these out; the options page has room. */}
          {description && density === 'comfortable' ? (
            <p className="text-sm text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className={sectionBodyVariants({ density })}>{children}</div>
    </section>
  );
}
