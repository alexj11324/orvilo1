import { createStaticStyles } from 'antd-style';
import { BanIcon, CheckIcon, HandIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { ConnectorToolPermission } from '@/database/schemas';
import type { ConnectorTool } from '@/store/tool/slices/connector';

const styles = createStaticStyles(({ css, cssVar }) => ({
  description: css`
    overflow: hidden;

    font-size: 12px;
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
    font-size: 14px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

const PERMISSION_OPTIONS = [
  {
    icon: CheckIcon,
    labelKey: 'connector.toolPermission.auto',
    permission: ConnectorToolPermission.auto,
  },
  {
    icon: HandIcon,
    labelKey: 'connector.toolPermission.needsApproval',
    permission: ConnectorToolPermission.needs_approval,
  },
  {
    icon: BanIcon,
    labelKey: 'connector.toolPermission.disabled',
    permission: ConnectorToolPermission.disabled,
  },
] as const;

interface ToolPermissionRowProps {
  /** Read-only mode — the caller lacks the manage permission for this connector. */
  disabled?: boolean;
  onPermissionChange: (toolId: string, permission: ConnectorToolPermission) => void;
  tool: ConnectorTool;
}

const ToolPermissionRow = memo<ToolPermissionRowProps>(({ disabled, tool, onPermissionChange }) => {
  const { t } = useTranslation('tool');
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
      <ToggleGroup
        aria-label={tool.toolName}
        className={disabled ? 'cursor-not-allowed opacity-45' : undefined}
        disabled={disabled}
        size="sm"
        spacing={0}
        value={[tool.permission]}
        onValueChange={(value) => {
          // A pressed item stays pressed: ignore the "toggle off" event so the
          // group always reflects exactly one permission.
          const next = value[0] as ConnectorToolPermission | undefined;
          if (next && next !== tool.permission) handleChange(next);
        }}
      >
        {PERMISSION_OPTIONS.map(({ icon: Icon, labelKey, permission }) => (
          <ToggleGroupItem
            aria-label={t(labelKey)}
            key={permission}
            title={t(labelKey)}
            value={permission}
          >
            <Icon size={15} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
});

ToolPermissionRow.displayName = 'ToolPermissionRow';

export default ToolPermissionRow;
