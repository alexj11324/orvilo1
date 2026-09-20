import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const PKG_ROOT = path.join(__dirname, '..');

describe('generate-openapi', () => {
  it('openapi.yml stays in sync with the registered routes', () => {
    // Runs the generator in --check mode as a subprocess (the same command CI
    // and developers use), so the committed spec failing to match the routes
    // fails this test with the generator's own diagnostics.
    try {
      execSync('bun scripts/generate-openapi.ts --check', {
        cwd: PKG_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      const execError = error as { stderr?: string; stdout?: string };
      throw new Error(
        `openapi.yml is out of date. Run \`bun generate:openapi\` in packages/openapi and commit the result.\n${execError.stderr ?? ''}${execError.stdout ?? ''}`,
        { cause: error },
      );
    }
  }, 120_000);

  it('committed spec is a valid OpenAPI 3.1 document with full route coverage', () => {
    const spec = parse(readFileSync(path.join(PKG_ROOT, 'openapi.yml'), 'utf8'));

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Orvilo API');
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    expect(spec.components.schemas.Agent.additionalProperties).toBe(false);
    expect(spec.components.schemas.Agent.properties).not.toHaveProperty('clientId');
    expect(spec.components.schemas.Agent.properties).not.toHaveProperty('marketIdentifier');
    expect(spec.components.schemas.Agent.properties).not.toHaveProperty('userId');
    expect(spec.components.schemas.Agent.properties).not.toHaveProperty('workspaceId');
    // Provider management is retired — the public spec must not expose a
    // `Provider` component at all (user keyVaults can never leak through it).
    expect(spec.components.schemas.Provider).toBeUndefined();
    // Direct model-invoke endpoints are retired: no app-owned completion or
    // translation route may remain in the public spec.
    expect(spec.components.schemas.ChatResponse).toBeUndefined();
    expect(spec.paths['/api/v1/chat']).toBeUndefined();
    expect(spec.paths['/api/v1/chat/translate']).toBeUndefined();
    expect(spec.paths['/api/v1/chat/generate-reply']).toBeUndefined();
    expect(spec.paths['/api/v1/messages/replies']).toBeUndefined();
    expect(Object.keys(spec.paths['/api/v1/message-translations/{messageId}'])).not.toContain(
      'post',
    );
    expect(spec.components.schemas.McpServer.properties).not.toHaveProperty('credentials');
    expect(spec.components.schemas.McpServer.properties).not.toHaveProperty('oidcConfig');
    expect(spec.components.schemas.ApiKey.properties.scopes.items.enum).toEqual(
      expect.arrayContaining(['mcp:read', 'mcp:write', 'usage:read']),
    );
    expect(
      spec.paths['/api/v1/api-keys'].post.requestBody.content['application/json'].schema.properties
        .scopes.anyOf[0].items.enum,
    ).toEqual(expect.arrayContaining(['mcp:read', 'mcp:write', 'usage:read']));

    const operations = Object.values(spec.paths as Record<string, object>).flatMap((item) =>
      Object.keys(item).filter((method) =>
        ['delete', 'get', 'patch', 'post', 'put'].includes(method),
      ),
    );
    // Business endpoints + /health; grows as routes are added.
    expect(operations.length).toBeGreaterThanOrEqual(97);

    // Every response object must carry a description (required by OpenAPI).
    for (const item of Object.values(spec.paths as Record<string, Record<string, any>>)) {
      for (const op of Object.values(item)) {
        if (!op.responses) continue;
        expect(
          op.responses['200']?.content ??
            op.responses['201']?.content ??
            op.responses['202']?.content,
        ).toBeTruthy();
        expect(op.responses['400']?.content).toBeTruthy();
        expect(op.responses['401']?.content).toBeTruthy();
        expect(op.responses['403']?.content).toBeTruthy();
        expect(op.responses['404']?.content).toBeTruthy();
        expect(op.responses['409']?.content).toBeTruthy();
        expect(op.responses['429']?.content).toBeTruthy();
        expect(op.responses['500']?.content).toBeTruthy();
        for (const response of Object.values(
          op.responses as Record<string, { description?: string }>,
        )) {
          expect(response.description).toBeTruthy();
          expect(response.description).not.toContain('schema pending');
        }
      }
    }
  });
});
