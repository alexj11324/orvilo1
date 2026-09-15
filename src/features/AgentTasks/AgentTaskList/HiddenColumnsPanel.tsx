import { useDroppable } from '@dnd-kit/core';
import { Icon, Tooltip } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import TaskStatusIcon from '../features/TaskStatusIcon';

export const HIDDEN_PANEL_WIDTH = {
  collapsed: 36,
  expanded: 220,
};

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};

    transition: border-color 0.2s;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
    }
  `,
  cardDropOver: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
    box-shadow: 0 0 0 1px ${cssVar.colorPrimary};
  `,
  collapsedHeader: css`
    cursor: pointer;

    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;

    padding-block: 12px;
    padding-inline: 6px;

    color: ${cssVar.colorTextSecondary};
  `,
  count: css`
    margin-inline-start: auto;
    color: ${cssVar.colorTextTertiary};
  `,
  header: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    padding-block: 10px 8px;
    padding-inline: 6px;

    color: ${cssVar.colorTextSecondary};
  `,
  list: css`
    display: flex;
    flex-direction: column;
    gap: 6px;

    padding-block: 4px 12px;
    padding-inline: 2px;
  `,
  panel: css`
    display: flex;
    flex-direction: column;
    flex-shrink: 0;

    max-height: 100%;
    margin-inline-start: auto;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  verticalLabel: css`
    writing-mode: vertical-rl;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
  `,
}));

interface HiddenColumn {
  columnKey: string;
  /** Hidden columns stay valid drop targets unless the view filters them out. */
  droppable?: boolean;
  label: string;
  statusIcon?: TaskStatus;
  total: number;
}

interface HiddenColumnsPanelProps {
  collapsed: boolean;
  columns: HiddenColumn[];
  onRestore: (columnKey: string) => void;
  onToggleCollapsed: (next: boolean) => void;
}

const HiddenColumnRow = memo<{
  column: HiddenColumn;
  onRestore: (columnKey: string) => void;
}>(({ column, onRestore }) => {
  const { t } = useTranslation('chat');
  const { isOver, setNodeRef } = useDroppable({
    disabled: column.droppable === false,
    id: column.columnKey,
  });

  return (
    <div
      className={cx(styles.card, isOver && styles.cardDropOver)}
      data-hidden-column-drop-over={isOver || undefined}
      data-hidden-column-drop-target={column.columnKey}
      key={column.columnKey}
      ref={setNodeRef}
      title={t('taskList.kanban.showColumn')}
      onClick={() => onRestore(column.columnKey)}
    >
      {column.statusIcon && <TaskStatusIcon size={16} status={column.statusIcon} />}
      <Text fontSize={13}>{column.label}</Text>
      <Text className={styles.count} fontSize={12}>
        {column.total}
      </Text>
    </div>
  );
});

const HiddenColumnsPanel = memo<HiddenColumnsPanelProps>(
  ({ collapsed, columns, onRestore, onToggleCollapsed }) => {
    const { t } = useTranslation('chat');

    if (columns.length === 0) return null;

    const title = t('taskList.kanban.hiddenColumns');

    if (collapsed) {
      return (
        <div
          data-no-board-pan
          className={styles.panel}
          style={{ width: HIDDEN_PANEL_WIDTH.collapsed }}
          onClick={() => onToggleCollapsed(false)}
        >
          <Tooltip title={title}>
            <div className={styles.collapsedHeader}>
              <Icon icon={PanelRightOpen} size={16} />
              <Text className={styles.verticalLabel} type={'secondary'}>
                {title}
              </Text>
            </div>
          </Tooltip>
        </div>
      );
    }

    return (
      <div
        data-no-board-pan
        className={styles.panel}
        style={{ width: HIDDEN_PANEL_WIDTH.expanded }}
      >
        <div className={styles.header} onClick={() => onToggleCollapsed(true)}>
          <Text fontSize={13} weight={500}>
            {title}
          </Text>
          <Text className={styles.count} fontSize={12}>
            {columns.length}
          </Text>
          <Icon icon={PanelRightClose} size={16} />
        </div>
        <div className={styles.list}>
          {columns.map((column) => (
            <HiddenColumnRow column={column} key={column.columnKey} onRestore={onRestore} />
          ))}
        </div>
      </div>
    );
  },
);

export default HiddenColumnsPanel;
