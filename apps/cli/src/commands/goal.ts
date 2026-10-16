import type {
  GoalEdgeKind,
  GoalGraphDecision,
  GoalGraphSnapshot,
  GoalNodeKind,
} from '@orvilo/types';
import type { Command } from 'commander';
import pc from 'picocolors';

import { getTrpcClient } from '../api/client';
import { outputJson, printTable, truncate } from '../utils/format';
import { log } from '../utils/logger';

// Typed rather than inferred: an `as const` map is indexable by a widened
// `any` node kind, which is how a renamed kind silently printed `undefined`
// here after the type checker had signed off everywhere else.
const nodeIcon: Record<GoalNodeKind, string> = {
  decision: '◆',
  experiment: '⚗',
  finding: '●',
  problem: '◇',
  task: '▣',
};
/**
 * Every edge kind reads `source <kind> target`, so a row listing its INCOMING
 * edges by kind states the relationship backwards: an incoming `depends_on`
 * means the other node depends on THIS one, not the reverse. Render the inverse
 * verb instead, so each entry is a true sentence about the row it sits on.
 */
const inverseEdgeLabel: Record<GoalEdgeKind, string> = {
  answers: 'answered by',
  contains: 'inside',
  contradicts: 'contradicted by',
  decomposes: 'part of',
  depends_on: 'blocks',
  derived_from: 'ancestor of',
  investigates: 'investigated by',
  leads_to: 'follows',
  produces: 'produced by',
  supports: 'supported by',
};

function printGraph(graph: GoalGraphSnapshot) {
  console.log(`\n${pc.bold(graph.goal.title)} ${pc.dim(graph.goal.id)} [${graph.goal.status}]`);
  if (graph.goal.requirement) console.log(`${pc.dim('Requirement:')} ${graph.goal.requirement}`);
  const incoming = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.targetNodeId) ?? [];
    list.push(edge);
    incoming.set(edge.targetNodeId, list);
  }
  const rows = graph.nodes.map((node) => {
    const relations = (incoming.get(node.id) ?? [])
      .map((edge) => `${inverseEdgeLabel[edge.kind] ?? edge.kind} ${edge.sourceNodeId.slice(0, 8)}`)
      .join(', ');
    return [
      `${nodeIcon[node.kind]} ${node.kind}`,
      node.status,
      truncate(node.title, 46),
      node.taskId ?? '-',
      relations || '-',
      node.id,
    ];
  });
  console.log();
  printTable(rows, ['TYPE', 'STATUS', 'TITLE', 'TASK', 'RELATIONS', 'NODE ID']);
}

export function registerGoalCommand(program: Command) {
  const goal = program.command('goal').description('Read historical Goal Graphs');

  goal
    .command('list')
    .description('List goals with their graph roll-up')
    .option('--agent <id>', 'Filter by responsible agent')
    .option('--project <id>', 'Filter by project')
    .option('--status <status...>', 'Filter by lifecycle status')
    .option('--limit <n>', 'Maximum rows', '50')
    .option('--json [fields]', 'Output JSON')
    .action(async (options) => {
      const result = await (
        await getTrpcClient()
      ).goal.list.query({
        agentId: options.agent,
        limit: Number.parseInt(options.limit, 10),
        projectId: options.project,
        statuses: options.status,
      });
      if (options.json !== undefined) return outputJson(result.goals, options.json);
      if (result.goals.length === 0) return log.info('No goals yet.');
      printTable(
        result.goals.map((item) => [
          item.goal.status,
          truncate(item.goal.title, 44),
          `${item.taskDone}/${item.taskTotal}`,
          String(item.findingCount),
          item.pendingDecisions > 0 ? pc.yellow(String(item.pendingDecisions)) : '-',
          `$${item.totalRunCost.toFixed(2)}`,
          item.goal.id,
        ]),
        ['STATUS', 'TITLE', 'TASKS', 'FINDINGS', 'NEEDS YOU', 'COST', 'GOAL ID'],
      );
    });

  const show = async (id: string, options: { json?: boolean | string }) => {
    const result = await (await getTrpcClient()).goal.graph.query({ id });
    if (options.json !== undefined) return outputJson(result.data, options.json);
    printGraph(result.data);
  };
  goal
    .command('show <id>')
    .description('Show goal and graph')
    .option('--json [fields]', 'Output JSON')
    .action(show);
  goal
    .command('graph <id>')
    .description('Show the Goal Graph')
    .option('--json [fields]', 'Output JSON')
    .action(show);

  goal
    .command('supervision <id>')
    .description('Inspect recovery incidents, diagnostic topic and effective recovery rate')
    .action(async (id: string) => {
      const result = await (await getTrpcClient()).goal.supervision.query({ id });
      outputJson(result.data);
    });

  goal
    .command('decisions <id>')
    .description('List durable decision gates')
    .option('--json [fields]', 'Output JSON')
    .action(async (id: string, options) => {
      const graph = (await (await getTrpcClient()).goal.graph.query({ id })).data;
      if (options.json !== undefined) return outputJson(graph.decisions, options.json);
      printTable(
        graph.decisions.map((decision: GoalGraphDecision) => [
          decision.status,
          truncate(decision.question, 60),
          decision.recommendedOptionId ?? '-',
          decision.id,
        ]),
        ['STATUS', 'QUESTION', 'RECOMMENDED', 'DECISION ID'],
      );
    });
}
