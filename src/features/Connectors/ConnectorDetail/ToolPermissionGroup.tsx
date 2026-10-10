import { ChevronDownIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DropdownMenu } from '@/components/ItemsMenu';
import { Button } from '@/components/ui/button';
import { ConnectorToolPermission } from '@/database/schemas';
import type { ConnectorTool } from '@/store/tool/slices/connector';

import ToolPermissionRow from './ToolPermissionRow';

interface ToolPermissionGroupProps {
  /** Read-only mode — the caller lacks the manage permission for this connector. */
  disabled?: boolean;
  label: string;
  onBatchPermission: (toolIds: string[], permission: ConnectorToolPermission) => void;
  onPermissionChange: (toolId: string, permission: ConnectorToolPermission) => void;
  tools: ConnectorTool[];
}

const ToolPermissionGroup = memo<ToolPermissionGroupProps>(
  ({ disabled, label, tools, onPermissionChange, onBatchPermission }) => {
    const { t } = useTranslation('tool');
    const [expanded, setExpanded] = useState(true);

    if (tools.length === 0) return null;

    const toolIds = tools.map((tool) => tool.id);

    const batchItems = [
      {
        key: 'auto',
        label: t('connector.permission.autoAll', 'Auto all'),
        onClick: () => onBatchPermission(toolIds, ConnectorToolPermission.auto),
      },
      {
        key: 'approval',
        label: t('connector.permission.approvalAll', 'Needs approval all'),
        onClick: () => onBatchPermission(toolIds, ConnectorToolPermission.needs_approval),
      },
      {
        key: 'disable',
        label: t('connector.permission.disableAll', 'Disable all'),
        onClick: () => onBatchPermission(toolIds, ConnectorToolPermission.disabled),
      },
    ];

    return (
      <div>
        <div className={'flex items-center gap-2 px-0 py-2.5 select-none'}>
          <Button
            aria-expanded={expanded}
            className="h-auto flex-1 justify-start gap-1.5 rounded-sm p-0 text-start text-sm font-medium hover:bg-transparent"
            type="button"
            variant="ghost"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
            {label}
            <span
              className={
                'inline-flex items-center justify-center rounded-(--radius-chip) bg-selected px-1.5 py-px text-[12px] text-muted-foreground'
              }
            >
              {tools.length}
            </span>
          </Button>

          {!disabled && (
            <DropdownMenu items={batchItems}>
              <Button size="xs">
                <MoreHorizontalIcon size={12} />
                {t('connector.permission.custom', 'Custom')}
                <ChevronDownIcon size={12} />
              </Button>
            </DropdownMenu>
          )}
        </div>

        {expanded && (
          <div>
            {tools.map((tool) => (
              <ToolPermissionRow
                disabled={disabled}
                key={tool.id}
                tool={tool}
                onPermissionChange={onPermissionChange}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);

ToolPermissionGroup.displayName = 'ToolPermissionGroup';

export default ToolPermissionGroup;
