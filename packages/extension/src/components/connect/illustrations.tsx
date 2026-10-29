import { AppMark } from '@/components/app-mark';

/*
 * Small stills of Telegram that show what to look for, so the steps can say
 * less. They repeat what the step's text says, so screen readers skip them.
 */

/** Your /newbot message and BotFather's reply, with the token to copy. */
export function BotFatherChat() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-1.5 rounded-xl bg-chat p-3 text-xs select-none"
    >
      <span className="self-end rounded-2xl rounded-br-sm bg-bubble px-2.5 py-1.5 font-mono text-bubble-foreground">
        /newbot
      </span>
      <span className="flex max-w-[85%] flex-col gap-1 self-start rounded-2xl rounded-bl-sm bg-card px-2.5 py-1.5 shadow-xs">
        Done! Use this token to access the HTTP API:
        <span className="w-fit rounded-sm bg-bubble px-1 font-mono text-bubble-accent">
          123456789:AAH4kYbPq…
        </span>
      </span>
    </div>
  );
}

/** A bot's chat before the first message, with Start along the bottom. */
export function StartButton({ bot }: { bot: string }) {
  return (
    <div
      aria-hidden
      className="flex flex-col overflow-hidden rounded-xl border text-xs select-none"
    >
      <span className="flex items-center gap-2 border-b bg-background px-3 py-2">
        <AppMark size="sm" />
        <span className="flex flex-col">
          <span className="font-medium">{bot}</span>
          <span className="text-muted-foreground">bot</span>
        </span>
      </span>
      <span className="h-12 bg-chat" />
      <span className="border-t bg-background py-2.5 text-center font-semibold tracking-wide text-brand">
        START
      </span>
    </div>
  );
}
