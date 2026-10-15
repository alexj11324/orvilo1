import assert from 'node:assert/strict';
import test from 'node:test';

import { checkText } from './checkRepositoryContracts.mjs';

test('rejects active and commented retired env assignments', () => {
  assert.equal(
    checkText('.env.example', 'AUTH_SECRET=example\n# AUTH_SSO_PROVIDERS=google').length,
    2,
  );
  assert.equal(checkText('Dockerfile', 'ENV AUTH_SECRET="" \\').length, 1);
});

test('allows current integration variables and migration explanations', () => {
  assert.deepEqual(
    checkText(
      '.env.example',
      '# AUTH_SECRET is retired\nCLERK_SECRET_KEY=placeholder\nGITHUB_APP_CLIENT_ID=example\nJWKS_KEY=placeholder',
    ),
    [],
  );
  assert.deepEqual(checkText('docs/history.mdx', 'AUTH_SECRET=historical'), []);
});

test('rejects retired recipes while allowing retirement notices', () => {
  assert.equal(
    checkText('.agents/skills/cli/SKILL.md', '| `orvilo model` | Model CRUD |').length,
    1,
  );
  assert.deepEqual(
    checkText('.agents/skills/cli/SKILL.md', 'The `orvilo model` command was removed.'),
    [],
  );
  assert.equal(
    checkText(
      '.agents/skills/upstash-workflow/references/implementation.md',
      "import { serve } from '@upstash/workflow';",
    ).length,
    1,
  );
});
