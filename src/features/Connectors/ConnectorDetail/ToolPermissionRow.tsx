import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { BanIcon, CheckIcon, HandIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { SimpleTooltip } from '@/components/ui/tooltip';
import { ConnectorToolPermission } from '@/database/schemas';
import type { ConnectorTool } from '@/store/tool/slices/connector';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = createStaticStyles(({ css, cssVar }) => ({
  btn: css`
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 28px;
    height: 28px;
    border-radius: 6px;

    color: ${cssVar.colorTextQuaternary};

    transition:
      color 0.15s,
      background 0.15s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  btnActive: css`
    color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};

    &:hover {
      color: ${cssVar.colorPrimary};
      background: ${cssVar.colorPrimaryBgHover};
    }
  `,
  description: css`
    overflow: hidden;

    font-size: 11px;
    line-height: 1.4;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  nameCell: css`
    overflow: hidden;
    flex: 1;
    min-width: 0;
  `,
  row: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: none;
    }

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  toolName: css`
    overflow: hidden;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 13px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

interface ToolPermissionRowProps {
  /** Read-only mode — the caller lacks the manage permission for this connector. */
  disabled?: boolean;
  onPermissionChange: (toolId: string, permission: ConnectorToolPermission) => void;
  tool: ConnectorTool;
}

const ToolPermissionRow = memo<ToolPermissionRowProps>(({ disabled, tool, onPermissionChange }) => {
  const { t } = useTranslation('tool');
  const btnClass = (permission: ConnectorToolPermission) =>
    tool.permission === permission ? `${styles.btn} ${styles.btnActive}` : styles.btn;

  const handleChange = (permission: ConnectorToolPermission) => {
    if (disabled) return;
    onPermissionChange(tool.id, permission);
  };

  return (
    <div className={styles.row}>
      <div className={styles.nameCell}>
        <div className={styles.toolName}>{tool.toolName}</div>
        {tool.description && (
          <SimpleTooltip title={tool.description}>
            <div className={styles.description}>{tool.description}</div>
          </SimpleTooltip>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          gap: 2,
          ...(disabled && { cursor: 'not-allowed', opacity: 0.45 }),
        }}
      >
        <div
          {...clickableProps()}
          className={cn(btnClass(ConnectorToolPermission.auto), CLICKABLE_FOCUS_RING)}
          style={disabled ? { pointerEvents: 'none' } : undefined}
          title={t('connector.toolPermission.auto')}
          onClick={() => handleChange(ConnectorToolPermission.auto)}
        >
          <CheckIcon size={15} />
        </div>
        <div
          {...clickableProps()}
          className={cn(btnClass(ConnectorToolPermission.needs_approval), CLICKABLE_FOCUS_RING)}
          style={disabled ? { pointerEvents: 'none' } : undefined}
          title={t('connector.toolPermission.needsApproval')}
          onClick={() => handleChange(ConnectorToolPermission.needs_approval)}
        >
          <HandIcon size={15} />
        </div>
        <div
          {...clickableProps()}
          className={cn(btnClass(ConnectorToolPermission.disabled), CLICKABLE_FOCUS_RING)}
          style={disabled ? { pointerEvents: 'none' } : undefined}
          title={t('connector.toolPermission.disabled')}
          onClick={() => handleChange(ConnectorToolPermission.disabled)}
        >
          <BanIcon size={15} />
        </div>
      </div>
    </div>
  );
});

ToolPermissionRow.displayName = 'ToolPermissionRow';

export default ToolPermissionRow;
