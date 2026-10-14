interface PlanNode {
  id: string;
  identifier: string;
  name?: string | null;
}

interface PlanEdge {
  dependsOnId: string;
  taskId: string;
  type: string;
}

/** Mermaid node ids are generated; user-authored labels cannot inject graph syntax. */
export const issuePlanGraph = (nodes: PlanNode[], dependencies: PlanEdge[]) => {
  const nodeIds = new Map(nodes.map((node, index) => [node.id, `issue${index}`]));
  const edges = dependencies.filter(
    (edge) => edge.type === 'blocks' && nodeIds.has(edge.dependsOnId) && nodeIds.has(edge.taskId),
  );
  const label = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('\n', ' ');
  const graph = [
    'flowchart TD',
    ...nodes.map(
      (node) =>
        `  ${nodeIds.get(node.id)}["${label(`${node.identifier} ${node.name ?? ''}`.trim())}"]`,
    ),
    ...edges.map((edge) => `  ${nodeIds.get(edge.dependsOnId)} --> ${nodeIds.get(edge.taskId)}`),
  ].join('\n');
  return { edges, graph };
};
