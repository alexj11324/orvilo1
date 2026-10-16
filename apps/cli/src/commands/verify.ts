import type { Command } from 'commander';
import pc from 'picocolors';

import { getTrpcClient } from '../api/client';
import { outputJson, printTable, timeAgo, truncate } from '../utils/format';
import { log } from '../utils/logger';

// Re-export the report/ingest helpers so existing importers keep resolving them
// from './verify' (tests, and callers predating the verifyHelpers split).
export * from './verifyHelpers';

// ── Command Registration ───────────────────────────────────

export function registerVerifyCommand(program: Command) {
  const verify = program
    .command('verify')
    .description('Read archived verification criteria, rubrics, and run state');

  // The `orvilo acceptance …` group and its `orvilo verify` spellings (acceptance,
  // init/install, ingest-report, run/result/decision/evidence/report) were
  // retired with the standalone Acceptance / Verify platform. What stays is the
  // criterion / rubric / plan history stays readable through the same commands.
  // ════════════ criteria ════════════
  const criterion = verify.command('criterion').description('Reusable pass/fail standards');

  criterion
    .command('list')
    .description('List criteria')
    .option('--json [fields]', 'Output JSON, optionally specify fields (comma-separated)')
    .action(async (options: { json?: boolean | string }) => {
      const client = await getTrpcClient();
      const items = await client.verify.listCriteria.query();

      if (options.json !== undefined) {
        outputJson(items, typeof options.json === 'string' ? options.json : undefined);
        return;
      }
      if (items.length === 0) return void console.log('No criteria found.');
      printTable(
        items.map((c) => [
          c.id,
          truncate(c.title, 60),
          c.verifierType,
          c.required ? 'gate' : 'soft',
          c.onFail,
          c.updatedAt ? timeAgo(c.updatedAt) : '',
        ]),
        ['ID', 'TITLE', 'TYPE', 'BLOCK', 'ON-FAIL', 'UPDATED'],
      );
    });

  // ════════════ rubrics ════════════
  const rubric = verify.command('rubric').description('Named groups of criteria');

  rubric
    .command('list')
    .description('List rubrics')
    .option('--json [fields]', 'Output JSON, optionally specify fields (comma-separated)')
    .action(async (options: { json?: boolean | string }) => {
      const client = await getTrpcClient();
      const items = await client.verify.listRubrics.query();
      if (options.json !== undefined) {
        outputJson(items, typeof options.json === 'string' ? options.json : undefined);
        return;
      }
      if (items.length === 0) return void console.log('No rubrics found.');
      printTable(
        items.map((r) => [
          r.id,
          truncate(r.title, 60),
          truncate(r.description || '', 60),
          r.updatedAt ? timeAgo(r.updatedAt) : '',
        ]),
        ['ID', 'TITLE', 'DESCRIPTION', 'UPDATED'],
      );
    });

  rubric
    .command('view <id>')
    .description('Show a rubric and its run-policy config')
    .option('--json [fields]', 'Output JSON')
    .action(async (id: string, options: { json?: boolean | string }) => {
      const client = await getTrpcClient();
      const item = await client.verify.getRubric.query({ id });
      if (!item) return void log.error('Rubric not found.');
      if (options.json !== undefined) {
        outputJson(item, typeof options.json === 'string' ? options.json : undefined);
        return;
      }
      console.log(`${pc.bold('ID')}            ${item.id}`);
      console.log(`${pc.bold('Title')}         ${item.title}`);
      if (item.description) console.log(`${pc.bold('Description')}   ${item.description}`);
      const maxRepairRounds = (item.config as { maxRepairRounds?: number } | null)?.maxRepairRounds;
      console.log(`${pc.bold('Repair rounds')} ${maxRepairRounds ?? pc.dim('default')}`);
    });

  rubric
    .command('criteria <rubricId>')
    .description('List criteria in a rubric')
    .option('--json [fields]', 'Output JSON')
    .action(async (rubricId: string, options: { json?: boolean | string }) => {
      const client = await getTrpcClient();
      const items = await client.verify.getRubricCriteria.query({ rubricId });
      if (options.json !== undefined) {
        outputJson(items, typeof options.json === 'string' ? options.json : undefined);
        return;
      }
      if (items.length === 0) return void console.log('No criteria in this rubric.');
      printTable(
        items.map((c: any) => [
          c.id,
          truncate(c.title, 60),
          c.verifierType,
          c.required ? 'gate' : 'soft',
        ]),
        ['ID', 'TITLE', 'TYPE', 'BLOCK'],
      );
    });

  // ════════════ per-run plan ════════════
  const plan = verify.command('plan').description('Per-run check plan lifecycle');

  plan
    .command('state <operationId>')
    .description('Show the verify state (status + frozen plan) of a run')
    .option('--json [fields]', 'Output JSON')
    .action(async (operationId: string, options: { json?: boolean | string }) => {
      const client = await getTrpcClient();
      const state = await client.verify.getVerifyState.query({ operationId });
      if (options.json !== undefined) {
        outputJson(state, typeof options.json === 'string' ? options.json : undefined);
        return;
      }
      if (!state) return void console.log('No verify state for this run.');
      console.log(`${pc.bold('status')}: ${state.verifyStatus ?? pc.dim('(none)')}`);
      console.log(
        `${pc.bold('confirmed')}: ${state.verifyPlanConfirmedAt ? timeAgo(state.verifyPlanConfirmedAt) : pc.dim('no')}`,
      );
      const items = (state.verifyPlan ?? []) as any[];
      console.log(`${pc.bold('plan')}: ${items.length} item(s)`);
      if (items.length > 0)
        printTable(
          items.map((i) => [
            String(i.index),
            truncate(i.title, 60),
            i.verifierType,
            i.required ? 'gate' : 'soft',
          ]),
          ['#', 'TITLE', 'TYPE', 'BLOCK'],
        );
    });
}
