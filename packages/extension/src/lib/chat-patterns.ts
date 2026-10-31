import type { ChatBackground } from './settings.ts';

export type ChatPattern = Exclude<ChatBackground, 'plain' | 'photo'>;

/**
 * One tile of each pattern, repeated behind the chat. Drawn as a mask, so the
 * theme's `--chat-pattern` colors it in light and dark alike.
 */
const tiles = {
  dots: {
    width: 24,
    height: 24,
    marks:
      '<circle cx="6" cy="6" r="1.5" fill="#000"/><circle cx="18" cy="18" r="1.5" fill="#000"/>',
  },
  grid: {
    width: 24,
    height: 24,
    marks: '<path d="M0 .5h24M.5 0v24"/>',
  },
  lines: {
    width: 14,
    height: 14,
    marks: '<path d="M0 14 14 0M-3.5 3.5l7-7M10.5 17.5l7-7"/>',
  },
  waves: {
    width: 40,
    height: 22,
    marks: '<path d="M0 11q10-7 20 0t20 0" stroke-width="1.2"/>',
  },
  crosses: {
    width: 28,
    height: 28,
    marks: '<path d="M7 4v6M4 7h6M21 18v6M18 21h6" stroke-width="1.4"/>',
  },
  rings: {
    width: 32,
    height: 32,
    marks:
      '<circle cx="8" cy="8" r="4.5" stroke-width="1.2"/><circle cx="24" cy="24" r="4.5" stroke-width="1.2"/>',
  },
} satisfies Record<
  ChatPattern,
  { width: number; height: number; marks: string }
>;

export const chatPatterns = Object.keys(tiles).filter(
  (name): name is ChatPattern => Object.hasOwn(tiles, name)
);

export function isChatPattern(
  background: ChatBackground
): background is ChatPattern {
  return Object.hasOwn(tiles, background);
}

/** A pattern's tile as a CSS `url()`, and the size it repeats at. */
export function patternTile(pattern: ChatPattern) {
  const { width, height, marks } = tiles[pattern];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" fill="none" stroke="#000" stroke-linecap="round">${marks}</svg>`;

  return {
    image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    size: `${width}px ${height}px`,
  };
}
