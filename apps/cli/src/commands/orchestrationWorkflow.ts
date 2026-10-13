import { readFile } from 'node:fs/promises';

import type {
  OrchestrationWorkflowEdgeKind,
  OrchestrationWorkflowGraphDecision,
  OrchestrationWorkflowGraphSnapshot,
  OrchestrationWorkflowNodeKind,
  OrchestrationWorkflowTickResult,
} from '@orvilo/types';
import type { Command } from 'commander';
import pc from 'picocolors';

import { getTrpcClient } from '../api/client';
import { outputJson, printTable, truncate } from '../utils/format';
import { log } from '../utils/logger';
import { resolveAppUrlBuilder } from './task/url';

// Typed rather than inferred: an `as const` map is indexable by a widened
// `any` node kind, which is how a renamed kind silently printed `undefined`
// here after the type checker had signed off everywhere else.
const nodeIcon: Record<OrchestrationWorkflowNodeKind, string> = {
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
const inverseEdgeLabel: Record<OrchestrationWorkflowEdgeKind, string> = {
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

const terminalOutcomes = new Set(['achieved', 'waiting_human', 'no_progress', 'failed']);

/** Backoff bounds for a transient `orchestration workflow tick` failure. */
const TICK_RETRY_BASE_MS = 1000;
const TICK_RETRY_MAX_MS = 30_000;

/**
 * tRPC codes that are a verdict about the REQUEST, not about the trip to the
 * server: retrying them just reproduces the same answer. Everything else —
 * including a transport failure that never reached tRPC — is treated as a blip
 * worth surviving, because `orchestration workflow run` is meant to be left unattended for hours
 * and a dropped socket must not end the run half-way.
 */
const fatalTickCodes = new Set([
  'BAD_REQUEST',
  'CONFLICT',
  'FORBIDDEN',
  'NOT_FOUND',
  'PARSE_ERROR',
  'UNAUTHORIZED',
]);

const trpcErrorCode = (error: unknown): string | undefined => {
  const value = error as { data?: { code?: string }; shape?: { data?: { code?: string } } };
  return value?.data?.code ?? value?.shape?.data?.code;
};

/**
 * A transport-level failure (`fetch failed`, ECONNRESET, a 502 from a proxy)
 * carries no tRPC envelope at all, so the ABSENCE of a code is the signal that
 * the request never got a verdict. Erring towards retry keeps an unrecognised
 * error shape from killing a multi-hour run.
 */
const isRetryableTickError = (error: unknown) => {
  const code = trpcErrorCode(error);
  return code === undefined || !fatalTickCodes.has(code);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run one coordinator tick, riding out transient failures until `retryWindowMs`
 * of CONSECUTIVE failure has elapsed. The window is wall-clock rather than an
 * attempt count so a long outage is survivable without making the backoff
 * pointlessly aggressive; each delay is also clamped to what's left of the
 * window so the command never sleeps past its own budget (and so a tiny window
 * stays fast instead of blocking on the first 1s backoff).
 */
const tickWithRetry = async <T>(
  tick: () => Promise<T>,
  retryWindowMs: number,
  onRetry: (error: unknown, delayMs: number) => void,
): Promise<T> => {
  const deadline = Date.now() + retryWindowMs;
  for (let attempt = 0; ; attempt++) {
    try {
      return await tick();
    } catch (error) {
      const remaining = deadline - Date.now();
      if (!isRetryableTickError(error) || remaining <= 0) throw error;
      const delay = Math.min(TICK_RETRY_BASE_MS * 2 ** attempt, TICK_RETRY_MAX_MS, remaining);
      onRetry(error, delay);
      await sleep(delay);
    }
  }
};

interface OrchestrationWorkflowRunTickResult extends OrchestrationWorkflowTickResult {
  pollCount?: number;
  waitedMs?: number;
}

const isSameWaitingState = (
  previous: OrchestrationWorkflowRunTickResult | undefined,
  current: OrchestrationWorkflowTickResult,
) =>
  previous?.outcome === 'waiting_external' &&
  current.outcome === 'waiting_external' &&
  previous.message === current.message &&
  previous.nodeId === current.nodeId &&
  previous.taskId === current.taskId;

function printGraph(graph: OrchestrationWorkflowGraphSnapshot) {
  console.log(
    `\n${pc.bold(graph.orchestrationWorkflow.title)} ${pc.dim(graph.orchestrationWorkflow.id)} [${graph.orchestrationWorkflow.status}]`,
  );
  if (graph.orchestrationWorkflow.requirement)
    console.log(`${pc.dim('Requirement:')} ${graph.orchestrationWorkflow.requirement}`);
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

function printTick(result: OrchestrationWorkflowTickResult) {
  const icon =
    result.outcome === 'achieved'
      ? pc.green('✓')
      : result.outcome === 'waiting_human'
        ? pc.yellow('◆')
        : result.outcome === 'failed'
          ? pc.red('✗')
          : pc.blue('→');
  console.log(`${icon} ${pc.bold(result.outcome)} ${result.message}`);
  if (result.taskId) console.log(`  ${pc.dim(`task: ${result.taskId}`)}`);
  if (result.nodeId) console.log(`  ${pc.dim(`node: ${result.nodeId}`)}`);
}

export function registerOrchestrationWorkflowCommand(program: Command) {
  const orchestrationWorkflow = program
    .command('orchestration-workflow')
    .description('Run long-horizon Orchestration workflow Graphs');
  orchestrationWorkflow
    .command('submit-draft')
    .description('Submit the current ACP planning round result')
    .requiredOption('--file <path>', 'JSON result matching the server-issued planning schema')
    .requiredOption('--token <token>', 'Server-issued planning round token')
    .option('--operation <id>', 'Defaults to ORVILO_OPERATION_ID')
    .action(async (options: { file: string; token: string; operation?: string }) => {
      const operationId = options.operation ?? process.env.ORVILO_OPERATION_ID;
      if (!operationId) throw new Error('Current planning operation ID required');
      const client = await getTrpcClient();
      const jwt = process.env.ORVILO_JWT;
      const operationToken =
        jwt &&
        JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).purpose ===
          'hetero-operation';
      const endpoint = operationToken
        ? client.orchestrationWorkflow.submitOperationDraft
        : client.orchestrationWorkflow.submitDraft;
      await endpoint.mutate({
        operationId,
        token: options.token,
        result: JSON.parse(await readFile(options.file, 'utf8')),
      });
      console.log('Planning result recorded.');
    });

  orchestrationWorkflow
    .command('plan <id>')
    .description('Atomically submit the current main Agent plan')
    .requiredOption(
      '--file <path>',
      'JSON plan: action tasks/verify/retry/escalate, reason and action fields',
    )
    .requiredOption('--token <token>', 'Current server-issued planning turn token')
    .option('--operation <id>', 'Defaults to ORVILO_OPERATION_ID')
    .option('--json', 'Output JSON')
    .action(
      async (
        id: string,
        options: { file: string; token: string; operation?: string; json?: boolean },
      ) => {
        const operationId = options.operation ?? process.env.ORVILO_OPERATION_ID;
        if (!operationId) throw new Error('Current manager operation ID required');
        const client = await getTrpcClient();
        const injectedJwt = process.env.ORVILO_JWT;
        const isOperationToken =
          injectedJwt &&
          JSON.parse(Buffer.from(injectedJwt.split('.')[1], 'base64url').toString()).purpose ===
            'hetero-operation';
        const endpoint = isOperationToken
          ? client.orchestrationWorkflow.submitOperationPlan
          : client.orchestrationWorkflow.submitPlan;
        const result = await endpoint.mutate({
          id,
          token: options.token,
          operationId,
          plan: JSON.parse(await readFile(options.file, 'utf8')),
        });
        if (options.json) outputJson(result.data);
        else
          console.log('Plan recorded; the coordinator will continue after this Agent turn exits.');
      },
    );

  orchestrationWorkflow
    .command('create <title>')
    .option(
      '--max-manager-turns <n>',
      'Add a main Agent with this turn limit; it takes over problems the system planner cannot route',
    )
    .description('Create a standalone orchestration workflow and seed its graph')
    .option('-r, --requirement <text>', 'Acceptance requirement')
    .option(
      '-i, --instruction <text>',
      "The ask in the user's own words, shown on the problem node",
    )
    .option('-t, --task <title...>', 'Initial task node titles (omit to let the planner decompose)')
    .option('--agent <id>', 'Responsible agent ID')
    .option('--project <id>', 'Project ID')
    .option('--explore <instruction>', 'Explore alternatives using completed experiment results')
    .option('--max-experiments <n>', 'Maximum experiment nodes (requires --explore, default 10)')
    .option('--supervise', 'Enable bounded recovery supervision in an independent topic')
    .option(
      '--max-supervision-incidents <n>',
      'Maximum supervised interruptions (default 10, maximum 100)',
    )
    .option('--max-rounds <n>', 'Maximum orchestration workflow rounds')
    .option('--max-cost <usd>', 'Maximum total cost in USD')
    .option('--max-attempts-per-task <n>', 'Attempts per Task before opening a decision gate')
    .option(
      '--max-concurrent-tasks <n>',
      "How many of this orchestration workflow's tasks may run at once (default 3)",
    )

    .option('--max-steps-per-run <n>', 'Optional agent step cap per Task run (for example 500)')
    .option(
      '--operation-lease-timeout-ms <n>',
      'Reclaim a Task operation after this idle time (minimum: 60000)',
    )
    .option('--json [fields]', 'Output JSON')
    .action(async (title: string, options) => {
      if (options.maxExperiments && !options.explore) {
        throw new Error('--max-experiments requires --explore');
      }
      const client = await getTrpcClient();
      const buildUrl = await resolveAppUrlBuilder(client);
      const result = await client.orchestrationWorkflow.create.mutate({
        agentId: options.agent ?? process.env.ORVILO_AGENT_ID,
        createdByAgentId: process.env.ORVILO_AGENT_ID,
        config:
          options.maxManagerTurns ||
          options.explore ||
          options.supervise ||
          options.maxAttemptsPerTask ||
          options.maxStepsPerRun ||
          options.operationLeaseTimeoutMs ||
          options.maxConcurrentTasks
            ? {
                manager: options.maxManagerTurns
                  ? { maxTurns: Number(options.maxManagerTurns) }
                  : undefined,
                exploration: options.explore
                  ? {
                      instruction: options.explore,
                      maxExperiments: Number(options.maxExperiments ?? 10),
                    }
                  : undefined,
                supervision: options.supervise
                  ? {
                      enabled: true,
                      maxIncidents: options.maxSupervisionIncidents
                        ? Number.parseInt(options.maxSupervisionIncidents, 10)
                        : undefined,
                    }
                  : undefined,
                maxConcurrentTasks: options.maxConcurrentTasks
                  ? Number.parseInt(options.maxConcurrentTasks, 10)
                  : undefined,
                recovery: {
                  maxAttemptsPerTask: options.maxAttemptsPerTask
                    ? Number.parseInt(options.maxAttemptsPerTask, 10)
                    : undefined,
                  maxStepsPerRun: options.maxStepsPerRun
                    ? Number.parseInt(options.maxStepsPerRun, 10)
                    : undefined,
                  operationLeaseTimeoutMs: options.operationLeaseTimeoutMs
                    ? Number.parseInt(options.operationLeaseTimeoutMs, 10)
                    : undefined,
                },
              }
            : undefined,
        maxRounds: options.maxRounds ? Number.parseInt(options.maxRounds, 10) : undefined,
        maxTotalCost: options.maxCost ? Number.parseFloat(options.maxCost) : undefined,
        problemDescription: options.instruction,
        projectId: options.project,
        requirement: options.requirement,
        title,
        tasks: options.task,
      });
      // `orchestrationWorkflow.create` returns the whole graph snapshot, so the id is on its
      // orchestration workflow — `result.data.id` is undefined, and the CLI cannot resolve the
      // router's types to catch that, which is how it reached a printed URL.
      const url = buildUrl('/tasks');
      if (options.json !== undefined) return outputJson({ ...result.data, url }, options.json);
      printGraph(result.data);
      console.log(`${pc.bold('orchestrationWorkflow')}: ${url}`);
    });

  orchestrationWorkflow
    .command('list')
    .description('List orchestration workflows with their graph roll-up')
    .option('--agent <id>', 'Filter by responsible agent')
    .option('--project <id>', 'Filter by project')
    .option('--status <status...>', 'Filter by lifecycle status')
    .option('--limit <n>', 'Maximum rows', '50')
    .option('--json [fields]', 'Output JSON')
    .action(async (options) => {
      const result = await (
        await getTrpcClient()
      ).orchestrationWorkflow.list.query({
        agentId: options.agent,
        limit: Number.parseInt(options.limit, 10),
        projectId: options.project,
        statuses: options.status,
      });
      if (options.json !== undefined)
        return outputJson(result.orchestrationWorkflows, options.json);
      if (result.orchestrationWorkflows.length === 0)
        return log.info('No orchestration workflows yet.');
      printTable(
        result.orchestrationWorkflows.map((item) => [
          item.orchestrationWorkflow.status,
          truncate(item.orchestrationWorkflow.title, 44),
          `${item.taskDone}/${item.taskTotal}`,
          String(item.findingCount),
          item.pendingDecisions > 0 ? pc.yellow(String(item.pendingDecisions)) : '-',
          `$${item.totalRunCost.toFixed(2)}`,
          item.orchestrationWorkflow.id,
        ]),
        ['STATUS', 'TITLE', 'TASKS', 'FINDINGS', 'NEEDS YOU', 'COST', 'ORCHESTRATION_WORKFLOW ID'],
      );
    });

  const show = async (id: string, options: { json?: boolean | string }) => {
    const result = await (await getTrpcClient()).orchestrationWorkflow.graph.query({ id });
    if (options.json !== undefined) return outputJson(result.data, options.json);
    printGraph(result.data);
  };
  orchestrationWorkflow
    .command('show <id>')
    .description('Show orchestration workflow and graph')
    .option('--json [fields]', 'Output JSON')
    .action(show);
  orchestrationWorkflow
    .command('graph <id>')
    .description('Show the Orchestration workflow Graph')
    .option('--json [fields]', 'Output JSON')
    .action(show);

  orchestrationWorkflow
    .command('supervision <id>')
    .description('Inspect recovery incidents, diagnostic topic and effective recovery rate')
    .action(async (id: string) => {
      const result = await (await getTrpcClient()).orchestrationWorkflow.supervision.query({ id });
      outputJson(result.data);
    });

  orchestrationWorkflow
    .command('tick <id>')
    .description('Advance exactly one deterministic coordinator step')
    .option('--json [fields]', 'Output JSON')
    .action(async (id: string, options) => {
      const result = await (await getTrpcClient()).orchestrationWorkflow.tick.mutate({ id });
      if (options.json !== undefined) return outputJson(result.data, options.json);
      printTick(result.data);
    });

  orchestrationWorkflow
    .command('run <id>')
    .description('Tick until the orchestration workflow reaches a stop condition')
    .option(
      '--max-ticks <n>',
      'Safety limit on ADVANCING ticks; idle polls of an unchanged waiting state do not count',
      '100',
    )
    .option('--poll-ms <ms>', 'Delay while waiting for task execution', '3000')
    .option(
      '--retry-window-ms <ms>',
      'Keep retrying a failing tick for this long before giving up (0 disables retry)',
      '600000',
    )
    .option('--json', 'Output tick results as JSON')
    .action(
      async (
        id: string,
        options: { json?: boolean; maxTicks: string; pollMs: string; retryWindowMs: string },
      ) => {
        const client = await getTrpcClient();
        const results: OrchestrationWorkflowRunTickResult[] = [];
        const maxTicks = Number.parseInt(options.maxTicks, 10);
        const pollMs = Number.parseInt(options.pollMs, 10);
        const retryWindowMs = Number.parseInt(options.retryWindowMs, 10);
        // Only ticks that CHANGED something count against the budget. Polling an
        // unchanged `waiting_external` state is the coordinator idling while a
        // Task runs — a Task that legitimately takes an hour would otherwise
        // burn the whole allowance on no-ops and stop a healthy orchestration workflow half-way.
        let advancingTicks = 0;
        let exhaustedBudget = false;
        for (;;) {
          // Pinned explicitly: inferring `T` through the callback collapses the
          // router's return type to `unknown` in the CLI's standalone
          // type-check, which has no built `@orvilo/types` to resolve against.
          const { data } = await tickWithRetry<{ data: OrchestrationWorkflowTickResult }>(
            () => client.orchestrationWorkflow.tick.mutate({ id }),
            retryWindowMs,
            (error, delayMs) => {
              if (options.json) return;
              const message = error instanceof Error ? error.message : String(error);
              log.warn(`Tick failed (${message}); retrying in ${delayMs}ms`);
            },
          );
          const previous = results.at(-1);
          const isIdlePoll = isSameWaitingState(previous, data);
          if (isIdlePoll) {
            previous.pollCount = (previous.pollCount ?? 1) + 1;
            previous.waitedMs = (previous.waitedMs ?? pollMs) + pollMs;
          } else {
            advancingTicks++;
            results.push(
              data.outcome === 'waiting_external'
                ? { ...data, pollCount: 1, waitedMs: pollMs }
                : data,
            );
            if (!options.json) printTick(data);
          }
          if (terminalOutcomes.has(data.outcome)) break;
          if (!isIdlePoll && advancingTicks >= maxTicks) {
            exhaustedBudget = true;
            break;
          }
          if (data.outcome === 'waiting_external') await sleep(pollMs);
        }
        if (options.json) outputJson(results);
        if (exhaustedBudget) {
          // A half-finished orchestration workflow must not look like success to a wrapper script:
          // the whole reason this branch exists is that the run still has work
          // left, so leave a non-zero code behind for the caller to branch on.
          process.exitCode = 1;
          log.warn(
            `Stopped after ${advancingTicks} advancing ticks (--max-ticks ${maxTicks}); the orchestration workflow is unfinished. Resume with: orvilo orchestration-workflow run ${id}`,
          );
        }
      },
    );

  for (const action of ['pause', 'resume'] as const) {
    orchestrationWorkflow
      .command(`${action} <id>`)
      .description(`${action === 'pause' ? 'Pause' : 'Resume'} orchestration workflow coordination`)
      .action(async (id: string) => {
        const client = await getTrpcClient();
        const result = await client.orchestrationWorkflow[action].mutate({ id });
        log.info(result.message);
      });
  }

  orchestrationWorkflow
    .command('set-budget <id>')
    .description('Update limits; pass "none" to remove a limit')
    .option('--max-rounds <n>')
    .option('--max-cost <usd>')
    .option('--max-experiments <n>', 'Exploration experiment cap (1–200)')
    .action(
      async (
        id: string,
        options: { maxCost?: string; maxRounds?: string; maxExperiments?: string },
      ) => {
        const parseLimit = (value: string | undefined, integer = false) =>
          value === undefined
            ? undefined
            : value === 'none'
              ? null
              : integer
                ? Number.parseInt(value, 10)
                : Number.parseFloat(value);
        const result = await (
          await getTrpcClient()
        ).orchestrationWorkflow.setBudget.mutate({
          id,
          maxExperiments:
            options.maxExperiments === undefined ? undefined : Number(options.maxExperiments),
          maxRounds: parseLimit(options.maxRounds, true),
          maxTotalCost: parseLimit(options.maxCost),
        });
        log.info(result.message);
      },
    );

  orchestrationWorkflow
    .command('set-agent <id> <agent>')
    .description(
      'Hand the orchestration workflow to a different responsible agent (unfinished tasks follow)',
    )
    .option(
      '--orchestration-workflow-only',
      'Only change the orchestration-workflow-level agent; leave existing tasks as assigned',
    )
    .action(
      async (id: string, agentId: string, options: { orchestrationWorkflowOnly?: boolean }) => {
        const result = await (
          await getTrpcClient()
        ).orchestrationWorkflow.setAgent.mutate({
          agentId,
          orchestrationWorkflowOnly: options.orchestrationWorkflowOnly,
          id,
        });
        log.info(result.message);
      },
    );

  orchestrationWorkflow
    .command('restart <id>')
    .description('Start every unfinished task over (cancel stale runs, reset to backlog)')
    .option(
      '--agent <id>',
      'Also hand the orchestration workflow and restarted tasks to this agent',
    )
    .action(async (id: string, options: { agent?: string }) => {
      const result = await (
        await getTrpcClient()
      ).orchestrationWorkflow.restart.mutate({ agentId: options.agent, id });
      log.info(`${result.message}. Resume ticking with: orvilo orchestration-workflow run ${id}`);
    });

  orchestrationWorkflow
    .command('decisions <id>')
    .description('List durable decision gates')
    .option('--json [fields]', 'Output JSON')
    .action(async (id: string, options) => {
      const graph = (await (await getTrpcClient()).orchestrationWorkflow.graph.query({ id })).data;
      if (options.json !== undefined) return outputJson(graph.decisions, options.json);
      printTable(
        graph.decisions.map((decision: OrchestrationWorkflowGraphDecision) => [
          decision.status,
          truncate(decision.question, 60),
          decision.recommendedOptionId ?? '-',
          decision.id,
        ]),
        ['STATUS', 'QUESTION', 'RECOMMENDED', 'DECISION ID'],
      );
    });

  orchestrationWorkflow
    .command('decide <id> <decision-id>')
    .description('Resolve a durable decision gate')
    .requiredOption('--option <id>', 'Selected option ID')
    .option('--reason <text>', 'Resolution rationale')
    .action(async (id: string, decisionId: string, options) => {
      const result = await (
        await getTrpcClient()
      ).orchestrationWorkflow.decide.mutate({
        decisionId,
        id,
        optionId: options.option,
        resolution: options.reason,
      });
      log.info(result.message);
    });

  orchestrationWorkflow
    .command('add-node <id> <kind> <title>')
    .description('Add a question, experiment container, task, finding, or decision node')
    .option('--scope <experiment-id>', 'Contain this node in an experiment')
    .option('--question <node-id>', 'Question this experiment answers')
    .option('-d, --description <text>')
    .option('-p, --priority <n>')
    .action(
      async (
        id: string,
        kind: 'decision' | 'experiment' | 'finding' | 'problem' | 'task',
        title: string,
        options,
      ) => {
        const result = await (
          await getTrpcClient()
        ).orchestrationWorkflow.addNode.mutate({
          description: options.description,
          scopeId: options.scope,
          questionId: options.question,
          id,
          kind,
          priority: options.priority ? Number.parseInt(options.priority, 10) : undefined,
          title,
        });
        log.info(`Created node ${result.data.id}`);
      },
    );

  orchestrationWorkflow
    .command('add-edge <id> <source> <target> <kind>')
    .description('Connect two Orchestration workflow Graph nodes')
    .action(async (id: string, sourceNodeId: string, targetNodeId: string, kind) => {
      const result = await (
        await getTrpcClient()
      ).orchestrationWorkflow.addEdge.mutate({
        id,
        kind,
        sourceNodeId,
        targetNodeId,
      });
      log.info(`Created edge ${result.data.id}`);
    });
}
