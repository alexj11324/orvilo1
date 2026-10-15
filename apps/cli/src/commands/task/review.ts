import type { Command } from 'commander';
import pc from 'picocolors';

import { getTrpcClient } from '../../api/client';
import { printTable, truncate } from '../../utils/format';
import { log } from '../../utils/logger';

export function registerReviewCommands(task: Command) {
  // ── review ──────────────────────────────────────────────

  const rv = task.command('review').description('Read archived task rubric review config');

  rv.command('view <id>')
    .description('View review config for a task')
    .action(async (id: string) => {
      const client = await getTrpcClient();
      const result = await client.task.getReview.query({ id });
      const r = result.data as any;

      if (!r || !r.enabled) {
        log.info('Review not configured for this task.');
        return;
      }

      console.log(`\n${pc.bold('Review config:')}`);
      console.log(`  enabled: ${r.enabled}`);
      if (r.judge?.model)
        console.log(`  judge: ${r.judge.model}${r.judge.provider ? ` (${r.judge.provider})` : ''}`);
      console.log(`  maxIterations: ${r.maxIterations}`);
      console.log(`  autoRetry: ${r.autoRetry}`);
      if (r.rubrics?.length > 0) {
        console.log(`  rubrics:`);
        for (let i = 0; i < r.rubrics.length; i++) {
          const rb = r.rubrics[i];
          const threshold = rb.threshold ? ` ≥ ${Math.round(rb.threshold * 100)}%` : '';
          const typeTag = pc.dim(`[${rb.type}]`);
          let configInfo = '';
          if (rb.type === 'llm-rubric') configInfo = rb.config?.criteria || '';
          else if (rb.type === 'contains' || rb.type === 'equals')
            configInfo = `value="${rb.config?.value}"`;
          else if (rb.type === 'regex') configInfo = `pattern="${rb.config?.pattern}"`;
          console.log(`    ${i + 1}. ${rb.name} ${typeTag}${threshold} ${pc.dim(configInfo)}`);
        }
      } else {
        console.log(`  rubrics: ${pc.dim('(none)')}`);
      }
      console.log();
    });

  // ── review criteria ──────────────────────────────────────

  const rc = rv.command('criteria').description('Read archived review rubrics');

  rc.command('list <id>')
    .description('List review rubrics for a task')
    .action(async (id: string) => {
      const client = await getTrpcClient();
      const result = await client.task.getReview.query({ id });
      const r = result.data as any;
      const rubrics = r?.rubrics || [];

      if (rubrics.length === 0) {
        log.info('No rubrics configured.');
        return;
      }

      const rows = rubrics.map((r: any, i: number) => {
        const config = r.config || {};
        const configStr =
          r.type === 'llm-rubric'
            ? config.criteria || ''
            : r.type === 'contains' || r.type === 'equals'
              ? `value: "${config.value}"`
              : r.type === 'regex'
                ? `pattern: "${config.pattern}"`
                : JSON.stringify(config);

        return [
          String(i + 1),
          r.name,
          r.type,
          r.threshold ? `≥ ${Math.round(r.threshold * 100)}%` : '-',
          String(r.weight ?? 1),
          truncate(configStr, 40),
        ];
      });

      printTable(rows, ['#', 'NAME', 'TYPE', 'THRESHOLD', 'WEIGHT', 'CONFIG']);
    });
}
