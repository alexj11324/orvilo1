'use client';

import { type BinaryStatus } from '@orvilo/electron-client-ipc';
import { CheckCircle2, Copy, Loader2Icon, RefreshCw, XCircle } from 'lucide-react';
import { createElement, memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Form, { type FormGroupItemType } from '@/components/GroupForm';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FORM_STYLE } from '@/const/layoutTokens';
import { binaryService } from '@/services/electron/binary';
import { copyToClipboard } from '@/utils/clipboard';

/**
 * Predefined tool configurations by category
 * This allows us to always show all tools even if not detected
 */
const TOOL_CATEGORIES = {
  'runtime-environment': {
    descKey: 'settingSystemTools.category.runtimeEnvironment.desc',
    titleKey: 'settingSystemTools.category.runtimeEnvironment',
    tools: [
      { descKey: 'settingSystemTools.tools.orvilo.desc', name: 'orvilo' },
      { descKey: 'settingSystemTools.tools.node.desc', name: 'node' },
      { descKey: 'settingSystemTools.tools.python.desc', name: 'python' },
      { descKey: 'settingSystemTools.tools.npm.desc', name: 'npm' },
      { descKey: 'settingSystemTools.tools.bun.desc', name: 'bun' },
      { descKey: 'settingSystemTools.tools.bunx.desc', name: 'bunx' },
      { descKey: 'settingSystemTools.tools.pnpm.desc', name: 'pnpm' },
      { descKey: 'settingSystemTools.tools.uv.desc', name: 'uv' },
    ],
  },

  'cli-agents': {
    descKey: 'settingSystemTools.category.cliAgents.desc',
    titleKey: 'settingSystemTools.category.cliAgents',
    tools: [
      { descKey: 'settingSystemTools.tools.claude.desc', name: 'claude' },
      { descKey: 'settingSystemTools.tools.codex.desc', name: 'codex' },
      { descKey: 'settingSystemTools.tools.gemini.desc', name: 'gemini' },
      { descKey: 'settingSystemTools.tools.qwen.desc', name: 'qwen' },
      { descKey: 'settingSystemTools.tools.kimi.desc', name: 'kimi' },
      { descKey: 'settingSystemTools.tools.aider.desc', name: 'aider' },
    ],
  },

  'content-search': {
    descKey: 'settingSystemTools.category.contentSearch.desc',
    titleKey: 'settingSystemTools.category.contentSearch',
    tools: [
      { descKey: 'settingSystemTools.tools.rg.desc', name: 'rg' },
      { descKey: 'settingSystemTools.tools.ag.desc', name: 'ag' },
      { descKey: 'settingSystemTools.tools.grep.desc', name: 'grep' },
    ],
  },
  'file-search': {
    descKey: 'settingSystemTools.category.fileSearch.desc',
    titleKey: 'settingSystemTools.category.fileSearch',
    tools: [
      { descKey: 'settingSystemTools.tools.mdfind.desc', name: 'mdfind' },
      { descKey: 'settingSystemTools.tools.fd.desc', name: 'fd' },
      { descKey: 'settingSystemTools.tools.find.desc', name: 'find' },
    ],
  },
  'browser-automation': {
    descKey: 'settingSystemTools.category.browserAutomation.desc',
    titleKey: 'settingSystemTools.category.browserAutomation',
    tools: [{ descKey: 'settingSystemTools.tools.agentBrowser.desc', name: 'agent-browser' }],
  },
} as const;

interface ToolStatusDisplayProps {
  isDetecting?: boolean;
  status?: BinaryStatus;
}

const ToolStatusDisplay = memo<ToolStatusDisplayProps>(({ status, isDetecting }) => {
  const { t } = useTranslation('setting');

  if (isDetecting) {
    return (
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        {createElement(Loader2Icon, {
          size: 16,
          style: { opacity: 0.5 },
          className: 'animate-spin',
        })}
        <span className={'text-muted-foreground'}>{t('settingSystemTools.detecting')}</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        {createElement(XCircle, { color: 'var(--ant-color-text-quaternary)', size: 16 })}
        <span className={'text-muted-foreground'}>
          {t('settingSystemTools.status.notDetected')}
        </span>
      </div>
    );
  }

  if (!status.available) {
    return (
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        {createElement(XCircle, { color: 'var(--ant-color-error)', size: 16 })}
        <span className={'text-muted-foreground'}>
          {t('settingSystemTools.status.unavailable')}
        </span>
      </div>
    );
  }

  return (
    <div
      className={'flex min-w-0'}
      style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}
    >
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}
      >
        {createElement(CheckCircle2, { color: 'var(--ant-color-success)', size: 16 })}
        <span className={'text-success'}>{t('settingSystemTools.status.available')}</span>
      </div>
      {status.path && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex min-w-0">
                <div
                  className={'flex min-w-0'}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 4,
                    maxWidth: 280,
                  }}
                >
                  <span className={'truncate text-muted-foreground'} style={{ fontSize: 12 }}>
                    {status.path}
                  </span>
                  <Button
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => void copyToClipboard(status.path)}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
              </span>
            }
          />
          <TooltipContent side="top">{status.path}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
});

const ToolDetectorSection = memo(() => {
  const { t } = useTranslation('setting');
  const [toolStatuses, setToolStatuses] = useState<Record<string, BinaryStatus>>({});
  const [detecting, setDetecting] = useState(true);
  // A failed `detectAll` used to be swallowed (console.error), leaving every tool
  // rendered as "not detected" — a failure masquerading as an all-missing
  // environment. Track it so we can render a failure + Retry instead (ux Read §1.1).
  const [detectError, setDetectError] = useState<unknown>();

  const detectTools = useCallback(async (force = false) => {
    try {
      setDetecting(true);
      const statuses = await binaryService.detectAll(force);
      setToolStatuses(statuses);
      setDetectError(undefined);
    } catch (error) {
      setDetectError(error);
    } finally {
      setDetecting(false);
    }
  }, []);

  // Auto-detect on mount
  useEffect(() => {
    void detectTools(true);
  }, [detectTools]);

  const handleRedetect = useCallback(() => {
    detectTools(true);
  }, [detectTools]);

  const formItems: FormGroupItemType[] = Object.entries(TOOL_CATEGORIES).map(
    ([, categoryConfig]) => ({
      children: categoryConfig.tools.map((tool) => {
        const status = toolStatuses[tool.name];
        const label = (
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <span>{tool.name}</span>
            {status?.version && (
              <Badge style={{ marginInlineStart: 0 }} variant="primary-light">
                {status.version}
              </Badge>
            )}
          </div>
        );
        return {
          children: <ToolStatusDisplay isDetecting={detecting} status={status} />,
          desc: t(tool.descKey),
          label,
          minWidth: undefined,
        };
      }),
      desc: t(categoryConfig.descKey),
      title: t(categoryConfig.titleKey),
    }),
  );

  // Nothing detected AND the scan errored → a real failure, not an empty
  // environment. Show the reason + Retry rather than a wall of "not detected".
  if (detectError && Object.keys(toolStatuses).length === 0) {
    return <AsyncError error={detectError} variant={'block'} onRetry={handleRedetect} />;
  }

  return (
    <Form
      collapsible={false}
      items={formItems}
      itemsType={'group'}
      variant={'filled'}
      footer={
        <div
          className={'flex min-w-0'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 16,
            marginBlockStart: 8,
          }}
        >
          <Button
            aria-busy={detecting}
            disabled={detecting}
            variant="outline"
            onClick={handleRedetect}
          >
            {detecting && <Spinner />}
            {createElement(RefreshCw, { className: detecting ? 'animate-spin' : undefined })}
            {t('settingSystemTools.redetect')}
          </Button>
        </div>
      }
      {...FORM_STYLE}
    />
  );
});

export default ToolDetectorSection;
