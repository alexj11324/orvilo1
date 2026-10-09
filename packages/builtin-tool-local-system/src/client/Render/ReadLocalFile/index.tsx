import { useToolRenderCapabilities } from '@orvilo/shared-tool-ui';
import { StructuredOutput, useStructuredOutput } from '@orvilo/shared-tool-ui/renders';
import type { ReadFileState } from '@orvilo/tool-runtime';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ReadFileArgs } from './buildReadFileState';
import { buildReadFileState } from './buildReadFileState';
import { parseOpenCodeReadContent } from './parseReadContent';
import ReadFileSkeleton from './ReadFileSkeleton';
import ReadFileView from './ReadFileView';

const ReadFileQuery = memo<BuiltinRenderProps<ReadFileArgs, Partial<ReadFileState>, string>>(
  ({ args, content, identifier, messageId, pluginError, pluginState }) => {
    const { t } = useTranslation('chat');
    const { isLoading } = useToolRenderCapabilities();
    const loading = isLoading?.(messageId);
    const parsedContent = useMemo(
      () =>
        identifier === 'opencode'
          ? parseOpenCodeReadContent(content || '')
          : { content: content || '' },
      [content, identifier],
    );
    const readState = useMemo<ReadFileState | undefined>(
      () => buildReadFileState({ args, identifier, parsedContent, pluginError, pluginState }),
      [args, identifier, parsedContent, pluginError, pluginState],
    );

    const view = useStructuredOutput('', readState?.content || '');

    if (loading) {
      return <ReadFileSkeleton />;
    }

    if (!readState) return null;

    return view.tests ? (
      <div className="space-y-2">
        <StructuredOutput view={view} />
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t('aiElementsMore.rawOutput', { stream: 'JSON' })}
          </summary>
          <ReadFileView {...readState} />
        </details>
      </div>
    ) : (
      <ReadFileView {...readState} />
    );
  },
);

export default ReadFileQuery;
