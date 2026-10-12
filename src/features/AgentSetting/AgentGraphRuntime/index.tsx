'use client';

import type { AgentGraph, OrviloAgentChatConfig } from '@orvilo/types';
import { AgentGraphSchema } from '@orvilo/types/agent/graph';
import isEqual from 'fast-deep-equal';
import { CircleAlert } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { useStore } from '../store';
import { selectors } from '../store/selectors';

const formatGraph = (graph?: AgentGraph | null) => (graph ? JSON.stringify(graph, null, 2) : '');

const AgentGraphRuntime = memo(() => {
  const { t } = useTranslation('setting');
  const config = useStore(selectors.currentAgentConfig, isEqual);
  const [disabled, updateConfig] = useStore((s) => [s.disabled, s.setAgentConfig]);
  // Legacy rows may still store the graph on chatConfig until their next write
  // migrates it. The server keeps running those via the legacy fallback, so the
  // editor must show the effective config — otherwise an actively-running graph
  // agent would render as disabled with an empty snapshot.
  const legacyChatConfig = config.chatConfig as
    (OrviloAgentChatConfig & { enableGraphMode?: boolean; graph?: AgentGraph | null }) | undefined;
  const initialEnabled =
    config.agencyConfig?.enableGraphMode === true || legacyChatConfig?.enableGraphMode === true;
  const initialGraphText = useMemo(
    () => formatGraph(config.agencyConfig?.graph ?? legacyChatConfig?.graph),
    [config.agencyConfig?.graph, legacyChatConfig?.graph],
  );

  const [enabled, setEnabled] = useState(initialEnabled);
  const [graphText, setGraphText] = useState(initialGraphText);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(initialEnabled);
    setGraphText(initialGraphText);
    setError(undefined);
  }, [initialEnabled, initialGraphText]);

  const isDirty = enabled !== initialEnabled || graphText !== initialGraphText;

  const handleSave = useCallback(async () => {
    if (disabled) return;

    const trimmedGraphText = graphText.trim();
    if (enabled && !trimmedGraphText) {
      setError(t('settingGraphRuntime.validation.required'));
      return;
    }

    let graph: AgentGraph | undefined;

    if (trimmedGraphText) {
      let parsedGraph: unknown;

      try {
        parsedGraph = JSON.parse(trimmedGraphText);
      } catch {
        setError(t('settingGraphRuntime.validation.invalidJson'));
        return;
      }

      const graphResult = AgentGraphSchema.safeParse(parsedGraph);

      if (!graphResult.success) {
        setError(
          t('settingGraphRuntime.validation.invalidGraph', {
            error:
              graphResult.error.issues[0]?.message || t('settingGraphRuntime.validation.unknown'),
          }),
        );
        return;
      }

      graph = graphResult.data;
    }

    setError(undefined);
    setSaving(true);

    try {
      await updateConfig({
        agencyConfig: { enableGraphMode: enabled, graph: graph ?? null },
      });
    } finally {
      setSaving(false);
    }
  }, [disabled, enabled, graphText, t, updateConfig]);

  return (
    <div className="flex w-full max-w-160 flex-col gap-4">
      <div className="flex items-center gap-4 rounded-(--radius-card) border border-divider bg-card p-4">
        <div className="flex flex-col flex-1 gap-1">
          <h3 className="m-0 text-sm leading-5.5 font-semibold text-foreground">
            {t('settingGraphRuntime.enabled.title')}
          </h3>
          <p className="m-0 text-sm leading-5.5 text-muted-foreground">
            {t('settingGraphRuntime.enabled.desc')}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => {
            setEnabled(checked);
            setError(undefined);
          }}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-(--radius-card) border border-divider bg-card p-4">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-sm leading-5.5 font-semibold text-foreground">
            {t('settingGraphRuntime.snapshot.title')}
          </h3>
          <p className="m-0 text-sm leading-5.5 text-muted-foreground">
            {t('settingGraphRuntime.snapshot.desc')}
          </p>
        </div>
        <Textarea
          className="font-mono text-sm leading-5.5"
          disabled={disabled}
          placeholder={t('settingGraphRuntime.snapshot.placeholder')}
          rows={16}
          value={graphText}
          onChange={(event) => {
            setGraphText(event.target.value);
            setError(undefined);
          }}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button
          disabled={disabled || !isDirty}
          loading={saving}
          size="lg"
          variant="default"
          onClick={handleSave}
        >
          {t('save', { ns: 'common' })}
        </Button>
      </div>
    </div>
  );
});

export default AgentGraphRuntime;
