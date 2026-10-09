import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const candidateSha = '56eb1e0b3e1d1d39af4c64ce84d717b7599e9c71';
export const qaRef = 'refs/heads/codex/permission-qa-current';
export const toolingPaths = [
  '.github/workflows/deploy-orvilo1.yml',
  'docs/development/permission-qa-harness.md',
  'docker-compose/qa-permission/admit.mjs',
  'scripts/ci/permissionQaAdmission.test.mjs',
  'docker-compose/qa-permission/activate.sh',
  'docker-compose/qa-permission/auth.cloudflare.config.ts',
  'docker-compose/qa-permission/build-gateways.sh',
  'docker-compose/qa-permission/docker-compose.yml',
  'docker-compose/qa-permission/Gateway.Dockerfile',
  'docker-compose/qa-permission/nginx.conf',
  'docker-compose/qa-permission/prepare-env.mjs',
  'docker-compose/qa-permission/qa-ci.sh',
  'docker-compose/qa-permission/qa-diagnose.sh',
];

export function admit({ ref, workflowSha, candidate, image, build, deploy, retag, changedPaths }) {
  if (ref !== qaRef || !/^[a-f0-9]{40}$/.test(workflowSha) || workflowSha === candidateSha)
    throw new Error('Only the dedicated QA harness ref and separate workflow SHA are admitted');
  if (candidate !== candidateSha) throw new Error('Candidate SHA differs from the frozen product');
  if (!/^ghcr\.io\/alexj11324\/orvilo1@sha256:[a-f0-9]{64}$/.test(image))
    throw new Error('QA requires an immutable image digest from this repository');
  if (build === 'true' || deploy === 'true' || retag)
    throw new Error('QA dispatch cannot select production build/deploy/tag operations');
  if (changedPaths.some((file) => !toolingPaths.includes(file)))
    throw new Error('Harness changes extend outside the explicit tooling paths');
  return { candidateSha, workflowSha, image, target: 'qa-permission-20261008' };
}

export async function verifySource(workflowSha) {
  const run = promisify(execFile);
  const { stdout: head } = await run('git', ['rev-parse', 'HEAD']);
  if (head.trim() !== workflowSha) throw new Error('Checkout differs from workflow SHA');
  const { stdout } = await run('git', ['diff', '--name-only', candidateSha, workflowSha, '--']);
  return stdout.trim().split('\n').filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = admit({
      ref: process.env.GITHUB_REF,
      workflowSha: process.env.GITHUB_SHA,
      candidate: process.env.QA_CANDIDATE_SHA,
      image: process.env.QA_IMAGE_REF,
      build: process.env.INPUT_BUILD,
      deploy: process.env.INPUT_DEPLOY,
      retag: process.env.INPUT_RETAG,
      changedPaths: await verifySource(process.env.GITHUB_SHA),
    });
    process.stdout.write(JSON.stringify(receipt) + '\n');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
