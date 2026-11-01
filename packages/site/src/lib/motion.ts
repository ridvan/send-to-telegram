import {
  type RefObject,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';

const reducedMotion = '(prefers-reduced-motion: reduce)';

function watch(onChange: () => void) {
  const query = window.matchMedia(reducedMotion);

  query.addEventListener('change', onChange);

  return () => query.removeEventListener('change', onChange);
}

const read = () => window.matchMedia(reducedMotion).matches;

/** Whether the visitor asked for less motion; false while rendering on the server. */
export function usePrefersStill() {
  return useSyncExternalStore(watch, read, () => false);
}

function watchTab(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);

  return () => document.removeEventListener('visibilitychange', onChange);
}

/**
 * Whether an element is in view in a tab that's showing, so motion can wait
 * while nobody can see it. True while rendering on the server.
 */
export function useInView(ref: RefObject<Element | null>) {
  const [intersecting, setIntersecting] = useState(true);

  const tabShowing = useSyncExternalStore(
    watchTab,
    () => !document.hidden,
    () => true
  );

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    const observer = new IntersectionObserver(([entry]) =>
      setIntersecting(entry?.isIntersecting ?? true)
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return intersecting && tabShowing;
}
