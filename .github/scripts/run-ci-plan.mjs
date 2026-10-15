import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { packageGraph, planAffectedChecks } from './plan-affected-checks.mjs';

export const buildCiPlan = ({ event, eventName, ref, graph, git }) => {
  const coverage = eventName === 'push' && ['refs/heads/canary', 'refs/heads/main'].includes(ref);
  const forceFull = coverage || event.head_commit?.message?.includes('[ci full]');
  let files = [];
  let fallback = false;
  if (!forceFull) {
    try {
      // Compare the whole branch, not just the last push: earlier changes still
      // need verification on the current head. An unresolved base runs everything.
      const base = event.pull_request?.base.sha || `origin/${event.repository.default_branch}`;
      const mergeBase = git(['merge-base', base, 'HEAD']).trim();
      files = git(['diff', '--name-only', '--no-renames', mergeBase, 'HEAD'])
        .trim()
        .split('\n')
        .filter(Boolean);
      // A new branch can already be contained in the base. Do not claim that
      // an empty diff proves an untested commit is green.
      fallback = files.length === 0;
    } catch {
      fallback = true;
    }
  }
  const plan = planAffectedChecks(files, {
    packages: graph,
    forceFull: Boolean(forceFull || fallback),
  });
  return {
    ui:
      Boolean(forceFull || fallback) ||
      files.some((file) =>
        /^(?:src\/(?:components|features)\/|src\/app\/globals\.css$|tests\/ui-alignment\/|(?:postcss\.config\.mjs|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.mts)$|\.github\/(?:actions\/setup-env\/|workflows\/ui-alignment\.yml$|scripts\/(?:run-ci-plan|plan-affected-checks)\.mjs$))/.test(
          file,
        ),
      ),
    app: plan.run_app,
    code: plan.run_static,
    typecheck: plan.run_typecheck,
    database: plan.run_database,
    desktop: plan.run_desktop,
    packages: plan.run_packages,
    server: plan.run_server,
    windows_shell: plan.run_windows_shell,
    cli: plan.run_cli,
    coverage,
    test_packages: plan.test_packages.join(' '),
    reasons: fallback
      ? [...plan.reasons, 'Unresolved or empty branch diff: full verification']
      : plan.reasons,
  };
};

export const main = () => {
  const graph = packageGraph(process.cwd());
  // Keep the existing package-suite inventory; database has its own service job.
  // Changes to other packages still propagate to these suites through the graph.
  const suites = JSON.parse(readFileSync(new URL('./ci-package-suites.json', import.meta.url)));
  graph.testPackageNames = new Set(suites);
  const plan = buildCiPlan({
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    graph,
    git: (args) => execFileSync('git', args, { encoding: 'utf8' }),
  });
  for (const [key, value] of Object.entries(plan)) {
    if (key !== 'reasons') appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Executed CI plan\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n`,
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
