import {
  Astronaut01Icon,
  Attachment01Icon,
  BirdIcon,
  Book02Icon,
  Bookmark02Icon,
  BubbleChatIcon,
  Camera01Icon,
  CherryIcon,
  CloudIcon,
  CloverIcon,
  Coffee02Icon,
  Comet01Icon,
  FavouriteIcon,
  FeatherIcon,
  FlowerIcon,
  GalaxyIcon,
  Globe02Icon,
  HashtagIcon,
  HeadphonesIcon,
  Idea01Icon,
  Leaf01Icon,
  Link01Icon,
  Mail01Icon,
  Moon02Icon,
  MoonStarIcon,
  MusicNote01Icon,
  Mushroom01Icon,
  Note01Icon,
  Plant02Icon,
  RainbowIcon,
  Rocket01Icon,
  RoseIcon,
  SaturnIcon,
  SentIcon,
  SnailIcon,
  SparklesIcon,
  StarIcon,
  Sun03Icon,
  Tag01Icon,
  Telescope01Icon,
  Tree02Icon,
  TulipIcon,
  UfoIcon,
} from '@hugeicons/core-free-icons';

import type { ChatBackground } from './settings.ts';

export type ChatPattern = Exclude<ChatBackground, 'plain' | 'photo'>;

type Glyph = typeof SentIcon;

/**
 * A pattern's tile, drawn white on black: it's a luminance mask, so the
 * theme's `--chat-pattern` colors it in light and dark alike, and black
 * shapes can hide what's under them.
 */
type Tile = { width: number; height: number; body: string };

/** Telegram's doodle wallpapers, in three themes, from one icon set. */
const doodleSets = {
  doodles: [
    SentIcon,
    Bookmark02Icon,
    Link01Icon,
    HashtagIcon,
    Mail01Icon,
    BubbleChatIcon,
    MusicNote01Icon,
    Camera01Icon,
    FavouriteIcon,
    Globe02Icon,
    Coffee02Icon,
    Idea01Icon,
    Book02Icon,
    Attachment01Icon,
    Note01Icon,
    HeadphonesIcon,
    Tag01Icon,
  ],
  space: [
    Rocket01Icon,
    Moon02Icon,
    SaturnIcon,
    Telescope01Icon,
    Comet01Icon,
    UfoIcon,
    Astronaut01Icon,
    SparklesIcon,
    StarIcon,
    MoonStarIcon,
    GalaxyIcon,
  ],
  garden: [
    Leaf01Icon,
    FlowerIcon,
    TulipIcon,
    RoseIcon,
    Plant02Icon,
    Tree02Icon,
    CloverIcon,
    Mushroom01Icon,
    SnailIcon,
    BirdIcon,
    FeatherIcon,
    CherryIcon,
    Sun03Icon,
    CloudIcon,
    RainbowIcon,
  ],
} satisfies Record<string, Glyph[]>;

const round = (value: number) => Math.round(value * 100) / 100;

/** Hugeicons' React-style attributes, as SVG markup in the mask's white. */
function glyphMarkup(glyph: Glyph) {
  return glyph
    .map(([tag, attributes]) => {
      const written = Object.entries(attributes)
        .filter(([name]) => name !== 'key')
        .map(([name, value]) => {
          const kebab = name.replaceAll(
            /[A-Z]/g,
            (char) => `-${char.toLowerCase()}`
          );

          const color = value === 'currentColor' ? '#fff' : String(value);

          return `${kebab}="${color}"`;
        })
        .join(' ');

      return `<${tag} ${written}/>`;
    })
    .join('');
}

/** The same numbers on every load, so the wallpaper never reshuffles. */
function seeded(seed: number) {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Spot = { x: number; y: number; radius: number };

/** How far apart two spots are on a tile that repeats, across its edges. */
function apart(one: Spot, other: Spot, size: number) {
  const dx = Math.abs(one.x - other.x);
  const dy = Math.abs(one.y - other.y);

  return Math.hypot(Math.min(dx, size - dx), Math.min(dy, size - dy));
}

/**
 * Scatters spots over a tile that repeats, no two closer than their radii
 * allow, measured across the tile's edges too so the seams don't crowd.
 */
function scatter(
  random: () => number,
  size: number,
  placed: Spot[],
  radius: number,
  attempts: number
) {
  const added: Spot[] = [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const spot = { x: random() * size, y: random() * size, radius };

    const clear = [...placed, ...added].every(
      (other) => apart(spot, other, size) >= spot.radius + other.radius
    );

    if (clear) added.push(spot);
  }

  return added;
}

/** Draws `mark` at a spot, again across any edge it spills over. */
function wrapped(
  spot: Spot,
  size: number,
  mark: (x: number, y: number) => string
) {
  let markup = '';

  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const x = spot.x + dx;
      const y = spot.y + dy;

      if (
        x + spot.radius > 0 &&
        x - spot.radius < size &&
        y + spot.radius > 0 &&
        y - spot.radius < size
      ) {
        markup += mark(x, y);
      }
    }
  }

  return markup;
}

/** A four-pointed sparkle with curved sides, filled. */
function sparkle(x: number, y: number, size: number) {
  const k = size * 0.22;

  return `<path fill="#fff" d="M${round(x)} ${round(y - size)}Q${round(x + k)} ${round(y - k)} ${round(x + size)} ${round(y)}Q${round(x + k)} ${round(y + k)} ${round(x)} ${round(y + size)}Q${round(x - k)} ${round(y + k)} ${round(x - size)} ${round(y)}Q${round(x - k)} ${round(y - k)} ${round(x)} ${round(y - size)}Z"/>`;
}

/**
 * Icons scattered at slight angles, with dots, rings and sparkles in the gaps,
 * as Telegram draws its wallpapers.
 */
function doodleTile(glyphs: Glyph[], seed: number): Tile {
  const size = 320;
  const random = seeded(seed);
  const icons = scatter(random, size, [], 18, 6000);
  const fillers = scatter(random, size, icons, 8, 4000);

  // Each icon differs from its near neighbors, so none clumps.
  const chosen: number[] = [];

  for (const [index, spot] of icons.entries()) {
    const nearby = new Set(
      icons
        .slice(0, index)
        .filter((other) => apart(spot, other, size) < 110)
        .map((other) => chosen[icons.indexOf(other)])
    );

    const free = glyphs.findIndex(
      (_, offset) => !nearby.has((index + offset) % glyphs.length)
    );

    chosen.push((index + Math.max(free, 0)) % glyphs.length);
  }

  const defs = glyphs
    .map((glyph, index) => `<g id="g${index}">${glyphMarkup(glyph)}</g>`)
    .join('');

  const drawn = icons
    .map((spot, index) => {
      const glyph = chosen[index] ?? 0;
      const angle = round((random() - 0.5) * 56);
      const scale = round(0.95 + random() * 0.25);

      return wrapped(
        spot,
        size,
        (x, y) =>
          `<use href="#g${glyph}" transform="translate(${round(x)} ${round(y)}) rotate(${angle}) scale(${scale}) translate(-12 -12)"/>`
      );
    })
    .join('');

  const specks = fillers
    .map((spot) => {
      const kind = random();

      return wrapped(spot, size, (x, y) =>
        kind < 0.45
          ? `<circle cx="${round(x)}" cy="${round(y)}" r="1.3" fill="#fff"/>`
          : kind < 0.75
            ? `<circle cx="${round(x)}" cy="${round(y)}" r="2.2" stroke="#fff" stroke-width="1.2"/>`
            : sparkle(x, y, 3.6)
      );
    })
    .join('');

  return {
    width: size,
    height: size,
    body: `<defs>${defs}</defs>${drawn}${specks}`,
  };
}

/**
 * Gray in a luminance mask draws fainter: patterns that cover the whole chat
 * would otherwise outweigh the doodles' scattered icons.
 */
const INK = '#b8b8b8';

/**
 * Seigaiha: rows of fanned waves, each row laid over the one above it. Black
 * discs hide the rings they cover.
 */
function wavesTile(): Tile {
  const radius = 22;
  const width = radius * 2;
  const height = radius;
  let body = '';

  for (let row = -2; row <= 4; row += 1) {
    const y = (row * radius) / 2;
    const offset = row % 2 === 0 ? 0 : radius;

    for (let column = -1; column <= 1; column += 1) {
      const x = column * width + offset;

      body += `<circle cx="${x}" cy="${y}" r="${radius}" fill="#000"/>`;

      for (const ring of [0.95, 0.73, 0.51, 0.29]) {
        body += `<circle cx="${x}" cy="${y}" r="${round(radius * ring)}" stroke="${INK}" stroke-width="1.1"/>`;
      }

      body += `<circle cx="${x}" cy="${y}" r="1.6" fill="${INK}"/>`;
    }
  }

  return { width, height, body };
}

/**
 * Asanoha, the hemp-leaf lattice: a triangle grid with each triangle's
 * corners joined to its middle, so six-pointed stars appear.
 */
function latticeTile(): Tile {
  const side = 36;
  const rise = (side * Math.sqrt(3)) / 2;
  const width = side;
  const height = rise * 2;
  const lines: string[] = [];

  // The grid: level lines, then both slants through each point on the top
  // row, long enough to cross the tile.
  for (let row = -1; row <= 3; row += 1) {
    lines.push(`M-${side} ${round(row * rise)}H${side * 2}`);
  }

  for (let column = -4; column <= 4; column += 1) {
    const x = column * side;
    const run = height / Math.sqrt(3);

    lines.push(`M${x} 0L${round(x + run)} ${round(height)}`);
    lines.push(`M${x} 0L${round(x - run)} ${round(height)}`);
  }

  // The spokes: every corner of every triangle to its middle.
  for (let row = -1; row <= 2; row += 1) {
    const top = row * rise;
    const shift = row % 2 === 0 ? 0 : side / 2;

    for (let column = -2; column <= 2; column += 1) {
      const left = column * side + shift;

      // Pointing down from this row, then up from the next one.
      const down = [
        [left, top],
        [left + side, top],
        [left + side / 2, top + rise],
      ];

      const up = [
        [left + side / 2, top + rise],
        [left + side * 1.5, top + rise],
        [left + side, top],
      ];

      for (const corners of [up, down]) {
        const middleX = corners.reduce((sum, [x = 0]) => sum + x, 0) / 3;
        const middleY = corners.reduce((sum, [, y = 0]) => sum + y, 0) / 3;

        for (const [x = 0, y = 0] of corners) {
          lines.push(
            `M${round(x)} ${round(y)}L${round(middleX)} ${round(middleY)}`
          );
        }
      }
    }
  }

  return {
    width,
    height,
    body: `<path d="${lines.join('')}" stroke="${INK}" stroke-width="1"/>`,
  };
}

/** The flower of life: circles through each other's centers, as petals. */
function petalsTile(): Tile {
  const radius = 26;
  const rise = (radius * Math.sqrt(3)) / 2;
  const width = radius;
  const height = rise * 2;
  let body = '';

  for (let row = -2; row <= 4; row += 1) {
    const shift = row % 2 === 0 ? 0 : radius / 2;

    for (let column = -2; column <= 2; column += 1) {
      body += `<circle cx="${round(column * radius + shift)}" cy="${round(row * rise)}" r="${radius}"/>`;
    }
  }

  return {
    width,
    height,
    body: `<g stroke="${INK}" stroke-width="1">${body}</g>`,
  };
}

const builders = {
  doodles: () => doodleTile(doodleSets.doodles, 7),
  space: () => doodleTile(doodleSets.space, 11),
  garden: () => doodleTile(doodleSets.garden, 23),
  waves: wavesTile,
  lattice: latticeTile,
  petals: petalsTile,
} satisfies Record<ChatPattern, () => Tile>;

export const chatPatterns = Object.keys(builders).filter(
  (name): name is ChatPattern => Object.hasOwn(builders, name)
);

export function isChatPattern(
  background: ChatBackground
): background is ChatPattern {
  return Object.hasOwn(builders, background);
}

const built = new Map<
  ChatPattern,
  { image: string; width: number; height: number }
>();

/**
 * A pattern's tile as a CSS `url()`, and the size it repeats at. `scale`
 * draws it smaller, so a preview holds more than a fragment of it.
 */
export function patternTile(pattern: ChatPattern, scale = 1) {
  const tile = built.get(pattern) ?? buildTile(pattern);

  built.set(pattern, tile);

  return {
    image: tile.image,
    size: `${round(tile.width * scale)}px ${round(tile.height * scale)}px`,
  };
}

function buildTile(pattern: ChatPattern) {
  const { width, height, body } = builders[pattern]();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${width} ${height}" fill="none">${body}</svg>`;

  return {
    image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    width,
    height,
  };
}
