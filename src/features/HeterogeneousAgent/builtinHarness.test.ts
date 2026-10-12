import { describe, expect, it } from 'vitest';

import { isAgentWithheld } from './builtinHarness';

describe('isAgentWithheld', () => {
  it('withholds nothing while the built-in harness is offered', () => {
    expect(isAgentWithheld({ builtinOffered: true, isBuiltinAgent: true, listed: undefined })).toBe(
      false,
    );
  });

  it('withholds a built-in Agent, which no list carries', () => {
    expect(
      isAgentWithheld({ builtinOffered: false, isBuiltinAgent: true, listed: undefined }),
    ).toBe(true);
  });

  it.each([
    ['orvilo', true],
    [null, true],
    ['claude-code', false],
  ])('judges a listed Agent on runtime %s by that runtime', (heterogeneousType, withheld) => {
    expect(
      isAgentWithheld({
        builtinOffered: false,
        isBuiltinAgent: false,
        listed: { heterogeneousType },
      }),
    ).toBe(withheld);
  });

  // Another member's Agent may be assigned without being in the reader's list.
  it('leaves an unlisted Agent alone', () => {
    expect(
      isAgentWithheld({ builtinOffered: false, isBuiltinAgent: false, listed: undefined }),
    ).toBe(false);
  });
});
