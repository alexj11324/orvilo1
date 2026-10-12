import { ListPlusIcon, PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useIssueDetailActions } from './useIssueDetailActions';

interface AddSubIssueMenuProps {
  align?: 'end' | 'start';
  /** Open the inline composer that creates a brand-new sub-issue. */
  onCreateNew: () => void;
  /** The control that opens the menu — a real button element. */
  trigger: ReactElement;
}

/**
 * The two ways an Issue gains a sub-issue, offered wherever sub-issues are
 * added: write a new one, or put Issues that already exist under this one.
 */
const AddSubIssueMenu = ({ align = 'start', onCreateNew, trigger }: AddSubIssueMenuProps) => {
  const { t } = useTranslation('chat');
  const { addExistingSubIssues, canAddExistingSubIssues } = useIssueDetailActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align}>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onCreateNew}>
            <PlusIcon />
            {t('taskDetail.subIssue.createNew')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canAddExistingSubIssues} onClick={addExistingSubIssues}>
            <ListPlusIcon />
            {t('taskDetail.subIssue.addExisting')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AddSubIssueMenu;
