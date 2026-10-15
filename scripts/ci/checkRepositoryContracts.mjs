#!/usr/bin/env node
/** Guard the retired implementation boundaries repaired by the repository audit. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const retiredAuth = new Set([
  'AUTH_SECRET',
  'AUTH_SSO_PROVIDERS',
  'AUTH_ALLOWED_EMAILS',
  'AUTH_ADDITIONAL_TRUSTED_ORIGINS',
  'AUTH_TRUSTED_ORIGINS',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'COGNITO_CLIENT_ID',
  'COGNITO_CLIENT_SECRET',
  'COGNITO_DOMAIN',
  'COGNITO_REGION',
  'COGNITO_USERPOOL_ID',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'OIDC_JWKS_KEY',
  'AUTH_URL',
]);

export const checkText = (file, text) => {
  const errors = [];
  text.split('\n').forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    if (/\.env(?:\.|$)/.test(file) || file === 'Dockerfile') {
      // Examples are instructions too: inspect commented-out assignments.
      const assignment = /^\s*(?:#\s*)?(?:ENV\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
      if (
        assignment &&
        (retiredAuth.has(assignment[1]) || /^AUTH_(?:GOOGLE|GITHUB|MICROSOFT)_/.test(assignment[1]))
      )
        errors.push(`${at}: retired auth assignment ${assignment[1]}; use the Clerk auth contract`);
    }
    if (
      (file === 'AGENTS.md' || file.endsWith('/project-overview/SKILL.md')) &&
      line.includes('`react-router-dom`')
    )
      errors.push(`${at}: routing uses the installed react-router package`);
    if (file.includes('/upstash-workflow/') && /import .*['"]@upstash\/workflow/.test(line))
      errors.push(`${at}: retired Upstash implementation; use the registered Hatchet tasks`);
    if (file.endsWith('/cli/SKILL.md') && /^\|\s*`orvilo (?:model|provider|skill)`/.test(line))
      errors.push(
        `${at}: removed CLI command advertised as supported; check apps/cli/src/program.ts`,
      );
  });
  return errors;
};

export const checkRepository = (root) => {
  const files = [
    '.env.example',
    '.env.example.development',
    'Dockerfile',
    'AGENTS.md',
    'docker-compose/deploy/.env.example',
    'docker-compose/deploy/.env.zh-CN.example',
    'docker-compose/production/grafana/.env.example',
    'docker-compose/production/grafana/.env.zh-CN.example',
    '.agents/skills/project-overview/SKILL.md',
    '.agents/skills/cli/SKILL.md',
    '.agents/skills/upstash-workflow/SKILL.md',
    ...readdirSync(path.join(root, '.agents/skills/upstash-workflow/references'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => `.agents/skills/upstash-workflow/references/${file}`),
  ];
  const errors = files.flatMap((file) =>
    checkText(file, readFileSync(path.join(root, file), 'utf8')),
  );
  // These sections explicitly list live owners, unlike historical examples or hypothetical paths.
  for (const file of [
    '.agents/skills/upstash-workflow/SKILL.md',
    '.agents/skills/agent-runtime-hooks/SKILL.md',
  ]) {
    const source = readFileSync(path.join(root, file), 'utf8');
    const owners = source.split(/^## (?:Owners|Key Files)\s*$/m)[1]?.split(/^## /m)[0] ?? '';
    for (const match of owners.matchAll(/`((?:src|apps|packages)\/[^`]+)`/g)) {
      if (!existsSync(path.join(root, match[1])))
        errors.push(`${file}: missing current owner ${match[1]}`);
    }
  }
  return errors;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkRepository(process.cwd());
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log('PASS — current auth templates, routing/CLI guidance and workflow owners agree');
}
