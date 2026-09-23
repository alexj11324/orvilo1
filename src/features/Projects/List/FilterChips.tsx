'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Tooltip } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type ProjectListFilter, projectListFilterKey } from './listFilters';

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

const PRIORITY_LABEL_KEY: Record<number, string> = {
  0: 'create.priority.noPriority',
  1: 'create.priority.urgent',
  2: 'create.priority.high',
  3: 'create.priority.normal',
  4: 'create.priority.low',
};

export interface ProjectListFilterChipsProps {
  filters: readonly ProjectListFilter[];
  memberName: (userId: string) => string;
  onClearAll: () => void;
  onRemove: (key: string) => void;
  projectName: (id: string) => string;
}

/**
 * Applied-filter chips on the projects toolbar — one chip per filter clause
 * ("Status: Active / Paused"), each with a remove affordance. Mirrors the
 * reference's chip row under the filter menu; values resolve through the
 * same i18n/member tables the pickers use so a chip never shows raw ids.
 */
const ProjectListFilterChips = memo<ProjectListFilterChipsProps>(
  ({ filters, memberName, onClearAll, onRemove, projectName }) => {
    const { t } = useTranslation('project');

    if (filters.length === 0) return null;

    const chipLabel = (filter: ProjectListFilter): { label: string; value: string } => {
      switch (filter.type) {
        case 'status': {
          return {
            label: t('list.filter.group.status'),
            value: filter.values.map((value) => t(`status.${value}`)).join(' / '),
          };
        }
        case 'priority': {
          return {
            label: t('list.filter.group.priority'),
            value: filter.values
              .map((value) => t(PRIORITY_LABEL_KEY[value] ?? 'create.priority.noPriority'))
              .join(' / '),
          };
        }
        case 'lead': {
          return {
            label: t('list.filter.group.lead'),
            value: filter.values
              .map((value) => (value === null ? t('properties.noLead') : memberName(value)))
              .join(' / '),
          };
        }
        case 'creator': {
          return {
            label: t('list.filter.group.creator'),
            value: filter.values
              .map((value) => (value === null ? t('list.filter.noCreator') : memberName(value)))
              .join(' / '),
          };
        }
        case 'health': {
          return {
            label: t('list.filter.group.health'),
            value: filter.values
              .map((value) =>
                value === null ? t('list.health.noUpdates') : t(`list.health.${value}`),
              )
              .join(' / '),
          };
        }
        case 'date': {
          return {
            label: t(`list.filter.dateField.${filter.field}`),
            value: t(`list.filter.window.${filter.window}`),
          };
        }
        case 'text': {
          return { label: t('list.filter.group.text'), value: filter.query };
        }
        case 'projects': {
          return {
            label: t('list.filter.group.projects'),
            value: filter.ids.map((id) => projectName(id)).join(' / '),
          };
        }
      }
    };

    return (
      <Flexbox horizontal align="center" gap={6} style={{ flex: 'none', minWidth: 0 }}>
        {filters.map((filter) => {
          const key = projectListFilterKey(filter);
          const { label, value } = chipLabel(filter);
          return (
            <span className={styles.chip} key={key}>
              <span>
                <span style={{ color: cssVar.colorTextTertiary }}>{label}:</span> {value}
              </span>
              <Tooltip title={t('list.filter.removeChip')}>
                <button
                  aria-label={`${t('list.filter.removeChip')}: ${label}`}
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
            {t('list.filter.clearAll')}
          </Button>
        ) : null}
      </Flexbox>
    );
  },
);

ProjectListFilterChips.displayName = 'ProjectListFilterChips';

export default ProjectListFilterChips;
