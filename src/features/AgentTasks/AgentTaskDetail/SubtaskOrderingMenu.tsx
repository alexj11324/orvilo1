import type { ReactElement } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { SubtaskOrdering } from './subtaskOrdering';
import { SUBTASK_ORDERINGS } from './subtaskOrdering';

interface SubtaskOrderingMenuProps {
  align?: 'end' | 'start';
  onValueChange: (ordering: SubtaskOrdering) => void;
  /** The control that opens the menu — a real button element. */
  trigger: ReactElement;
  value: SubtaskOrdering;
}

// Option labels reuse the task list's ordering vocabulary — the same words
// for the same orderings, already translated.
const ORDERING_LABEL_KEYS = {
  manual: 'taskList.orderBy.manual',
  priority: 'taskList.orderBy.priority',
  status: 'taskList.orderBy.status',
  updatedAt: 'taskList.orderBy.updatedAt',
} as const satisfies Record<SubtaskOrdering, string>;

/**
 * The ordering half of Linear's Sub-issues display-options popover: one radio
 * group listing every ordering `sortSubtasks` supports, selected on click.
 */
const SubtaskOrderingMenu = memo<SubtaskOrderingMenuProps>(
  ({ align = 'start', onValueChange, trigger, value }) => {
    const { t } = useTranslation('chat');

    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent align={align}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('taskList.form.ordering')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={value}
              onValueChange={(next) => onValueChange(next as SubtaskOrdering)}
            >
              {SUBTASK_ORDERINGS.map((ordering) => (
                // A pick applies and dismisses, like Linear's ordering select —
                // Base UI radio items stay open by default.
                <DropdownMenuRadioItem closeOnClick key={ordering} value={ordering}>
                  {t(ORDERING_LABEL_KEYS[ordering])}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);
SubtaskOrderingMenu.displayName = 'SubtaskOrderingMenu';

export default SubtaskOrderingMenu;
