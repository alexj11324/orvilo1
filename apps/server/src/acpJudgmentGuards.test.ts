import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * R08 anti-regression gate: `initModelRuntimeFromDeploymentConfig` reads
 * deployment-level `PROVIDER_API_KEY`/`PROXY_URL` — the F10 violation path.
 * After the ACP judgment closure it may only be imported by the explicitly
 * enumerated non-agent exceptions (ASR, embeddings, chunking, media, file,
 * ragEval, knowledge-base retrieval, memory tooling) and by the audited
 * `kind: 'basic'` arm of AiGenerationService itself. Every other file touching
 * it means a retained judgment silently re-connected deployment keys.
 *
 * Like retirementGuards.test.ts this scans sources as text so a rebase that
 * quietly restores the old path turns red, and the falsifiability suite proves
 * the allowlist check can fail.
 */

const SERVER_SRC = path.resolve(import.meta.dirname);

const collectSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(filePath);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [filePath] : [];
  });

const serverSources = collectSources(SERVER_SRC).map((filePath) => ({
  path: path.relative(SERVER_SRC, filePath),
  text: readFileSync(filePath, 'utf8'),
}));

/**
 * The full deployment-runtime exception allowlist. Mirror of the exception
 * table in `docs/development/acp-judgment-closure.md` — adding a row requires
 * classifying the consumer in that doc first.
 */
const DEPLOYMENT_RUNTIME_IMPORT_ALLOWLIST = new Set([
  // Definition site itself.
  'modules/ModelRuntime/index.ts',
  // The audited `kind: 'basic'` arm — the ONLY generateObject path allowed to
  // touch deployment config.
  'services/aiGeneration/index.ts',
  // Non-agent base services (see doc table): media understanding, embeddings,
  // transcription, chunking, file/ragEval/video pipelines.
  'routers/async/file.ts',
  'routers/async/image.ts',
  'routers/async/ragEval.ts',
  'routers/async/video.ts',
  'routers/lambda/asr.ts',
  'routers/lambda/chunk.ts',
  'routers/lambda/userMemories.ts',
  'routers/lambda/video/index.ts',
  'services/generation/videoBackgroundPolling.ts',
  'services/knowledgeBase/index.ts',
  'services/toolExecution/serverRuntimes/memory.ts',
  'services/toolExecution/serverRuntimes/orviloAgent.ts',
]);

const IMPORT_PATTERN = /initModelRuntimeFromDeploymentConfig/;

describe('R08 — deployment runtime is only reachable from enumerated exceptions', () => {
  it('initModelRuntimeFromDeploymentConfig appears only inside the allowlist', () => {
    const offenders = serverSources
      .filter(
        ({ path: filePath, text }) =>
          IMPORT_PATTERN.test(text) && !DEPLOYMENT_RUNTIME_IMPORT_ALLOWLIST.has(filePath),
      )
      .map(({ path: filePath }) => filePath);

    expect(offenders).toEqual([]);
  });

  it('keeps the allowlist honest — every row still uses the symbol', () => {
    const unused = [...DEPLOYMENT_RUNTIME_IMPORT_ALLOWLIST].filter((allowed) => {
      const source = serverSources.find(({ path: filePath }) => filePath === allowed);
      // A row whose file vanished or no longer references the symbol is stale —
      // shrink the allowlist instead of letting it rot.
      return !source || !IMPORT_PATTERN.test(source.text);
    });

    expect(unused).toEqual([]);
  });

  it('every aiGeneration generateObject caller declares a kind', () => {
    const offenders = serverSources
      .filter(({ path: filePath, text }) => {
        if (filePath === 'services/aiGeneration/index.ts') return false;
        if (!text.includes('generateObject(') || !/AiGenerationService|generateObject/.test(text)) {
          return false;
        }
        // A callsite that talks to AiGenerationService but never picks a kind
        // bypassed the discriminated union — catch the textual shape so a
        // type-unchecked path still trips.
        const callsAiGeneration =
          /new AiGenerationService\(|aiGenerationService|generator\.generateObject|ai\.generateObject|generateObject\(/.test(
            text,
          );
        return (
          callsAiGeneration &&
          !text.includes("kind: 'judgment'") &&
          !text.includes('kind: "judgment"') &&
          !text.includes("kind: 'basic'") &&
          !text.includes('kind: "basic"')
        );
      })
      .map(({ path: filePath }) => filePath);

    expect(offenders).toEqual([]);
  });

  describe('the guard itself is falsifiable', () => {
    it('flags a file outside the allowlist', () => {
      const bad = [
        { path: 'services/evil/index.ts', text: 'initModelRuntimeFromDeploymentConfig(u, p);' },
      ];
      const offenders = bad
        .filter(
          ({ path: p, text }) =>
            IMPORT_PATTERN.test(text) && !DEPLOYMENT_RUNTIME_IMPORT_ALLOWLIST.has(p),
        )
        .map(({ path: p }) => p);
      expect(offenders).toEqual(['services/evil/index.ts']);
    });
  });
});
