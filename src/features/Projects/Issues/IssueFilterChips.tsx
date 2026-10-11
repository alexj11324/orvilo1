'use client';
import type { ParseKeys } from 'i18next';
import { XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { ProjectIssueFilter } from './issueFilters';
import { projectIssueFilterKey } from './issueFilters';

const styles = {
  chip: 'inline-flex flex-none items-center gap-1 rounded-(--radius-chip) border border-border bg-accent px-2.5 py-0.75 text-xs leading-5 text-muted-foreground whitespace-nowrap',
  chipRemove:
    'inline-flex size-7 flex-none cursor-pointer items-center justify-center rounded-(--radius-input) border-0 bg-transparent p-0 text-foreground-tertiary hover:bg-selected hover:text-foreground focus-visible:bg-selected focus-visible:text-foreground',
};

const PRIORITY_LABEL_KEY: Record<number, ParseKeys<'chat'>> = {
  0: 'taskDetail.priority.none',
  1: 'taskDetail.priority.urgent',
  2: 'taskDetail.priority.high',
  3: 'taskDetail.priority.normal',
  4: 'taskDetail.priority.low',
};

export interface IssueFilterChipsProps {
  /** Resolves an agent id for the agent chip — falls back to the raw id. */
  agentName: (id: string) => string;
  filters: readonly ProjectIssueFilter[];
  /** Resolves a label id for the labels chip — falls back to the raw id. */
  labelName: (id: string) => string;
  /** Resolves a member id for the people chips — falls back to the raw id. */
  memberName: (userId: string) => string;
  onClearAll: () => void;
  onRemove: (key: string) => void;
}

/**
 * Applied-filter chips on the project issues surface — one chip per filter
 * clause ("Status: Backlog / In progress"), each with a remove affordance.
 * Mirrors the reference's chip row under the filter menu; values resolve
 * through the same i18n/member/agent/label tables the pickers use so a chip
 * never shows raw ids.
 */
const IssueFilterChips = memo<IssueFilterChipsProps>(
  ({ agentName, filters, labelName, memberName, onClearAll, onRemove }) => {
    const { t } = useTranslation('chat');
    const { t: tCommon } = useTranslation('common');

    if (filters.length === 0) return null;

    const chipLabel = (filter: ProjectIssueFilter): { label: string; value: string } => {
      switch (filter.type) {
        case 'status': {
          return {
            label: t('taskList.filter.groups.status'),
            value: filter.values.map((value) => t(`taskDetail.status.${value}`)).join(' / '),
          };
        }
        case 'priority': {
          return {
            label: t('taskList.filter.groups.priority'),
            value: filter.values
              .map((value) => t(PRIORITY_LABEL_KEY[value] ?? 'taskDetail.priority.none'))
              .join(' / '),
          };
        }
        case 'assignee': {
          return {
            label: t('taskList.filter.groups.assignee'),
            value: filter.values
              .map((value) =>
                value === null ? t('taskList.filter.noAssignee') : memberName(value),
              )
              .join(' / '),
          };
        }
        case 'agent': {
          return {
            label: t('taskList.filter.groups.agent'),
            value: filter.values
              .map((value) => (value === null ? t('taskList.filter.noAgent') : agentName(value)))
              .join(' / '),
          };
        }
        case 'creator': {
          return {
            label: t('taskList.filter.groups.creator'),
            value: filter.values
              .map((value) => (value === null ? t('taskList.filter.noCreator') : memberName(value)))
              .join(' / '),
          };
        }
        case 'labels': {
          return {
            label: t('taskList.filter.groups.labels'),
            value: filter.values
              .map((value) => (value === null ? t('taskList.filter.noLabels') : labelName(value)))
              .join(' / '),
          };
        }
        case 'triage': {
          return {
            label: t('taskList.filter.groups.triage'),
            value: filter.values
              .map((value) =>
                value === null
                  ? t('taskList.filter.notInTriage')
                  : tCommon(`savedViews.values.triageStatus.${value}`),
              )
              .join(' / '),
          };
        }
        case 'date': {
          return {
            label: t(`taskList.filter.dateFields.${filter.field}`),
            value: t(`taskList.filter.windows.${filter.window}`),
          };
        }
        case 'text': {
          return { label: t('taskList.filter.groups.text'), value: filter.query };
        }
      }
    };

    return (
      <div className="flex flex-row items-center gap-1.5 flex-none flex-wrap min-w-0 gap-y-1.5">
        {filters.map((filter) => {
          const key = projectIssueFilterKey(filter);
          const { label, value } = chipLabel(filter);
          return (
            <span className={styles.chip} key={key}>
              <span>
                <span className="text-foreground-tertiary">{label}:</span> {value}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      aria-label={`${t('taskList.filter.removeChip')}: ${label}`}
                      className={styles.chipRemove}
                      type="button"
                      onClick={() => onRemove(key)}
                    >
                      <XIcon size={10} />
                    </button>
                  }
                />
                <TooltipContent>{t('taskList.filter.removeChip')}</TooltipContent>
              </Tooltip>
            </span>
          );
        })}
        {filters.length > 1 ? (
          <Button size="compact" variant="ghost" onClick={onClearAll}>
            {t('taskList.filter.clearAll')}
          </Button>
        ) : null}
      </div>
    );
  },
);

IssueFilterChips.displayName = 'IssueFilterChips';

export default IssueFilterChips;
