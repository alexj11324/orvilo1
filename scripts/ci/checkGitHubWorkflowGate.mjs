#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const sha = process.env.REQUIRED_SHA;
const event = process.env.REQUIRED_EVENT || 'push';
const workflowNames = (process.env.REQUIRED_WORKFLOWS || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

export const selectLatestRun = (runs, { workflowName, headSha, requiredEvent = 'push' }) => {
  const candidates = runs
    .filter(
      (run) => run.name === workflowName && run.head_sha === headSha && run.event === requiredEvent,
    )
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  return candidates.at(-1);
};

export const assertSuccessfulRun = (run, workflowName) => {
  if (!run) throw new Error(`GitHub CI gate has no exact-head ${workflowName} run`);
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error(
      `GitHub CI gate ${workflowName} is ${run.status}/${run.conclusion} for ${run.head_sha}`,
    );
  }
};

export const assertExecutedJobs = (jobs, workflowName) => {
  const required = workflowName === 'E2E CI'
    ? jobs.filter((job) => job.name === 'Test Web App')
    : jobs.filter((job) => job.name !== 'Check Duplicate Run');
  if (
    required.length === 0 ||
    !required.some((job) => job.status === 'completed' && job.conclusion === 'success' && job.steps?.length > 0)
  ) {
    throw new Error(`GitHub CI gate ${workflowName} has no executed verification job`);
  }
  if (required.some((job) => job.status !== 'completed' || !['success', 'skipped'].includes(job.conclusion))) {
    throw new Error(`GitHub CI gate ${workflowName} has unfinished or failed verification jobs`);
  }
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API gate lookup failed with HTTP ${response.status}: ${url}`);
  }
  return response.json();
};

export const main = async () => {
  for (const name of [repository, token, sha]) {
    if (!name) throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN, and REQUIRED_SHA are required');
  }
  if (workflowNames.length === 0) throw new Error('REQUIRED_WORKFLOWS must not be empty');
  const url = new URL(`${apiBase}/repos/${repository}/actions/runs`);
  url.searchParams.set('head_sha', sha);
  url.searchParams.set('per_page', '100');
  const { workflow_runs: runs = [] } = await fetchJson(url);

  for (const workflowName of workflowNames) {
    const remaining = [...runs];
    while (true) {
      const run = selectLatestRun(remaining, {
        workflowName,
        headSha: sha,
        requiredEvent: event,
      });
      // A failed or unfinished newer run must not be hidden by an older pass.
      assertSuccessfulRun(run, workflowName);
      const jobs = [];
      for (let page = 1; ; page++) {
        const response = await fetchJson(
          `${apiBase}/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100&page=${page}`,
        );
        if (!Array.isArray(response.jobs)) throw new Error('GitHub job inventory is missing');
        jobs.push(...response.jobs);
        if (response.jobs.length < 100) break;
      }
      const verification = jobs.filter((job) => job.name !== 'Check Duplicate Run');
      if (verification.length > 0 && verification.every((job) => job.conclusion === 'skipped')) {
        remaining.splice(remaining.indexOf(run), 1);
        if (!selectLatestRun(remaining, { workflowName, headSha: sha, requiredEvent: event })) {
          throw new Error(`GitHub CI gate ${workflowName} has no executed verification job`);
        }
        continue;
      }
      assertExecutedJobs(jobs, workflowName);
      console.log(`GitHub CI gate passed: ${workflowName} ${sha} run=${run.id}`);
      break;
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
