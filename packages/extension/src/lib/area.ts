import { browser } from 'wxt/browser';
import { z } from 'zod';

import { deleteAttachment, saveAttachment } from './attachments.ts';
import { MAX_ATTACHMENTS } from './compose.ts';
import {
  attachmentInfo,
  CaptureError,
  captureFailure,
  captureTab,
} from './screenshot.ts';
import { type Attachment, attachmentSchema } from './settings.ts';

/**
 * A part of the viewport in CSS pixels, with the viewport's width to scale it
 * by and where the page was scrolled, to tell whether it still shows.
 */
export const areaSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  viewportWidth: z.number().positive(),
  scrollX: z.number(),
  scrollY: z.number(),
});

export type Area = z.infer<typeof areaSchema>;

/** The area dragged out, or why there isn't one. */
export type Picked = Area | 'cancelled' | 'busy';

/**
 * Runs in the page: dims it, lets you drag out an area and resolves with it,
 * `cancelled` on Escape, or `busy` while another pick is under way. It's
 * injected on its own, so everything it uses is inside it. Built from DOM
 * calls rather than markup, so pages that require Trusted Types still allow
 * it, and in a closed shadow root, so their styles can't reach it. The
 * overlay is gone from the screen before it resolves, so the capture that
 * follows doesn't show it.
 */
export function pickArea(): Promise<Picked> {
  const HOST_ID = 'send-to-telegram-area';
  // Smaller than this reads as a stray click, not an area.
  const MIN_SIZE = 8;

  // Already picking in this tab: the first one carries on.
  if (document.getElementById(HOST_ID)) return Promise.resolve('busy');

  return new Promise((resolve) => {
    const host = document.createElement('div');

    host.id = HOST_ID;
    host.style.cssText =
      'all: initial; position: fixed; inset: 0; z-index: 2147483647;';

    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');

    style.textContent = `
      .layer {
        position: fixed;
        inset: 0;
        cursor: crosshair;
        background: rgb(0 0 0 / 0.4);
        user-select: none;
        touch-action: none;
      }
      .layer[data-dragging] { background: transparent; }
      .layer:focus { outline: none; }
      .box {
        position: fixed;
        box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.4);
        outline: 2px solid #2aabee;
      }
      .box[hidden], .hint[hidden] { display: none; }
      .size, .hint {
        position: absolute;
        font: 500 12px/16px system-ui, -apple-system, sans-serif;
        color: #fff;
        background: rgb(0 0 0 / 0.75);
        white-space: nowrap;
        pointer-events: none;
      }
      .size {
        top: calc(100% + 6px);
        right: -2px;
        padding: 2px 6px;
        border-radius: 6px;
        font-variant-numeric: tabular-nums;
      }
      .box[data-low] .size { top: auto; bottom: 6px; right: 6px; }
      .hint {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        width: max-content;
        max-width: calc(100vw - 32px);
        padding: 8px 14px;
        border-radius: 18px;
        font-size: 13px;
        text-align: center;
        white-space: normal;
        box-sizing: border-box;
      }
    `;

    const layer = document.createElement('div');

    layer.className = 'layer';
    // Focused, so Escape reaches it even when focus was in a frame: pressing
    // on it below doesn't move focus, since that would start a text selection.
    layer.tabIndex = -1;

    const hint = document.createElement('div');

    hint.className = 'hint';
    hint.textContent = 'Drag to select an area to send. Press Esc to cancel.';

    const box = document.createElement('div');

    box.className = 'box';
    box.hidden = true;

    const size = document.createElement('span');

    size.className = 'size';
    box.append(size);
    layer.append(hint, box);
    root.append(style, layer);
    document.documentElement.append(host);
    layer.focus();

    let start: { x: number; y: number } | undefined;
    let current = { x: 0, y: 0, width: 0, height: 0 };

    function draw(x: number, y: number) {
      if (!start) return;

      current = {
        x: Math.min(start.x, x),
        y: Math.min(start.y, y),
        width: Math.abs(x - start.x),
        height: Math.abs(y - start.y),
      };

      box.style.left = `${current.x}px`;
      box.style.top = `${current.y}px`;
      box.style.width = `${current.width}px`;
      box.style.height = `${current.height}px`;
      box.toggleAttribute(
        'data-low',
        current.y + current.height > innerHeight - 32
      );
      size.textContent = `${Math.round(current.width)} × ${Math.round(current.height)}`;
    }

    function reset() {
      start = undefined;
      box.hidden = true;
      hint.hidden = false;
      layer.removeAttribute('data-dragging');
      layer.focus();
    }

    function finish(area: Picked) {
      removeEventListener('keydown', onKeyDown, true);
      removeEventListener('wheel', onWheel, true);
      host.remove();

      // Two frames, so the page has painted without the overlay.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(area)));
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      event.stopPropagation();
      finish('cancelled');
    }

    // Scrolling mid-drag would move the page under a box drawn on the screen.
    function onWheel(event: WheelEvent) {
      if (start) event.preventDefault();
    }

    layer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;

      event.preventDefault();
      layer.setPointerCapture(event.pointerId);
      start = { x: event.clientX, y: event.clientY };
      hint.hidden = true;
      box.hidden = false;
      layer.setAttribute('data-dragging', '');
      draw(event.clientX, event.clientY);
    });

    layer.addEventListener('pointermove', (event) => {
      draw(event.clientX, event.clientY);
    });

    layer.addEventListener('pointerup', (event) => {
      if (!start) return;

      draw(event.clientX, event.clientY);

      if (current.width < MIN_SIZE || current.height < MIN_SIZE) {
        reset();

        return;
      }

      finish({ ...current, viewportWidth: innerWidth, scrollX, scrollY });
    });

    layer.addEventListener('pointercancel', reset);
    addEventListener('keydown', onKeyDown, true);
    addEventListener('wheel', onWheel, { capture: true, passive: false });
  });
}

const pickedSchema = z.array(
  z.object({
    result: z.union([areaSchema, z.enum(['cancelled', 'busy'])]).nullish(),
  })
);

/**
 * Lets you drag out an area of the tab. Pages that refuse scripts, like the
 * browser's own, reject with copy that says what to do.
 */
export async function selectArea(tabId: number): Promise<Picked> {
  let results: unknown;

  try {
    results = await browser.scripting.executeScript({
      target: { tabId },
      func: pickArea,
    });
  } catch (cause) {
    throw new CaptureError(
      'The browser doesn’t allow selecting an area on this page. Open a website and try again.',
      { cause }
    );
  }

  // A page that went away mid-pick gives nothing back: there's no area.
  return pickedSchema.parse(results)[0]?.result ?? 'cancelled';
}

const viewSchema = z.array(
  z.object({
    result: z.object({
      viewportWidth: z.number(),
      scrollX: z.number(),
      scrollY: z.number(),
    }),
  })
);

/**
 * Whether the tab still shows the area where it was picked: after a scroll
 * or a resize, the same box would capture something else.
 */
export async function stillShowing(tabId: number, area: Area) {
  let results: unknown;

  try {
    results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({ viewportWidth: innerWidth, scrollX, scrollY }),
    });
  } catch (cause) {
    // A page that can't be read now can't be captured either.
    console.error('Could not read where the page is scrolled', cause);

    return false;
  }

  const view = viewSchema.safeParse(results).data?.[0]?.result;

  return (
    view !== undefined &&
    view.viewportWidth === area.viewportWidth &&
    Math.round(view.scrollX) === Math.round(area.scrollX) &&
    Math.round(view.scrollY) === Math.round(area.scrollY)
  );
}

/**
 * The popup asks the background to pick an area: clicking the page closes
 * the popup, and anything it was waiting on with it.
 */
export const selectAreaRequestSchema = z.object({
  type: z.literal('select-area'),
  tabId: z.number(),
  windowId: z.number(),
  /** What the popup's draft held, to give back when it opens again. */
  note: z.string().optional(),
  destinationId: z.string().optional(),
  /** The draft's files, saved so cancelling gives them back. */
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
});

export type SelectAreaRequest = z.infer<typeof selectAreaRequestSchema>;

/**
 * What the popup gets back once the area is picked: its draft, with the
 * screenshot added to its files, and why there's no screenshot if there
 * isn't one. Kept in session storage (memory only) and read once.
 */
const handoffSchema = z.object({
  at: z.number(),
  tabId: z.number(),
  note: z.string().optional(),
  destinationId: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  problem: z.string().optional(),
});

type AreaHandoff = z.infer<typeof handoffSchema>;

const HANDOFF_KEY = 'areaHandoff';

/** Long enough to come back to; an older one is dropped. */
const HANDOFF_FOR = 5 * 60_000;

async function storedHandoff(): Promise<AreaHandoff | undefined> {
  const stored = await browser.storage.session.get(HANDOFF_KEY);

  return handoffSchema.safeParse(stored[HANDOFF_KEY]).data;
}

const fresh = (handoff: AreaHandoff) => Date.now() - handoff.at < HANDOFF_FOR;

function deleteFiles(files: Attachment[] | undefined) {
  return Promise.all((files ?? []).map((file) => deleteAttachment(file.id)));
}

/** Leaves the draft for the popup, deleting the files of one it replaces. */
async function leaveForPopup(handoff: AreaHandoff) {
  const kept = new Set(handoff.attachments?.map((file) => file.id));
  const replaced = (await storedHandoff())?.attachments ?? [];

  await browser.storage.session.set({ [HANDOFF_KEY]: handoff });
  await deleteFiles(replaced.filter((file) => !kept.has(file.id)));
}

/** Whether a draft waits for the popup, which the toolbar badge points to. */
export async function handoffWaiting(): Promise<boolean> {
  const handoff = await storedHandoff();

  return handoff !== undefined && fresh(handoff);
}

/** The handoff for this tab, once; another tab's waits for that tab. */
export async function takeHandoff(
  tabId: number
): Promise<AreaHandoff | undefined> {
  const handoff = await storedHandoff();

  if (handoff?.tabId !== tabId) return undefined;

  await browser.storage.session.remove(HANDOFF_KEY);

  if (fresh(handoff)) return handoff;

  await deleteFiles(handoff.attachments);

  return undefined;
}

/**
 * Picks an area for the popup and leaves its draft for it with the
 * screenshot, or why there isn't one. False while another pick is under way
 * in the tab: that one gives the popup its draft.
 */
export async function pickForPopup(
  request: SelectAreaRequest,
  pick: () => Promise<Picked>,
  capture: typeof captureTab = captureTab
): Promise<boolean> {
  const attachments = [...(request.attachments ?? [])];
  let problem: string | undefined;

  try {
    const picked = await pick();

    if (picked === 'busy') {
      await deleteFiles(attachments);

      return false;
    }

    // The popup asks only with room for one more; this keeps to the limit.
    if (picked !== 'cancelled' && attachments.length < MAX_ATTACHMENTS) {
      const file = await capture(request.windowId, picked);
      const screenshot = attachmentInfo(file);

      await saveAttachment(screenshot.id, file);
      attachments.push(screenshot);
    }
  } catch (cause) {
    console.error('Could not take the screenshot', cause);
    problem = captureFailure(cause);
  }

  await leaveForPopup({
    at: Date.now(),
    tabId: request.tabId,
    ...(request.note && { note: request.note }),
    ...(request.destinationId && { destinationId: request.destinationId }),
    ...(attachments.length > 0 && { attachments }),
    ...(problem && { problem }),
  });

  return true;
}
