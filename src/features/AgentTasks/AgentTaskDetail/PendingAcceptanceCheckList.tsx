'use client';

import { CircleDashed } from 'lucide-react';
import { memo } from 'react';

import { CriterionList, CriterionRow, shouldGroupChecks } from '@/features/Acceptance';

const styles = {
  groupHeader: 'py-2.25 px-3',
};

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
            <div className="text-xs">{groupLabel}</div>
            <div className="text-xs text-muted-foreground">{items.length}</div>
          </div>
        )}
        {items.map((item, index) => (
          <CriterionRow
            data-task-acceptance-criterion={item.id}
            key={item.id}
            seq={index + 1}
            title={item.title}
            icon={
              <CircleDashed className="flex-none size-4 text-foreground-quaternary" size={16} />
            }
            onOpen={() => onOpen(item)}
          />
        ))}
      </CriterionList>
    );
  },
);

PendingAcceptanceCheckList.displayName = 'PendingAcceptanceCheckList';
