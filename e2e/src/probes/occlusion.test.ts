import { describe, expect, it } from 'vitest';

import { classifyOcclusion, type OcclusionPoint } from './occlusion';

const clear = (): OcclusionPoint => ({ hit: 'svg', inside: true });
const under = (hit: string): OcclusionPoint => ({ hit, inside: false });

describe('classifyOcclusion', () => {
  it('passes a control that is on top at its centre and corners', () => {
    expect(
      classifyOcclusion([
        { control: 'priority', points: [clear(), clear(), clear(), clear(), clear()] },
      ]),
    ).toEqual([]);
  });

  it('flags a partial overlap whose centre stays clear, naming the blocker', () => {
    // The My issues regression: a hover checkbox floated over the left half of
    // the priority mark — the centre point alone never saw it.
    const checkbox = 'span.work-query-bulk-check';
    expect(
      classifyOcclusion([
        {
          control: 'priority',
          points: [clear(), under(checkbox), clear(), under(checkbox), clear()],
        },
      ]),
    ).toEqual([{ control: 'priority', coveredBy: checkbox, coveredPoints: 2 }]);
  });

  it('flags a control whose centre is covered', () => {
    const chip = 'span[data-issue-row-chip]';
    expect(
      classifyOcclusion([
        { control: 'title', points: [under(chip), clear(), clear(), clear(), clear()] },
      ]),
    ).toEqual([{ control: 'title', coveredBy: chip, coveredPoints: 1 }]);
  });
});
