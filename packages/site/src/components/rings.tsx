import { useId } from 'react';

/**
 * Faint rings around a point, fading out as they spread: what sits behind the
 * extension's icon in the hero and the store's small tile. Drawn on the
 * parent's grid, filling it, and free to spill past its edges.
 */
export function Rings({
  width,
  height,
  x,
  y,
  radii,
  fade,
  fadeBelow,
}: {
  /** The grid the parent is drawn on. */
  width: number;
  height: number;
  /** The middle, usually the icon's. */
  x: number;
  y: number;
  radii: readonly number[];
  /** Where the rings have faded out, a little past the last one. */
  fade: number;
  /**
   * Fades them out downwards too, gone by this line, so they stay clear of
   * text under the middle.
   */
  fadeBelow?: number;
}) {
  const id = useId();

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 size-full overflow-visible"
      fill="none"
    >
      <defs>
        <radialGradient
          id={`${id}fade`}
          gradientUnits="userSpaceOnUse"
          cx={x}
          cy={y}
          r={fade}
        >
          <stop offset="0.45" stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        {/* Alpha, so only the fade counts and not its color. */}
        <mask id={`${id}mask`} className="mask-type-alpha">
          <rect
            x={x - fade}
            y={y - fade}
            width={fade * 2}
            height={fade * 2}
            fill={`url(#${id}fade)`}
          />
        </mask>
        {fadeBelow === undefined ? null : (
          <>
            <linearGradient
              id={`${id}down`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={y}
              x2={0}
              y2={fadeBelow}
            >
              <stop offset="0" stopColor="currentColor" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
            <mask id={`${id}below`} className="mask-type-alpha">
              <rect
                x={x - fade}
                y={y - fade}
                width={fade * 2}
                height={fade * 2}
                fill={`url(#${id}down)`}
              />
            </mask>
          </>
        )}
      </defs>
      <g mask={`url(#${id}mask)`}>
        <g
          className="stroke-border"
          {...(fadeBelow === undefined ? {} : { mask: `url(#${id}below)` })}
        >
          {radii.map((radius) => (
            <circle key={radius} cx={x} cy={y} r={radius} strokeWidth={1} />
          ))}
        </g>
      </g>
    </svg>
  );
}
