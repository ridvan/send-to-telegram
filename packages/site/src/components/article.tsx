import type { ReactNode } from 'react';

/** A page of reading, such as the privacy policy: a title, a lede, then sections. */
export function Article({
  title,
  lede,
  note,
  children,
}: {
  title: string;
  lede: ReactNode;
  /** A small line under the lede, such as when the page last changed. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <article className="page flex flex-col gap-14 pt-16 pb-28 sm:pt-24">
      <header className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-heading text-4xl tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="text-lg text-pretty text-muted-foreground">{lede}</p>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </header>
      <div className="flex max-w-2xl flex-col gap-12">{children}</div>
    </article>
  );
}

/** One part of an article, under its own heading. */
export function ArticleSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 leading-relaxed text-pretty [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-medium [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:marker:text-muted-foreground">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
