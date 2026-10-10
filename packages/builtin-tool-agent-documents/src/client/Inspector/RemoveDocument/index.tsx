'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { RemoveDocumentArgs, RemoveDocumentState } from '../../../types';
import { formatDocumentId } from '../_styles';

export const RemoveDocumentInspector = memo<
  BuiltinInspectorProps<RemoveDocumentArgs, RemoveDocumentState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
  const { t } = useTranslation('plugin');

  const id = args?.id || partialArgs?.id;

  return (
    <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 4 }}>
      <span
        className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}
        style={{ color: 'var(--destructive)' }}
      >
        {t('builtins.orvilo-agent-documents.apiName.removeDocument')}
      </span>
      {id && (
        <span className="shrink-0 rounded-full border border-dashed border-[var(--ant-color-error-border)] bg-transparent py-0.5 ps-2 pe-2 [font-family:var(--ant-font-family-code)] text-xs leading-[inherit] text-destructive line-through">
          {formatDocumentId(id)}
        </span>
      )}
    </div>
  );
});

RemoveDocumentInspector.displayName = 'RemoveDocumentInspector';

export default RemoveDocumentInspector;
