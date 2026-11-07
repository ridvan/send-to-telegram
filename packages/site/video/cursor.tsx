import { mix } from './motion';

/**
 * The mouse pointer, so clicks read in a video. Its tip sits on `x` and `y`,
 * and it shrinks a little as it presses.
 */
export function Cursor({
  x,
  y,
  press = 0,
  opacity = 1,
}: {
  x: number;
  y: number;
  /** How far it's pressed, from 0 to 1. */
  press?: number;
  opacity?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={26}
      height={26}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 drop-shadow-md"
      style={{
        opacity,
        translate: `${x - 5}px ${y - 3}px`,
        scale: mix(1, 0.82, press),
        transformOrigin: '5px 3px',
      }}
    >
      <path
        d="M5 3 L5 19.5 L9.3 15.6 L12.1 21.6 L14.9 20.3 L12.2 14.4 L18 14.4 Z"
        fill="white"
        stroke="black"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}
