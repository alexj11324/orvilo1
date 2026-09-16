/**
 * Cordy automation template gallery, ported to orvilo1's model. Only the
 * `schedule`-trigger templates survive the port — webhook/api triggers have
 * no orvilo1 equivalent yet. `pattern` is a standard 5-field cron read
 * directly by `updateSchedule`/`taskService.create`.
 */
export const TEMPLATE_CATEGORY_IDS = [
  'popular',
  'code_review',
  'security',
  'incidents_triage',
  'data_research',
  'environment',
] as const;

export type TemplateCategoryId = (typeof TEMPLATE_CATEGORY_IDS)[number];

export type AutomationTemplateId =
  | 'add_test_coverage'
  | 'customer_health_monitoring'
  | 'find_critical_bugs'
  | 'generate_docs'
  | 'investigate_environment_setup_failures'
  | 'investigate_top_datadog_errors'
  | 'monitor_engineering_invariants'
  | 'monitor_environment_build_health'
  | 'product_analytics'
  | 'product_finance'
  | 'scan_codebase_vulnerabilities'
  | 'slack_digest'
  | 'summarize_changes_daily';

export interface AutomationTemplate {
  id: AutomationTemplateId;
  /** Cron pattern (minute hour dom mon dow). */
  pattern: string;
  prompt: string;
}

const weekdays = (time: string) => {
  const [hour, minute] = time.split(':');
  return `${Number(minute)} ${Number(hour)} * * 1-5`;
};

const mondays = (time: string) => {
  const [hour, minute] = time.split(':');
  return `${Number(minute)} ${Number(hour)} * * 1`;
};

export const AUTOMATION_TEMPLATES: Record<AutomationTemplateId, AutomationTemplate> = {
  find_critical_bugs: {
    id: 'find_critical_bugs',
    pattern: weekdays('09:00'),
    prompt: `# Goal
Analyze recent commits for high-severity correctness bugs and submit only safe, well-scoped fixes.

# Context
This run is a scheduled correctness sweep, not a style pass. Prefer bugs that can break users, corrupt data, or violate an invariant over nits and speculative refactors.

# Steps
1. Collect commits and diffs from the last 24 hours on the default branch and on open pull requests.
2. Rank findings by user impact: crashes, wrong results, race conditions, broken authz, and silent data loss first.
3. For each high-severity candidate, reproduce from the diff and surrounding tests; discard anything you cannot explain with evidence.
4. Where a fix is local, low-risk, and covered by tests (or you can add a focused test), open a pull request with the diagnosis and the change.
5. Post a digest of confirmed bugs, skipped suspects, and any opened PRs, then notify the team.`,
  },
  scan_codebase_vulnerabilities: {
    id: 'scan_codebase_vulnerabilities',
    pattern: mondays('08:00'),
    prompt: `# Goal
Review the full repository on a schedule and alert only on validated, high-impact security issues.

# Context
Noise from scanners is worse than silence. Confirm exploitability or a realistic attack path before you file anything.

# Steps
1. Inventory the repo: auth boundaries, secret handling, deserialization, SSRF/injection sinks, and dependency surfaces.
2. Run or read the latest vulnerability scan output, then manually verify each high/critical hit against the current code.
3. Drop findings that are unreachable, already mitigated, or require an unrealistic attacker.
4. For each validated issue, write impact, reproduction, and a concrete remediation (patch, config, or dependency bump).
5. Post a ranked report and notify the team. Do not open drive-by refactors.`,
  },
  generate_docs: {
    id: 'generate_docs',
    pattern: weekdays('14:00'),
    prompt: `# Goal
Create and update developer documentation for recently changed or under-documented code.

# Context
Docs should match the code that shipped, not an idealized design. Prefer updating the existing doc tree over inventing a parallel one.

# Steps
1. List significant changes from the last 48 hours (APIs, config, CLI, data model, and user-visible behavior).
2. For each change, find the current doc page or README that should describe it; note gaps and stale sections.
3. Draft or update those pages with accurate examples, failure modes, and links to the owning code.
4. If a public API changed without a changelog entry, add one.
5. Open a documentation PR when the edits are substantial, and post a summary of what was documented vs still missing.`,
  },
  add_test_coverage: {
    id: 'add_test_coverage',
    pattern: weekdays('10:00'),
    prompt: `# Goal
Review recent changes and add tests for high-risk logic that lacks adequate coverage.

# Context
Do not chase coverage percentage. Target branches that can fail in production: auth, money, data writes, concurrency, and parsers.

# Steps
1. Diff the last 24–48 hours and list new or changed logic without nearby tests.
2. Rank gaps by blast radius if the code is wrong.
3. Add focused unit or integration tests that fail on the bug you are worried about; avoid snapshot-only tests.
4. Run the new tests and the nearest existing suite; do not merge a test file that does not run in CI.
5. Open a PR with the tests (and tiny production fixes only if a test proved a real bug), then notify the team.`,
  },
  monitor_engineering_invariants: {
    id: 'monitor_engineering_invariants',
    pattern: weekdays('08:30'),
    prompt: `# Goal
Re-check critical repository invariants on a schedule and alert only when a rule regresses.

# Context
Invariants are the "this must stay true" rules in this repo (layering, no FK cascades, query-key shape, i18n parity, and similar). Alert on breakage, not on every run.

# Steps
1. Load the project's documented invariants (CLAUDE.md, CONTRIBUTING, lint rules, architecture tests).
2. Run the cheapest checks that prove those rules: targeted tests, ripgrep guards, and typecheck where relevant.
3. Compare with the last known-good result. Ignore pre-existing debt unless it got worse.
4. For a new regression, capture the failing evidence and a suggested fix location.
5. Notify the team only if something regressed; a clean run should stay quiet or one-line.`,
  },
  investigate_top_datadog_errors: {
    id: 'investigate_top_datadog_errors',
    pattern: weekdays('09:30'),
    prompt: `# Goal
Investigate recurring production errors from Datadog, identify root causes, and propose fixes.

# Context
This is a scheduled look at the error budget, not a page. Focus on the top recurring faults, not yesterday's one-offs.

# Steps
1. Pull the top error signatures by count and user impact over the last 24 hours.
2. For each new or worsening signature, inspect traces/logs and the owning code.
3. Group duplicates. Skip errors already covered by an open issue/PR unless volume jumped.
4. Propose or land a fix when it is safe; otherwise file a tracked issue with evidence.
5. Write a short ranked digest back to Datadog/the team.`,
  },
  summarize_changes_daily: {
    id: 'summarize_changes_daily',
    pattern: weekdays('09:00'),
    prompt: `# Goal
Post a daily digest summarizing notable repository changes and risks from the previous day.

# Context
This is a briefing for humans who did not read every PR. Call out risk, not every changelog line.

# Steps
1. Collect merged PRs, notable commits, incidents, and CI redness from the previous calendar day.
2. Group by theme: shipped features, fixes, infra, and anything that looks risky (migrations, auth, public API).
3. For each item, write one or two sentences: what changed, why it matters, and follow-up if needed.
4. Flag open questions (reverts, failing default-branch CI, unresolved incidents).
5. Post the digest and notify the team.`,
  },
  customer_health_monitoring: {
    id: 'customer_health_monitoring',
    pattern: weekdays('09:00'),
    prompt: `# Goal
Find at-risk customers using usage analytics, call notes, Slack escalations, and issue blockers.

# Context
"At risk" means declining usage, unpaid/expand friction, unresolved severity, or a string of support threads — not a single quiet day.

# Steps
1. Pull usage and activation signals for the last 7 and 30 days; mark accounts with a sharp drop or failed expansion.
2. Read recent call notes and meeting recaps for churn language, competitors, and stalled rollouts.
3. Cross-check Slack escalations and open blockers on the account.
4. Rank accounts by urgency with evidence and a recommended owner action.
5. Write the briefing into the notes dest and notify the team for anything that needs a same-day response.`,
  },
  product_analytics: {
    id: 'product_analytics',
    pattern: mondays('10:00'),
    prompt: `# Goal
Produce a weekly product usage, activation, retention, and feature-adoption digest from warehouse data.

# Context
Numbers without a comparison are trivia. Always show WoW/WoW and call out the segments that moved.

# Steps
1. Query activation, retention, and feature adoption for the last week vs the prior week.
2. Break out the movements that matter (new vs existing, plan, platform) — skip vanity totals.
3. Investigate any cliff: a chart that dropped should get a hypothesis (release, outage, seasonality).
4. List 3–5 insights a PM can act on, each with the query/metric behind it.
5. Publish the digest and keep the SQL auditable.`,
  },
  product_finance: {
    id: 'product_finance',
    pattern: mondays('09:00'),
    prompt: `# Goal
Analyze Stripe revenue, churn signals, and product pricing opportunities.

# Context
This is a weekly finance pass. Treat payment data as sensitive; aggregate unless a specific account is already in an incident.

# Steps
1. Pull MRR/revenue, new, expansion, contraction, and churn for the last week vs the prior week.
2. List failed payments, delinquent invoices, and repeated dunning as operational risk.
3. Note pricing or packaging issues that show up in tickets or lost expansions.
4. Propose at most three concrete follow-ups (retry, outreach, packaging experiment) with evidence.
5. Publish the digest to the finance dest. Do not export raw cardholder data.`,
  },
  slack_digest: {
    id: 'slack_digest',
    pattern: weekdays('18:00'),
    prompt: `# Goal
Summarize important DMs, mentions, and the user's top active Slack channels.

# Context
This is an end-of-day catch-up. People, decisions, and asks — not a transcript dump.

# Steps
1. Collect unread DMs, @mentions, and high-activity channels from the last workday.
2. Cluster by thread. Drop automated noise (CI bots, deploy spam) unless it is an incident.
3. For each cluster, write: who, what they need, and whether a reply is still owed.
4. Highlight anything time-sensitive for tomorrow morning.
5. Post the digest privately to the user. Do not forward private DMs into a public channel.`,
  },
  investigate_environment_setup_failures: {
    id: 'investigate_environment_setup_failures',
    pattern: weekdays('08:00'),
    prompt: `# Goal
Analyze recent cloud agent runs to root-cause environment setup failures from setup logs, transcripts, and related issues.

# Context
Setup failures waste every subsequent step. Look for missing tools, auth, network, and image drift — not application bugs.

# Steps
1. List recent runs that failed during environment setup (install, image pull, secrets, network, toolchain).
2. Read setup logs and transcripts. Group identical failures.
3. Identify the first error that actually caused the rest of the log.
4. Propose a durable fix (image pin, secret, network allowlist, docs) and a short-term workaround.
5. Post a ranked report of causes and recommended owners.`,
  },
  monitor_environment_build_health: {
    id: 'monitor_environment_build_health',
    pattern: weekdays('08:15'),
    prompt: `# Goal
Health-check cloud environment builds and perform root-cause analysis for failed builds.

# Context
This is a scheduled build-health pass. A single red build is a data point; a rising fail rate is the story.

# Steps
1. Collect environment build outcomes for the last 24 hours: success rate, duration, and fail classification.
2. Compare with the previous week. Call out new failure modes and duration regressions.
3. For failed builds, read logs enough to name the cause (compile, test, image, quota, flake).
4. File or update an issue when a cause repeats; open a PR only for a small, proven fix.
5. Post the health summary and any actions taken.`,
  },
};

export interface TemplateCategory {
  id: TemplateCategoryId;
  templateIds: readonly AutomationTemplateId[];
}

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  {
    id: 'popular',
    templateIds: [
      'find_critical_bugs',
      'scan_codebase_vulnerabilities',
      'generate_docs',
      'add_test_coverage',
    ],
  },
  {
    id: 'code_review',
    templateIds: ['add_test_coverage', 'find_critical_bugs', 'monitor_engineering_invariants'],
  },
  {
    id: 'security',
    templateIds: ['scan_codebase_vulnerabilities'],
  },
  {
    id: 'incidents_triage',
    templateIds: ['investigate_top_datadog_errors'],
  },
  {
    id: 'data_research',
    templateIds: [
      'summarize_changes_daily',
      'customer_health_monitoring',
      'product_analytics',
      'product_finance',
      'slack_digest',
    ],
  },
  {
    id: 'environment',
    templateIds: ['investigate_environment_setup_failures', 'monitor_environment_build_health'],
  },
];
