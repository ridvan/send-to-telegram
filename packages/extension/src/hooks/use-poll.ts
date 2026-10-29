import { useEffect, useEffectEvent } from 'react';

/**
 * Runs `task` now and then every `interval` ms while `active`, waiting for
 * each run to finish before scheduling the next. Stops on unmount, and starts
 * over at once when `subject` changes.
 */
export function usePoll(
  task: (signal: AbortSignal) => Promise<void>,
  interval: number,
  active: boolean,
  subject?: string
) {
  const run = useEffectEvent(task);

  useEffect(() => {
    if (!active) return undefined;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      await run(controller.signal).catch(() => undefined);

      if (!controller.signal.aborted) timer = setTimeout(tick, interval);
    }

    void tick();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, interval, subject]);
}
