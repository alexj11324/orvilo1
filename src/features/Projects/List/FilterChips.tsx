'use client';
import type { ParseKeys } from 'i18next';
import { XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { type ProjectListFilter, projectListFilterKey } from './listFilters';

const styles = {
  chip: 'inline-flex flex-none items-center gap-1 rounded-(--radius-chip) border border-border bg-accent px-2.5 py-0.75 text-xs leading-5 text-muted-foreground whitespace-nowrap',
  chipRemove:
    'inline-flex size-7 flex-none cursor-pointer items-center justify-center rounded-(--radius-input) border-0 bg-transparent p-0 text-foreground-tertiary hover:bg-selected hover:text-foreground focus-visible:bg-selected focus-visible:text-foreground',
};

const PRIORITY_LABEL_KEY: Record<number, ParseKeys<'project'>> = {
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
      <div className="flex flex-row items-center gap-1.5 flex-none min-w-0">
        {filters.map((filter) => {
          const key = projectListFilterKey(filter);
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
                      aria-label={`${t('list.filter.removeChip')}: ${label}`}
                      className={styles.chipRemove}
                      type="button"
                      onClick={() => onRemove(key)}
                    >
                      <XIcon size={10} />
                    </button>
                  }
                />
                <TooltipContent>{t('list.filter.removeChip')}</TooltipContent>
              </Tooltip>
            </span>
          );
        })}
        {filters.length > 1 ? (
          <Button size="compact" variant="ghost" onClick={onClearAll}>
            {t('list.filter.clearAll')}
          </Button>
        ) : null}
      </div>
    );
  },
);

ProjectListFilterChips.displayName = 'ProjectListFilterChips';

export default ProjectListFilterChips;
