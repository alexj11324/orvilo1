import { PROJECT_HEALTH_STATES } from '@orvilo/types';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PROJECT_HEALTH_META, ProjectHealthIcon } from './healthMeta';

/**
 * Regression coverage for the health/status semantics correction: health is
 * the latest project update's traffic light (a filled colored dot), never a
 * status glyph like a checkmark — `offTrack` must read red, not "done".
 */
describe('PROJECT_HEALTH_META', () => {
  it('maps every update state to its traffic-light color token', () => {
    expect(PROJECT_HEALTH_META.onTrack.color).toBe('colorSuccess');
    expect(PROJECT_HEALTH_META.atRisk.color).toBe('colorWarning');
    expect(PROJECT_HEALTH_META.offTrack.color).toBe('colorError');
  });

  it('maps every update state to a valid Tag preset — never a token name', () => {
    // `Tag color` accepts the lobehub system presets, not antd token names:
    // `colorError` used to flow in raw and paint an invalid CSS background.
    for (const state of PROJECT_HEALTH_STATES) {
      expect(['error', 'success', 'warning'], state).toContain(PROJECT_HEALTH_META[state].tag);
    }
  });

  it('covers every ProjectHealth state with a list.health label', () => {
    for (const state of PROJECT_HEALTH_STATES) {
      expect(PROJECT_HEALTH_META[state].key, state).toBe(`list.health.${state}`);
    }
  });
});

describe('ProjectHealthIcon', () => {
  it('renders a filled dot for every update health state', () => {
    for (const state of PROJECT_HEALTH_STATES) {
      const { container, unmount } = render(<ProjectHealthIcon health={state} />);
      const svg = container.querySelector('svg');
      // lucide `circle` renders a <circle> node; a checkmark/octagon renders
      // <path> nodes. The dot must paint itself — 'none'/'transparent' stays
      // a hollow outline.
      expect(svg?.querySelector('circle'), state).not.toBeNull();
      const fill = svg?.getAttribute('fill');
      expect(fill, state).toBeTruthy();
      expect(fill, state).not.toBe('none');
      expect(fill, state).not.toBe('transparent');
      unmount();
    }
  });

  it('renders the gray dashed glyph when the project has no update', () => {
    const { container } = render(<ProjectHealthIcon health={null} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // CircleDashedIcon is stroke-only path segments — no solid circle and
    // no painted fill.
    expect(svg?.querySelector('circle')).toBeNull();
    expect(['none', 'transparent', null]).toContain(svg?.getAttribute('fill'));
  });

  it('treats an unknown health value like no update instead of crashing', () => {
    const { container } = render(<ProjectHealthIcon health={'bogus' as never} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
