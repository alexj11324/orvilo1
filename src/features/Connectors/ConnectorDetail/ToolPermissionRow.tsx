import { BanIcon, CheckIcon, HandIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { ConnectorToolPermission } from '@/database/schemas';
import type { ConnectorTool } from '@/store/tool/slices/connector';

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
    <div
      className={
        'flex items-center gap-2 border-be border-sidebar-border px-3 py-2 last:border-be-0 hover:bg-(--ant-color-fill-quaternary)'
      }
    >
      <div className={'min-w-0 flex-1 overflow-hidden'}>
        <div className={'truncate font-mono text-[14px] text-foreground'}>{tool.toolName}</div>
        {tool.description && (
          <SimpleTooltip title={tool.description}>
            <div className={'truncate text-[12px] leading-[1.4] text-(--ant-color-text-tertiary)'}>
              {tool.description}
            </div>
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
