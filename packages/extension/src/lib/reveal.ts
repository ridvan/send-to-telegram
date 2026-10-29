/** The chat's row for a message, by its `chatKey`. */
export function chatRowId(key: string) {
  return `chat-${key}`;
}

/**
 * Scrolls the chat to a message and flashes it, as Telegram does after a
 * search. The row must already be on the page.
 */
export function revealMessage(key: string) {
  const row = document.getElementById(chatRowId(key));

  const brand = getComputedStyle(document.documentElement)
    .getPropertyValue('--brand')
    .trim();

  row?.scrollIntoView({ block: 'center' });
  row?.firstElementChild?.animate(
    [
      { boxShadow: `0 0 0 3px color-mix(in oklch, ${brand} 55%, transparent)` },
      { boxShadow: '0 0 0 3px transparent' },
    ],
    { duration: 1600, easing: 'ease-out' }
  );
}
