import type { ReactNode } from 'react';

/** One setting: label and description on the left, its control on the right. */
export function SettingRow({
  label,
  description,
  htmlFor,
  control,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** Ties the label to the control, so clicking the label toggles it. */
  htmlFor?: string;
  control?: ReactNode;
  /** Full-width content under the row, such as an editor. */
  children?: ReactNode;
}) {
  const LabelTag = htmlFor ? 'label' : 'div';

  return (
    <div className="flex flex-col gap-3 border-b border-border/70 py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <LabelTag htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </LabelTag>
          {description ? (
            <div className="text-sm text-pretty text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {control ? (
          <div className="flex shrink-0 items-center gap-2">{control}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

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
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 scroll-mt-24"
      id={id}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2
            id={`${id}-title`}
            className="text-base font-semibold tracking-tight"
          >
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="rounded-xl border bg-card px-5 py-4">{children}</div>
    </section>
  );
}
