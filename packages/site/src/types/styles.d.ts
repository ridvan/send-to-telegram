import 'react';

declare module 'react' {
  /** Custom properties carry runtime values such as a gap or a theme color. */
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
