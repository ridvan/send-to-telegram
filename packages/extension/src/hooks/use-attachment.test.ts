import { describe, expect, it } from 'vitest';

import { admit } from './use-attachment.ts';

const files = (count: number) =>
  Array.from({ length: count }, (_, index) => new File(['x'], `${index}.png`));

describe('admit', () => {
  it('takes up to ten files', () => {
    const ten = files(10);

    expect(admit(ten, 0)).toEqual({ accepted: ten, problem: undefined });
  });

  it('refuses an eleventh file, saying the limit', () => {
    expect(admit(files(1), 10)).toEqual({
      accepted: [],
      problem: {
        title: 'Can’t attach more files',
        message:
          'A message takes up to 10 files. Remove one to attach another.',
      },
    });
  });

  it('attaches what fits and says how many didn’t', () => {
    const { accepted, problem } = admit(files(5), 7);

    expect(accepted).toHaveLength(3);
    expect(problem?.message).toBe(
      'A message takes up to 10 files, so 2 files weren’t attached. Remove some to attach the rest.'
    );
  });

  it('names the file it can’t send among several', () => {
    const { accepted, problem } = admit(
      [new File([], 'empty.txt'), new File(['x'], 'ok.txt')],
      0
    );

    expect(accepted.map((file) => file.name)).toEqual(['ok.txt']);
    expect(problem?.message).toBe('“empty.txt” is empty. Pick another one.');
  });

  it('keeps the single-file wording for one file', () => {
    expect(admit([new File([], 'a.txt')], 0).problem?.message).toBe(
      'This file is empty. Pick another one.'
    );
  });
});
