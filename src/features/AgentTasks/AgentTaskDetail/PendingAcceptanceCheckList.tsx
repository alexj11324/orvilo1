'use client';

import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { CircleDashed } from 'lucide-react';
import { memo } from 'react';

import { CriterionList, CriterionRow, shouldGroupChecks } from '@/features/Acceptance';

const styles = createStaticStyles(({ css }) => ({
  groupHeader: css`
    padding-block: 9px;
    padding-inline: 12px;
  `,
}));

export interface PendingAcceptanceCheckItem {
  id: string;
  title: string;
}

interface PendingAcceptanceCheckListProps {
  groupLabel: string;
  items: PendingAcceptanceCheckItem[];
  onOpen: (item: PendingAcceptanceCheckItem) => void;
}

/** The pre-run projection of Acceptance checks: same list grammar, pending verdicts. */
export const PendingAcceptanceCheckList = memo<PendingAcceptanceCheckListProps>(
  ({ groupLabel, items, onOpen }) => {
    const grouped = shouldGroupChecks(items.length);

    return (
      <CriterionList>
        {grouped && (
          <div className={`flex items-center gap-2 ${styles.groupHeader}`}>
            <Text fontSize={12}>{groupLabel}</Text>
            <Text fontSize={11} type={'secondary'}>
              {items.length}
            </Text>
          </div>
        )}
        {items.map((item, index) => (
          <CriterionRow
            data-task-acceptance-criterion={item.id}
            key={item.id}
            seq={index + 1}
            title={item.title}
            icon={
              <CircleDashed color={cssVar.colorTextQuaternary} size={16} style={{ flex: 'none' }} />
            }
            onOpen={() => onOpen(item)}
          />
        ))}
      </CriterionList>
    );
  },
);

PendingAcceptanceCheckList.displayName = 'PendingAcceptanceCheckList';
