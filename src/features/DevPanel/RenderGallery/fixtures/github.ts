'use client';

import { defineFixtures, single } from './_helpers';

export default defineFixtures({
  identifier: 'github',
  fixtures: {
    create_pull_request: single({
      args: {
        base: 'canary',
        head: 'fix/codex-github-render',
        repository_full_name: 'alexj11324/orvilo1',
        title: 'Render Codex GitHub MCP tool calls',
      },
      content: JSON.stringify({
        base: 'canary',
        body: 'Render Codex GitHub MCP tool calls with a dedicated summary card.',
        draft: false,
        head: 'fix/codex-github-render',
        mergeable: true,
        merged: false,
        number: 16430,
        repository_full_name: 'alexj11324/orvilo1',
        state: 'open',
        title: 'Render Codex GitHub MCP tool calls',
        updated_at: '2026-06-29T08:20:00Z',
        url: 'https://github.com/alexj11324/orvilo1/pull/16430',
      }),
    }),
    run_command: single({
      args: {
        command: 'gh api /repos/alexj11324/orvilo1/issues?state=open',
      },
      pluginState: {
        command: 'gh api /repos/alexj11324/orvilo1/issues?state=open',
        exitCode: 0,
        success: true,
      },
    }),
  },
});
