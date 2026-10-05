'use client';

import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { electronSystemService } from '@/services/electron/system';

interface CommandResult {
  args: string;
  exitCode: number;
  stderr: string;
  stdout: string;
}

const CliTestSection = memo(() => {
  const { t } = useTranslation('setting');
  const [results, setResults] = useState<CommandResult[]>([]);
  const [running, setRunning] = useState(false);
  const [customCmd, setCustomCmd] = useState('');

  const runCommand = useCallback(async (args: string) => {
    setRunning(true);
    try {
      const result = await electronSystemService.runCliCommand(args);
      setResults((prev) => [...prev, { args, ...result }]);
    } catch (error: any) {
      setResults((prev) => [...prev, { args, exitCode: -1, stderr: String(error), stdout: '' }]);
    } finally {
      setRunning(false);
    }
  }, []);

  const presetCommands = ['--version', '--help', 'status'];

  return (
    <div className={'flex min-w-0'} style={{ flexDirection: 'column', gap: 16, marginTop: 24 }}>
      <span style={{ fontSize: 18, fontWeight: 600 }}>{t('systemTools.cliTest.title')}</span>
      <div className={'flex min-w-0'} style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {presetCommands.map((cmd) => (
          <Button
            aria-busy={running}
            disabled={running}
            key={cmd}
            size="sm"
            variant="outline"
            onClick={() => runCommand(cmd)}
          >
            {running && <Spinner />}orvilo {cmd}
          </Button>
        ))}
      </div>
      <div className={'flex min-w-0'} style={{ flexDirection: 'row', gap: 8 }}>
        <Input
          aria-label={t('systemTools.cliTest.customArgs')}
          placeholder={t('systemTools.cliTest.customArgsPlaceholder')}
          style={{ flex: 1 }}
          value={customCmd}
          onChange={(e) => setCustomCmd(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && customCmd && !running) {
              void runCommand(customCmd);
            }
          }}
        />
        <Button
          aria-busy={running}
          disabled={!customCmd || running}
          size="sm"
          variant="default"
          onClick={() => runCommand(customCmd)}
        >
          {running && <Spinner />}Run
        </Button>
      </div>
      {results.map((r, i) => (
        <div
          className={'flex min-w-0'}
          key={i}
          style={{
            flexDirection: 'column',
            gap: 4,
            background: 'var(--ant-color-fill-quaternary)',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 12,
            padding: 12,
          }}
        >
          <span style={{ color: 'var(--ant-color-primary)', fontWeight: 600 }}>
            $ orvilo {r.args}(exit: {r.exitCode})
          </span>
          {r.stdout && (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {r.stdout}
            </pre>
          )}
          {r.stderr && (
            <pre
              style={{
                color: 'var(--ant-color-error)',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {r.stderr}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
});

export default CliTestSection;
