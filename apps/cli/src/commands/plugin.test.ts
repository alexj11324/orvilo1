import { describe, expect, it, vi } from 'vitest';

import { createProgram } from '../program';

vi.mock('../api/client', () => ({ getTrpcClient: vi.fn() }));
vi.mock('../tools', () => ({ executeToolCall: vi.fn() }));
vi.mock('./agent', () => ({ registerAgentCommand: () => {} }));
vi.mock('./agent-group', () => ({ registerAgentGroupCommand: () => {} }));
vi.mock('./agent-signal', () => ({ registerAgentSignalCommand: () => {} }));
vi.mock('./artifact', () => ({ registerArtifactCommand: () => {} }));
vi.mock('./completion', () => ({ registerCompletionCommand: () => {} }));
vi.mock('./config', () => ({ registerConfigCommand: () => {} }));
vi.mock('./connect', () => ({ registerConnectCommand: () => {} }));
vi.mock('./device', () => ({ registerDeviceCommand: () => {} }));
vi.mock('./doc', () => ({ registerDocCommand: () => {} }));
vi.mock('./eval', () => ({ registerEvalCommand: () => {} }));
vi.mock('./file', () => ({ registerFileCommand: () => {} }));
vi.mock('./generate', () => ({ registerGenerateCommand: () => {} }));
vi.mock('./goal', () => ({ registerGoalCommand: () => {} }));
vi.mock('./hetero', () => ({ registerHeteroCommand: () => {} }));
vi.mock('./kb', () => ({ registerKbCommand: () => {} }));
vi.mock('./login', () => ({ registerLoginCommand: () => {} }));
vi.mock('./logout', () => ({ registerLogoutCommand: () => {} }));
vi.mock('./man', () => ({ registerManCommand: () => {} }));
vi.mock('./memory', () => ({ registerMemoryCommand: () => {} }));
vi.mock('./message', () => ({ registerMessageCommand: () => {} }));
vi.mock('./migrate', () => ({ registerMigrateCommand: () => {} }));
vi.mock('./notify', () => ({ registerNotifyCommand: () => {} }));
vi.mock('./primeExec', () => ({ registerPrimeCommand: () => {} }));
vi.mock('./project', () => ({ registerProjectCommand: () => {} }));
vi.mock('./search', () => ({ registerSearchCommand: () => {} }));
vi.mock('./session-group', () => ({ registerSessionGroupCommand: () => {} }));
vi.mock('./status', () => ({ registerStatusCommand: () => {} }));
vi.mock('./task', () => ({ registerTaskCommand: () => {} }));
vi.mock('./thread', () => ({ registerThreadCommand: () => {} }));
vi.mock('./topic', () => ({ registerTopicCommand: () => {} }));
vi.mock('./trace', () => ({ registerTraceCommand: () => {} }));
vi.mock('./update', () => ({ registerUpdateCommand: () => {} }));
vi.mock('./user', () => ({ registerUserCommand: () => {} }));
vi.mock('./verify', () => ({ registerVerifyCommand: () => {} }));
vi.mock('./workspace', () => ({ registerWorkspaceCommand: () => {} }));

describe('retired plugin command', () => {
  it('rejects plugin commands and omits them from CLI help', async () => {
    const program = createProgram();
    program.exitOverride();
    program.configureOutput({ writeErr: () => {} });

    expect(program.commands.map((command) => command.name())).not.toContain('plugin');
    expect(program.helpInformation()).not.toMatch(/\bplugin\b/);
    await expect(program.parseAsync(['node', 'orvilo', 'plugin', 'list'])).rejects.toMatchObject({
      code: 'commander.unknownCommand',
    });
  });
});
