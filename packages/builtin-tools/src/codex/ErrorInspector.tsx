'use client';

import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cx } from 'antd-style';
import { AlertTriangle } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

export interface CodexErrorArgs {
  id?: string;
  message?: string;
  type?: string;
}

const styles = {
  icon: 'flex-none text-warning-text',
  message: 'min-w-0 truncate text-warning-text',
  root: 'items-center gap-1.5',
};

const ErrorInspector = memo<BuiltinInspectorProps<CodexErrorArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const message = args?.message?.trim() || partialArgs?.message?.trim();
    const fallback = t('builtins.codex.error.fallback', {
      defaultValue: 'Codex reported a warning',
    });

    return (
      <div
        className={cx(inspectorTextStyles.root, styles.root)}
        data-testid="codex-error-inspector"
      >
        <AlertTriangle className={styles.icon} size={16} />
        <span
          className={cx(
            styles.message,
            (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
          )}
        >
          {message || fallback}
        </span>
      </div>
    );
  },
);

ErrorInspector.displayName = 'CodexErrorInspector';

export default ErrorInspector;
