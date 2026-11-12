import { describe, expect, it } from 'vitest';

import { parseMenuId } from './menus.ts';

describe('parseMenuId', () => {
  it('reads a send to the default chat', () => {
    expect(parseMenuId('send:page::')).toEqual({ draft: { kind: 'page' } });
  });

  it('reads a screenshot with its chat and hashtag', () => {
    expect(parseMenuId('shot:page:chat-1:ideas')).toEqual({
      capture: 'visible',
      draft: { kind: 'page', destinationId: 'chat-1', tag: 'ideas' },
    });
  });

  it('reads a screenshot of an area', () => {
    expect(parseMenuId('area:page::')).toEqual({
      capture: 'area',
      draft: { kind: 'page' },
    });
  });

  it('reads a video or song sent from its menu item', () => {
    expect(parseMenuId('send:video:chat-1:')).toEqual({
      draft: { kind: 'video', destinationId: 'chat-1' },
    });
    expect(parseMenuId('send:audio::music')).toEqual({
      draft: { kind: 'audio', tag: 'music' },
    });
  });

  it('ignores ids it did not make', () => {
    expect(parseMenuId('snap:page::')).toBeUndefined();
    expect(parseMenuId('send:movie::')).toBeUndefined();
  });
});
