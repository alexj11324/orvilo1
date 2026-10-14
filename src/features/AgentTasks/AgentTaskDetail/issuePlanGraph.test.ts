import { describe, expect, it } from 'vitest';

import { issuePlanGraph } from './issuePlanGraph';

describe('issuePlanGraph', () => {
  it('renders real blocks from predecessor to dependent and keeps unrelated nodes independent', () => {
    const nodes = ['a', 'b', 'c'].map((id) => ({ id, identifier: id }));
    const result = issuePlanGraph(nodes, [
      { dependsOnId: 'b', taskId: 'a', type: 'blocks' },
      { dependsOnId: 'c', taskId: 'a', type: 'relates' },
    ]);
    expect(result.graph).toContain('issue1 --> issue0');
    expect(result.graph).not.toContain('issue2 -->');
    expect(result.edges).toEqual([{ dependsOnId: 'b', taskId: 'a', type: 'blocks' }]);
  });

  it('includes child to parent dependencies when the parent is a graph node', () => {
    const result = issuePlanGraph(
      [
        { id: 'parent', identifier: 'T-1' },
        { id: 'child', identifier: 'T-2' },
      ],
      [{ dependsOnId: 'child', taskId: 'parent', type: 'blocks' }],
    );
    expect(result.graph).toContain('issue1 --> issue0');
    expect(result.edges).toHaveLength(1);
  });

  it('escapes user labels without making names or ids executable Mermaid syntax', () => {
    const { graph } = issuePlanGraph(
      [{ id: 'a --> b', identifier: 'T-1', name: '"] --> injected["<script>\nline' }],
      [],
    );
    expect(graph).toContain('issue0["T-1 &quot;] --&gt; injected[&quot;&lt;script&gt; line"]');
    expect(graph).not.toContain('a --> b');
  });
});
