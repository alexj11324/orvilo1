#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REQUIRED_WORKFLOWS = ['Test CI', 'E2E CI'];
const DEFAULT_REQUIRED_CHECK_RUNS = ['GitGuardian Security Checks'];
const DEFAULT_IGNORED_CHECK_RUNS = [
  'Check Duplicate Run',
  'Vercel Preview Comments',
  'Check all PR gates before Vercel',
  'Deploy Vercel Preview',
];
const DEFAULT_IGNORED_STATUS_CONTEXTS = ['Vercel'];
const DEFAULT_GATE_TIMEOUT_MS = 60 * 60 * 1000;

export class GitHubGateLookupError extends Error {
  constructor(message, { retryable = false, status, cause } = {}) {
    super(message);
    this.name = 'GitHubGateLookupError';
    this.retryable = retryable;
    this.status = status;
    this.cause = cause;
  }
}

export const isRetryableGateError = (error) =>
  error instanceof GitHubGateLookupError && error.retryable;

export const parseList = (value, fallback = []) => {
  const parsed = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
};

export const selectLatestRun = (runs, { workflowName, headSha, requiredEvent = 'push' }) => {
  const candidates = runs
    .filter(
      (run) => run.name === workflowName && run.head_sha === headSha && run.event === requiredEvent,
    )
    .sort((left, right) =>
      String(left.created_at ?? left.id).localeCompare(String(right.created_at ?? right.id)),
    );
  return candidates.at(-1);
};

export const selectLatestCheckRun = (checkRuns, name) => {
  const candidates = checkRuns
    .filter((checkRun) => checkRun.name === name)
    .sort((left, right) =>
      String(left.started_at ?? left.id).localeCompare(String(right.started_at ?? right.id)),
    );
  return candidates.at(-1);
};

const latestStatusesByContext = (statuses) => {
  const latest = new Map();
  for (const status of [...statuses].sort((left, right) =>
    String(left.created_at ?? left.id).localeCompare(String(right.created_at ?? right.id)),
  )) {
    latest.set(status.context, status);
  }
  return [...latest.values()];
};

const result = (state, reasons = []) => ({
  state,
  reasons: Array.isArray(reasons) ? reasons : reasons ? [reasons] : [],
});

const inspectWorkflow = (run, jobs, workflowName) => {
  if (!run) return result('pending', `waiting for exact-head ${workflowName} run`);
  if (run.status !== 'completed') {
    return result('pending', `${workflowName} is ${run.status}/${run.conclusion}`);
  }

  const verificationJobs =
    workflowName === 'E2E CI'
      ? jobs.filter((job) => job.name === 'Test Web App')
      : jobs.filter((job) => job.name !== 'Check Duplicate Run');

  if (verificationJobs.length === 0) {
    return result('failed', `${workflowName} has no verification jobs`);
  }

  const unfinished = verificationJobs.find((job) => job.status !== 'completed');
  if (unfinished) {
    return result('pending', `${workflowName} job ${unfinished.name} is ${unfinished.status}`);
  }

  const failed = verificationJobs.find((job) => !['success', 'skipped'].includes(job.conclusion));
  if (failed) {
    return result('failed', `${workflowName} job ${failed.name} is ${failed.conclusion}`);
  }

  const executed = verificationJobs.some(
    (job) => job.conclusion === 'success' && Array.isArray(job.steps) && job.steps.length > 0,
  );
  if (!executed) {
    return result('failed', `${workflowName} has no executed verification job`);
  }

  return result('passed');
};

const inspectRequiredCheckRun = (checkRun, name) => {
  if (!checkRun) return result('pending', `waiting for required check ${name}`);
  if (checkRun.status !== 'completed') {
    return result('pending', `${name} is ${checkRun.status}/${checkRun.conclusion}`);
  }
  if (checkRun.conclusion !== 'success') {
    return result('failed', `${name} is ${checkRun.conclusion}`);
  }
  return result('passed');
};

const inspectOtherCheckRuns = (checkRuns, ignoredCheckRuns) => {
  const failures = [];
  const pending = [];
  const names = [...new Set(checkRuns.map((checkRun) => checkRun.name))];
  for (const name of names) {
    const checkRun = selectLatestCheckRun(checkRuns, name);
    if (ignoredCheckRuns.has(checkRun.name)) continue;
    if (checkRun.status !== 'completed') {
      pending.push(`${checkRun.name} is ${checkRun.status}/${checkRun.conclusion}`);
      continue;
    }
    if (!['success', 'skipped'].includes(checkRun.conclusion)) {
      failures.push(`${checkRun.name} is ${checkRun.conclusion}`);
    }
  }
  return { failures, pending };
};

const inspectStatuses = (statuses, ignoredStatusContexts) => {
  const failures = [];
  const pending = [];
  for (const status of latestStatusesByContext(statuses)) {
    if (ignoredStatusContexts.has(status.context)) continue;
    if (status.state === 'pending') {
      pending.push(`${status.context} is pending`);
    } else if (status.state !== 'success') {
      failures.push(`${status.context} is ${status.state}`);
    }
  }
  return { failures, pending };
};

export const evaluateGateSnapshot = ({
  runs,
  jobsByRun,
  checkRuns,
  statuses,
  requiredWorkflows = DEFAULT_REQUIRED_WORKFLOWS,
  requiredCheckRuns = DEFAULT_REQUIRED_CHECK_RUNS,
  ignoredCheckRuns = DEFAULT_IGNORED_CHECK_RUNS,
  ignoredStatusContexts = DEFAULT_IGNORED_STATUS_CONTEXTS,
  headSha,
  requiredEvent = 'push',
}) => {
  const failures = [];
  const pending = [];

  for (const workflowName of requiredWorkflows) {
    const run = selectLatestRun(runs, { workflowName, headSha, requiredEvent });
    const inspection = inspectWorkflow(run, run ? (jobsByRun.get(run.id) ?? []) : [], workflowName);
    (inspection.state === 'failed' ? failures : pending).push(...inspection.reasons);
  }

  for (const checkName of requiredCheckRuns) {
    const inspection = inspectRequiredCheckRun(
      selectLatestCheckRun(checkRuns, checkName),
      checkName,
    );
    (inspection.state === 'failed' ? failures : pending).push(...inspection.reasons);
  }

  const otherChecks = inspectOtherCheckRuns(
    checkRuns,
    new Set([...ignoredCheckRuns, ...requiredCheckRuns]),
  );
  failures.push(...otherChecks.failures);
  pending.push(...otherChecks.pending);
  const otherStatuses = inspectStatuses(statuses, new Set(ignoredStatusContexts));
  failures.push(...otherStatuses.failures);
  pending.push(...otherStatuses.pending);

  if (failures.length > 0) return result('failed', failures);
  if (pending.length > 0) return result('pending', pending);
  return result('passed');
};

const fetchJson = async (url, token) => {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (error) {
    throw new GitHubGateLookupError(
      `GitHub gate lookup failed for ${url}: ${error instanceof Error ? error.message : error}`,
      { retryable: true, cause: error },
    );
  }
  if (!response.ok) {
    const retryable =
      [408, 425, 429].includes(response.status) ||
      response.status >= 500 ||
      (response.status === 403 &&
        (response.headers?.get('retry-after') ||
          response.headers?.get('x-ratelimit-remaining') === '0'));
    throw new GitHubGateLookupError(
      `GitHub gate lookup failed with HTTP ${response.status}: ${url}`,
      { retryable, status: response.status },
    );
  }
  return response.json();
};

const fetchJobs = async ({ apiBase, repository, runId, token }) => {
  const jobs = [];
  for (let page = 1; ; page++) {
    const response = await fetchJson(
      `${apiBase}/repos/${repository}/actions/runs/${runId}/jobs?per_page=100&page=${page}`,
      token,
    );
    if (!Array.isArray(response.jobs)) throw new Error('GitHub job inventory is missing');
    jobs.push(...response.jobs);
    if (response.jobs.length < 100) return jobs;
  }
};

export const loadGateSnapshot = async ({
  apiBase,
  repository,
  token,
  headSha,
  requiredWorkflows = DEFAULT_REQUIRED_WORKFLOWS,
  requiredEvent = 'push',
}) => {
  const [runsResponse, checkRunsResponse, statusesResponse] = await Promise.all([
    fetchJson(
      `${apiBase}/repos/${repository}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`,
      token,
    ),
    fetchJson(`${apiBase}/repos/${repository}/commits/${headSha}/check-runs?per_page=100`, token),
    fetchJson(`${apiBase}/repos/${repository}/commits/${headSha}/status`, token),
  ]);

  const runs = Array.isArray(runsResponse.workflow_runs) ? runsResponse.workflow_runs : [];
  const jobsByRun = new Map();
  await Promise.all(
    requiredWorkflows.map(async (workflowName) => {
      const run = selectLatestRun(runs, { workflowName, headSha, requiredEvent });
      if (run)
        jobsByRun.set(run.id, await fetchJobs({ apiBase, repository, runId: run.id, token }));
    }),
  );

  return {
    runs,
    jobsByRun,
    checkRuns: Array.isArray(checkRunsResponse.check_runs) ? checkRunsResponse.check_runs : [],
    statuses: Array.isArray(statusesResponse.statuses) ? statusesResponse.statuses : [],
  };
};

export const waitForGate = async ({
  apiBase,
  repository,
  token,
  headSha,
  requiredWorkflows = DEFAULT_REQUIRED_WORKFLOWS,
  requiredCheckRuns = DEFAULT_REQUIRED_CHECK_RUNS,
  ignoredCheckRuns = DEFAULT_IGNORED_CHECK_RUNS,
  ignoredStatusContexts = DEFAULT_IGNORED_STATUS_CONTEXTS,
  requiredEvent = 'push',
  timeoutMs = DEFAULT_GATE_TIMEOUT_MS,
  intervalMs = 15 * 1000,
  now = () => Date.now(),
  sleep = (duration) => new Promise((resolveSleep) => setTimeout(resolveSleep, duration)),
  log = (message) => console.log(message),
}) => {
  const deadline = now() + timeoutMs;
  while (true) {
    let snapshot;
    try {
      snapshot = await loadGateSnapshot({
        apiBase,
        repository,
        token,
        headSha,
        requiredWorkflows,
        requiredEvent,
      });
    } catch (error) {
      if (!isRetryableGateError(error)) throw error;
      const remainingMs = deadline - now();
      if (remainingMs <= 0) {
        throw new Error(
          `Vercel Preview gate timed out for ${headSha}: GitHub API remained unavailable`,
          { cause: error },
        );
      }
      log(`Vercel Preview gate retrying transient GitHub API error for ${headSha}`);
      await sleep(Math.min(intervalMs, remainingMs));
      continue;
    }
    const evaluation = evaluateGateSnapshot({
      ...snapshot,
      headSha,
      requiredEvent,
      requiredWorkflows,
      requiredCheckRuns,
      ignoredCheckRuns,
      ignoredStatusContexts,
    });

    if (evaluation.state === 'passed') return evaluation;
    if (evaluation.state === 'failed') {
      throw new Error(
        `Vercel Preview gate failed for ${headSha}: ${evaluation.reasons.join('; ')}`,
      );
    }
    if (now() >= deadline) {
      throw new Error(
        `Vercel Preview gate timed out for ${headSha}: ${evaluation.reasons.join('; ')}`,
      );
    }
    log(`Vercel Preview gate waiting for ${headSha}: ${evaluation.reasons.join('; ')}`);
    await sleep(intervalMs);
  }
};

export const main = async () => {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const headSha = process.env.HEAD_SHA;
  if (!repository || !token || !headSha) {
    throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN, and HEAD_SHA are required');
  }
  if (!/^[0-9a-f]{40}$/.test(headSha)) throw new Error('HEAD_SHA must be a full lowercase Git SHA');

  await waitForGate({
    apiBase: process.env.GITHUB_API_URL || 'https://api.github.com',
    repository,
    token,
    headSha,
    requiredWorkflows: parseList(process.env.REQUIRED_WORKFLOWS, DEFAULT_REQUIRED_WORKFLOWS),
    requiredCheckRuns: parseList(process.env.REQUIRED_CHECK_RUNS, DEFAULT_REQUIRED_CHECK_RUNS),
    ignoredCheckRuns: parseList(process.env.IGNORED_CHECK_RUNS, DEFAULT_IGNORED_CHECK_RUNS),
    ignoredStatusContexts: parseList(
      process.env.IGNORED_STATUS_CONTEXTS,
      DEFAULT_IGNORED_STATUS_CONTEXTS,
    ),
    requiredEvent: process.env.REQUIRED_EVENT || 'push',
    timeoutMs: Number(process.env.GATE_TIMEOUT_MS || DEFAULT_GATE_TIMEOUT_MS),
    intervalMs: Number(process.env.GATE_POLL_INTERVAL_MS || 15 * 1000),
  });
  console.log(`Vercel Preview gate passed for ${headSha}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
