'use client';

import type { ModifyNodesArgs } from '@orvilo/editor-runtime';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { DiffIcon, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { oneLineEllipsis, shinyTextStyles } from '@/styles';

import type { ModifyNodesState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  separator: css`
    margin-inline: 2px;
    color: ${cssVar.colorTextQuaternary};
  `,
  title: css`
    margin-inline-end: 8px;
    color: ${cssVar.colorText};
  `,
}));

export const ModifyNodesInspector = memo<BuiltinInspectorProps<ModifyNodesArgs, ModifyNodesState>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    // Count operations by type
    const counts = useMemo(() => {
      const ops = args?.operations || partialArgs?.operations;
      // During streaming, operations may be a partial object instead of array
      if (!Array.isArray(ops)) return { insert: 0, modify: 0, remove: 0 };

      return ops.reduce(
        (acc, op) => {
          switch (op.action) {
            case 'insert': {
              acc.insert++;
              break;
            }
            case 'modify': {
              acc.modify++;
              break;
            }
            case 'remove': {
              {
                acc.remove++;
                // No default
              }
              break;
            }
          }
          return acc;
        },
        { insert: 0, modify: 0, remove: 0 },
      );
    }, [args?.operations, partialArgs?.operations]);

    const hasOperations = counts.insert > 0 || counts.modify > 0 || counts.remove > 0;

    // During streaming without operations yet, show init message
    if (isArgumentsStreaming && !hasOperations) {
      return (
        <div className={oneLineEllipsis}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-page-agent.apiName.modifyNodes.init')}
          </span>
        </div>
      );
    }

    // Build stats parts with colors and icons
    const statsParts: ReactNode[] = [];
    if (counts.insert > 0) {
      statsParts.push(
        <span
          className="font-mono rounded bg-muted px-1 text-[12px]"
          key="insert"
          style={{ color: cssVar.colorSuccess }}
        >
          <Plus size={12} />
          {counts.insert}
        </span>,
      );
    }
    if (counts.modify > 0) {
      statsParts.push(
        <span
          className="font-mono rounded bg-muted px-1 text-[12px]"
          key="modify"
          style={{ color: cssVar.colorWarning }}
        >
          <DiffIcon size={12} />
          {counts.modify}
        </span>,
      );
    }
    if (counts.remove > 0) {
      statsParts.push(
        <span
          className="font-mono rounded bg-muted px-1 text-[12px]"
          key="remove"
          style={{ color: cssVar.colorError }}
        >
          <Minus size={12} />
          {counts.remove}
        </span>,
      );
    }

    return (
      <div className={oneLineEllipsis}>
        <span className={cx(styles.title, isArgumentsStreaming && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-page-agent.apiName.modifyNodes')}
        </span>
        {statsParts.length > 0 && (
          <>
            {' '}
            {statsParts.map((part, index) => (
              <span key={index}>
                {index > 0 && <span className={styles.separator}> / </span>}
                {part}
              </span>
            ))}
          </>
        )}
      </div>
    );
  },
);

ModifyNodesInspector.displayName = 'ModifyNodesInspector';

export default ModifyNodesInspector;
