import { describe, expect, it } from 'vitest';

import { buildReadFileState } from '../../../../../../../../packages/builtin-tool-local-system/src/client/Render/ReadLocalFile/buildReadFileState';
import { parseOpenCodeReadContent } from '../../../../../../../../packages/builtin-tool-local-system/src/client/Render/ReadLocalFile/parseReadContent';
import { parseTestReport } from '../../../../../../../../packages/shared-tool-ui/src/Render/RunCommand/parseStructuredOutput';
import { normalizeOpenCodeRender } from './normalizeOpenCode';

describe('OpenCode ACP render input', () => {
  it('uses the final command instead of initial cwd-only arguments', () => {
    expect(
      normalizeOpenCodeRender(
        { cwd: '/app' },
        { rawInput: { command: 'git log -1', workdir: '/repo' } },
        'bash',
      ).args,
    ).toEqual({ cwd: '/app', command: 'git log -1', workdir: '/repo' });
  });
  it('reads rawInput file paths without treating ACP content blocks as file text', () => {
    expect(
      normalizeOpenCodeRender(
        {},
        { rawInput: { filePath: '/repo/a.ts' }, content: [{ type: 'content' }] },
        'read',
      ),
    ).toMatchObject({
      args: { filePath: '/repo/a.ts' },
      pluginState: { content: undefined },
    });
  });
  it('preserves ordinary arguments and rejects non-object raw input', () => {
    expect(
      normalizeOpenCodeRender({ command: 'pwd' }, { rawInput: 'not an input object' }, 'bash').args,
    ).toEqual({ command: 'pwd' });
  });
});

it('preserves parsed OpenCode envelopes through the render adapter', () => {
  const report = {
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    testResults: [
      { name: 'a.test.ts', assertionResults: [{ fullName: 'passes', status: 'passed' }] },
    ],
  };
  const envelope =
    '<path>/repo/report.json</path><content>1: ' +
    JSON.stringify(report) +
    '\n(End of file - total 1 lines)\n</content>';
  const input = normalizeOpenCodeRender(
    {},
    { rawInput: { filePath: '/repo/report.json' }, content: [{ type: 'content' }] },
    'read',
  );
  const state = buildReadFileState({
    args: input.args,
    identifier: 'opencode',
    parsedContent: parseOpenCodeReadContent(envelope),
    pluginState: input.pluginState,
  });
  expect(state?.content).toBe(JSON.stringify(report));
  expect(parseTestReport(state!.content)?.summary.passed).toBe(1);
});
