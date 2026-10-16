import { describe, expect, it } from 'vitest';

import { searchAgentsResultsPrompt } from './searchAgentsResultsPrompt';

describe('searchAgentsResultsPrompt', () => {
  it('renders a plain headline plus a compact <agent> element per result', () => {
    const content = searchAgentsResultsPrompt({
      agents: [{ description: 'My CC machine', id: 'agt_1', title: 'CC 2号机' }],
      hasMore: false,
      offset: 0,
      userTotal: 1,
    });

    expect(content).toContain('Found 1 agent in your workspace, showing 1-1:');
    expect(content).toContain(
      '<agent id="agt_1" title="CC 2号机" origin="workspace">My CC machine',
    );
    // the result is not wrapped in an XML container
    expect(content).not.toContain('<agentSearchResults');
  });

  it('marks heterogeneous agents and appends a plain Note: guidance line', () => {
    const content = searchAgentsResultsPrompt({
      agents: [{ heteroType: 'claude-code', id: 'agt_cc', title: 'CC 2号机' }],
      userTotal: 1,
    });

    expect(content).toContain('heteroType="claude-code"');
    expect(content).not.toContain('<note>');
    expect(content).toContain('\n\nNote: ');
    expect(content).toContain('heterogeneous agents');
  });

  it('returns a plain empty hint when there are no agents', () => {
    const content = searchAgentsResultsPrompt({ agents: [], userTotal: 0 });

    expect(content).toContain('No agents matched');
    expect(content).not.toContain('<agent');
  });

  it('explains an out-of-range offset instead of claiming no matches', () => {
    const content = searchAgentsResultsPrompt({
      agents: [],
      offset: 200,
      userTotal: 37,
    });

    expect(content).toContain('No agents at offset 200; only 37 match');
  });

  it('appends a pagination hint when more workspace agents exist', () => {
    const content = searchAgentsResultsPrompt({
      agents: Array.from({ length: 20 }, (_, i) => ({ id: `agt_${i}`, title: `Agent ${i}` })),
      hasMore: true,
      offset: 0,
      userTotal: 137,
    });

    expect(content).toContain('call searchAgent with offset=20');
  });

  it('warns when the requested limit was capped', () => {
    const content = searchAgentsResultsPrompt({
      agents: [{ id: 'agt_1', title: 'Agent One' }],
      maxLimit: 20,
      requestedLimit: 50,
      userTotal: 1,
    });

    expect(content).toContain('Requested limit 50 exceeds the maximum of 20');
  });
});
