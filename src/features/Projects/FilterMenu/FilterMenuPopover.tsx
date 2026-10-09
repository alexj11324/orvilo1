'use client';
import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete';
import { cn } from 'cn';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  FilterIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useState } from 'react';

import { Autocomplete, AutocompleteInput, AutocompleteItem } from '@/components/reui/autocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { FilterMenuGroup, FilterMenuPicker } from './model';
import { buildMenuEntries, filterOptions } from './model';

export interface FilterMenuLabels {
  add: string;
  advanced: string;
  ai: string;
  aiHint: string;
  aiNoMatch: string;
  aiPlaceholder: string;
  back: string;
  noMenuMatches: string;
  searchPlaceholder: string;
  unavailable: string;
}

export interface FilterMenuPopoverProps {
  /** Any filter applied — paints the trigger's pressed state. */
  active: boolean;
  groups: readonly FilterMenuGroup[];
  labels: FilterMenuLabels;
  /** Fires the "Advanced filter" entry — the host opens the saved-view builder. */
  onOpenAdvanced: () => void;
  /** Mirrors the open state so hosts can fetch rosters lazily. */
  onOpenChange?: (open: boolean) => void;
  /** Applies the AI text; returns false when nothing could be parsed. */
  onSubmitAi: (text: string) => boolean;
}

type PaneView =
  | { kind: 'ai' }
  | { field: string; group: string; kind: 'dateField' }
  | { group: string; kind: 'group' }
  | { kind: 'menu' };

interface ListRow {
  checked?: boolean;
  disabledHint?: string;
  icon?: ReactNode;
  key: string;
  label: string;
  onSelect: () => void;
  trailing?: ReactNode;
}

const MENU_ICON = 'size-3.5 text-muted-foreground';

const Row = ({ row }: { row: ListRow }) => {
  const item = (
    <AutocompleteItem
      className="min-h-7.5 gap-2 data-checked:bg-selected data-disabled:opacity-40"
      data-checked={row.checked ? '' : undefined}
      disabled={Boolean(row.disabledHint)}
      value={row.key}
      onClick={row.onSelect}
    >
      {row.checked === undefined ? null : (
        <span className="flex w-4 flex-none items-center justify-center text-primary">
          {row.checked ? <CheckIcon aria-hidden className="size-3.5" /> : null}
        </span>
      )}
      {row.icon}
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
      {row.trailing}
    </AutocompleteItem>
  );
  if (!row.disabledHint) return item;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex" />}>{item}</TooltipTrigger>
      <TooltipContent>{row.disabledHint}</TooltipContent>
    </Tooltip>
  );
};

interface ListPaneProps {
  emptyMessage?: string;
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  rows: readonly ListRow[];
  searchLabel: string;
  /** Visible search box; otherwise it stays screen-reader only but still drives the arrow keys. */
  searchPlaceholder?: string;
  statusMessage?: string;
}

/**
 * Inline Base UI autocomplete: the input owns focus so ↑/↓ move the highlight
 * (`bg-accent`) and Enter fires the row, exactly like a command palette.
 */
const ListPane = ({
  emptyMessage,
  keyword,
  onKeywordChange,
  rows,
  searchLabel,
  searchPlaceholder,
  statusMessage,
}: ListPaneProps) => (
  <Autocomplete inline open mode="none" value={keyword} onValueChange={onKeywordChange}>
    <AutocompleteInput
      autoFocus
      aria-label={searchLabel}
      className={searchPlaceholder ? undefined : 'sr-only'}
      placeholder={searchPlaceholder}
    />
    <AutocompletePrimitive.List
      className="mt-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto overscroll-contain"
      data-slot="autocomplete-list"
    >
      {rows.map((row) => (
        <Row key={row.key} row={row} />
      ))}
      {statusMessage ? (
        <span className="px-2 py-1 text-xs text-muted-foreground">{statusMessage}</span>
      ) : null}
      {!statusMessage && emptyMessage ? (
        <span className="px-2 py-1 text-xs text-muted-foreground">{emptyMessage}</span>
      ) : null}
    </AutocompletePrimitive.List>
  </Autocomplete>
);

const PaneHeader = ({
  backLabel,
  onBack,
  title,
}: {
  backLabel: string;
  onBack: () => void;
  title?: string;
}) => (
  <>
    <Button className="self-start" size="xs" type="button" variant="ghost" onClick={onBack}>
      <ArrowLeftIcon aria-hidden />
      {backLabel}
    </Button>
    {title ? (
      <span className="px-2 py-0.5 text-xs font-medium text-foreground">{title}</span>
    ) : null}
  </>
);

/**
 * The shared "Add filter" menu behind the project issue list and the project
 * list: a searchable property directory (`AI filter` / `Advanced filter` on
 * top), per-group value pickers that apply live, and a date-field drill-down.
 * Callers only describe their groups; navigation, search and keyboard
 * handling live here.
 */
const FilterMenuPopover = memo<FilterMenuPopoverProps>(
  ({ active, groups, labels, onOpenAdvanced, onOpenChange, onSubmitAi }) => {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<PaneView>({ kind: 'menu' });
    const [keyword, setKeyword] = useState('');
    const [aiText, setAiText] = useState('');
    const [aiError, setAiError] = useState(false);
    const [textDraft, setTextDraft] = useState('');

    const goTo = (next: PaneView) => {
      setKeyword('');
      setView(next);
    };
    const toMenu = () => goTo({ kind: 'menu' });

    const handleOpenChange = (nextOpen: boolean) => {
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        toMenu();
        setAiText('');
        setAiError(false);
      }
    };

    const close = () => handleOpenChange(false);

    const submitAi = () => {
      if (onSubmitAi(aiText)) close();
      else setAiError(true);
    };

    const openGroup = (group: FilterMenuGroup) => {
      const picker = group.getPicker();
      if (picker.kind === 'text') setTextDraft(picker.initialValue);
      goTo({ group: group.id, kind: 'group' });
    };

    const renderOptions = (picker: Extract<FilterMenuPicker, { kind: 'options' }>) => {
      const visible = filterOptions(picker.options, keyword);
      const pinned = visible.filter((option) => option.pinned);
      const rest = picker.statusMessage ? [] : visible.filter((option) => !option.pinned);
      const rows: ListRow[] = [...pinned, ...rest].map((option) => ({
        checked: option.checked,
        icon: option.icon,
        key: option.key,
        label: option.label,
        onSelect: option.onToggle,
      }));
      return (
        <ListPane
          emptyMessage={rest.length === 0 ? picker.emptyMessage : undefined}
          keyword={keyword}
          rows={rows}
          searchLabel={picker.searchPlaceholder ?? labels.searchPlaceholder}
          searchPlaceholder={picker.searchPlaceholder}
          statusMessage={picker.statusMessage}
          onKeywordChange={setKeyword}
        />
      );
    };

    const renderGroup = (group: FilterMenuGroup, current: PaneView) => {
      const picker = group.getPicker();
      const back = (
        <PaneHeader
          backLabel={labels.back}
          title={group.label}
          onBack={
            current.kind === 'dateField' ? () => goTo({ group: group.id, kind: 'group' }) : toMenu
          }
        />
      );
      if (picker.kind === 'text') {
        const apply = () => {
          picker.onApply(textDraft);
          close();
        };
        return (
          <>
            {back}
            <Input
              autoFocus
              aria-label={picker.placeholder}
              placeholder={picker.placeholder}
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') apply();
              }}
            />
            <Button
              className="self-end"
              disabled={!textDraft.trim()}
              size="sm"
              type="button"
              onClick={apply}
            >
              {picker.applyLabel}
            </Button>
          </>
        );
      }
      if (picker.kind === 'dates') {
        if (current.kind === 'dateField') {
          const field = picker.fields.find((item) => item.key === current.field);
          if (!field) return null;
          return (
            <>
              <PaneHeader
                backLabel={labels.back}
                title={field.label}
                onBack={() => goTo({ group: group.id, kind: 'group' })}
              />
              <ListPane
                keyword={keyword}
                searchLabel={field.label}
                rows={field.windows.map((window) => ({
                  checked: window.checked,
                  key: window.key,
                  label: window.label,
                  onSelect: () => {
                    window.onSelect();
                    toMenu();
                  },
                }))}
                onKeywordChange={setKeyword}
              />
            </>
          );
        }
        return (
          <>
            {back}
            <ListPane
              keyword={keyword}
              searchLabel={group.label}
              rows={picker.fields.map((field) => ({
                key: field.key,
                label: field.label,
                onSelect: () => goTo({ field: field.key, group: group.id, kind: 'dateField' }),
                trailing: (
                  <>
                    {field.activeLabel ? (
                      <span className="text-xs text-muted-foreground">{field.activeLabel}</span>
                    ) : null}
                    <ChevronRightIcon aria-hidden className="size-3.5 text-muted-foreground" />
                  </>
                ),
              }))}
              onKeywordChange={setKeyword}
            />
          </>
        );
      }
      return (
        <>
          {back}
          {renderOptions(picker)}
        </>
      );
    };

    const renderPane = () => {
      if (view.kind === 'ai') {
        return (
          <>
            <PaneHeader
              backLabel={labels.back}
              onBack={() => {
                toMenu();
                setAiError(false);
              }}
            />
            <Input
              autoFocus
              aria-invalid={aiError || undefined}
              aria-label={labels.aiPlaceholder}
              placeholder={labels.aiPlaceholder}
              value={aiText}
              onChange={(event) => {
                setAiText(event.target.value);
                setAiError(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitAi();
              }}
            />
            <span className="text-xs text-muted-foreground">
              {aiError ? labels.aiNoMatch : labels.aiHint}
            </span>
          </>
        );
      }
      if (view.kind === 'group' || view.kind === 'dateField') {
        const group = groups.find((item) => item.id === view.group);
        return group ? renderGroup(group, view) : null;
      }

      const entries = buildMenuEntries({
        groups,
        keyword,
        topEntries: [
          { icon: SparklesIcon, key: 'ai', label: labels.ai },
          { icon: SlidersHorizontalIcon, key: 'advanced', label: labels.advanced },
        ],
      });
      return (
        <ListPane
          emptyMessage={entries.length === 0 ? labels.noMenuMatches : undefined}
          keyword={keyword}
          searchLabel={labels.searchPlaceholder}
          searchPlaceholder={labels.searchPlaceholder}
          rows={entries.map((entry): ListRow => {
            if ('group' in entry) {
              const { group } = entry;
              const Icon = group.icon;
              return {
                disabledHint: group.supported ? undefined : labels.unavailable,
                icon: <Icon aria-hidden className={MENU_ICON} />,
                key: entry.key,
                label: group.label,
                onSelect: () => openGroup(group),
                trailing: group.supported ? (
                  <ChevronRightIcon aria-hidden className={MENU_ICON} />
                ) : undefined,
              };
            }
            const Icon = entry.icon;
            return {
              icon: <Icon aria-hidden className={MENU_ICON} />,
              key: entry.key,
              label: entry.label,
              onSelect: () => {
                if (entry.key === 'ai') {
                  goTo({ kind: 'ai' });
                } else {
                  close();
                  onOpenAdvanced();
                }
              },
            };
          })}
          onKeywordChange={setKeyword}
        />
      );
    };

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              aria-label={labels.add}
              aria-pressed={active}
              className={cn(active && 'bg-selected')}
              size="icon-sm"
              title={labels.add}
              variant="ghost"
            >
              <FilterIcon aria-hidden size={16} />
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className={cn('gap-1 p-1.5', view.kind === 'ai' ? 'w-70 p-2.5' : 'w-65')}
          side="bottom"
        >
          {renderPane()}
        </PopoverContent>
      </Popover>
    );
  },
);

FilterMenuPopover.displayName = 'FilterMenuPopover';

export default FilterMenuPopover;
