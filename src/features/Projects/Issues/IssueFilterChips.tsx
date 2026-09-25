'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Tooltip } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import type { ParseKeys } from 'i18next';
import { XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProjectIssueFilter } from './issueFilters';
import { projectIssueFilterKey } from './issueFilters';

const styles = createStaticStyles(({ css }) => ({
  chip: css`
    display: inline-flex;
    flex: none;
    gap: 4px;
    align-items: center;

    padding-block: 3px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 999px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;

    background: ${cssVar.colorFillTertiary};
  `,
  chipRemove: css`
    cursor: pointer;

    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 14px;
    height: 14px;
    padding: 0;
    border: 0;
    border-radius: 50%;

    color: ${cssVar.colorTextTertiary};

    background: transparent;

    &:hover,
    &:focus-visible {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
}));

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
      <Flexbox
        horizontal
        align="center"
        gap={6}
        style={{ flex: 'none', flexWrap: 'wrap', minWidth: 0, rowGap: 6 }}
      >
        {filters.map((filter) => {
          const key = projectIssueFilterKey(filter);
          const { label, value } = chipLabel(filter);
          return (
            <span className={styles.chip} key={key}>
              <span>
                <span style={{ color: cssVar.colorTextTertiary }}>{label}:</span> {value}
              </span>
              <Tooltip title={t('taskList.filter.removeChip')}>
                <button
                  aria-label={`${t('taskList.filter.removeChip')}: ${label}`}
                  className={styles.chipRemove}
                  type="button"
                  onClick={() => onRemove(key)}
                >
                  <Icon icon={XIcon} size={10} />
                </button>
              </Tooltip>
            </span>
          );
        })}
        {filters.length > 1 ? (
          <Button size="small" type="text" onClick={onClearAll}>
            {t('taskList.filter.clearAll')}
          </Button>
        ) : null}
      </Flexbox>
    );
  },
);

IssueFilterChips.displayName = 'IssueFilterChips';

export default IssueFilterChips;
