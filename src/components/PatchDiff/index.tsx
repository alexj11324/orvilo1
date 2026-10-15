'use client';

import type { FileDiffOptions } from '@pierre/diffs';
import { PatchDiff as PierrePatchDiff } from '@pierre/diffs/react';
import { cn } from 'cn';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  type ComponentProps,
  type CSSProperties,
  memo,
  type ReactNode,
  useMemo,
  useState,
} from 'react';

import MaterialFileTypeIcon from '@/components/MaterialFileTypeIcon';
import { Button } from '@/components/ui/button';
import { useResolvedDocumentTheme } from '@/styles/resolvedThemeRoles';

import { countPatchChanges, patchDiffOptions, patchDisplayName } from './model';
import { nativeDiffCSS, registerNativeDiffTheme } from './theme';

registerNativeDiffTheme();

export interface PatchDiffProps extends Omit<ComponentProps<'div'>, 'children'> {
  actionsRender?: (props: { originalNode: ReactNode; patch: string }) => ReactNode;
  classNames?: { body?: string; header?: string };
  defaultExpand?: boolean;
  diffOptions?: FileDiffOptions<string>;
  fileName?: string;
  fullFeatured?: boolean;
  language?: string;
  patch: string;
  showHeader?: boolean;
  styles?: { body?: CSSProperties; header?: CSSProperties };
  variant?: 'filled' | 'outlined' | 'borderless';
  viewMode?: 'split' | 'unified';
}

/** Local chrome only. The real Pierre engine retains parsing, highlighting,
 * selections and any inherited worker/virtualizer; this owner creates neither. */
export const PatchDiff = memo(function PatchDiff({
  patch,
  language,
  fileName,
  viewMode = 'split',
  showHeader = true,
  defaultExpand = true,
  fullFeatured = true,
  variant = 'filled',
  className,
  classNames,
  styles,
  actionsRender,
  diffOptions,
  style,
  ...props
}: PatchDiffProps) {
  const theme = useResolvedDocumentTheme();
  const [expanded, setExpanded] = useState(defaultExpand);
  const displayName = useMemo(
    () => patchDisplayName(patch, fileName, language),
    [patch, fileName, language],
  );
  const { additions, deletions } = useMemo(() => countPatchChanges(patch), [patch]);
  const actions = useMemo(
    () => actionsRender?.({ originalNode: null, patch }),
    [actionsRender, patch],
  );
  const options = useMemo(
    () => patchDiffOptions(theme.isDarkMode, viewMode, nativeDiffCSS, diffOptions),
    [theme.isDarkMode, viewMode, diffOptions],
  );
  const themeStyles: CSSProperties & Record<`--orvilo-diff-${string}`, string> = {
    '--orvilo-diff-added-light': theme.colorSuccessHover,
    '--orvilo-diff-added-dark': theme.colorSuccessBorderHover,
    '--orvilo-diff-modified-light': theme.colorInfoHover,
    '--orvilo-diff-modified-dark': theme.colorInfoBorderHover,
    '--orvilo-diff-deleted-light': theme.colorErrorHover,
    '--orvilo-diff-deleted-dark': theme.colorErrorBorderHover,
  };
  const toggle = () => setExpanded((value) => !value);
  return (
    <div
      {...props}
      data-code-type="patch-diff"
      style={{ ...themeStyles, ...style }}
      className={cn(
        'group/diff relative flex min-w-0 flex-col overflow-hidden text-foreground orvilo-motion-scope',
        variant !== 'borderless' && 'rounded-(--radius-card)',
        variant === 'filled' && 'bg-fill-quaternary',
        variant === 'outlined' && 'border border-divider',
        className,
      )}
    >
      {fullFeatured && showHeader && (
        <div
          style={styles?.header}
          className={cn(
            'flex min-w-0 items-center justify-between gap-2 p-1 text-muted-foreground',
            variant === 'outlined' && 'border-b border-divider',
            classNames?.header,
          )}
        >
          <Button
            aria-expanded={expanded}
            className="min-w-0 flex-1 justify-start font-normal"
            size="compact"
            type="button"
            variant="ghost"
            onClick={toggle}
          >
            <MaterialFileTypeIcon
              fallbackUnknownType={false}
              filename={fileName || displayName}
              size={18}
              type="file"
              variant="raw"
            />
            <span className="truncate text-sm">{displayName}</span>
            {expanded ? (
              <ChevronDown className="ml-auto" size={16} />
            ) : (
              <ChevronRight className="ml-auto" size={16} />
            )}
          </Button>
          <div
            className="flex shrink-0 items-center gap-2 text-xs"
            onClick={(event) => event.stopPropagation()}
          >
            {actions && (
              <div className="flex gap-1 opacity-0 transition-opacity duration-(--orvilo-motion-mid) group-hover/diff:opacity-100 group-focus-within/diff:opacity-100 motion-reduce:transition-none">
                {actions}
              </div>
            )}
            {deletions > 0 && <span className="font-mono text-destructive-text">−{deletions}</span>}
            {additions > 0 && <span className="font-mono text-success-text">+{additions}</span>}
          </div>
        </div>
      )}
      {!fullFeatured && (
        <>
          <div className="absolute end-2 top-2 z-10 flex gap-1 opacity-0 group-hover/diff:opacity-100 group-focus-within/diff:opacity-100">
            {actions}
          </div>
          {showHeader && (
            <span className="pointer-events-none absolute bottom-2 end-2 z-10 rounded-(--radius-chip) border border-divider bg-popover px-2 py-1 font-mono text-xs text-muted-foreground opacity-0 group-hover/diff:opacity-100 group-focus-within/diff:opacity-100">
              {displayName}
            </span>
          )}
        </>
      )}
      <div
        aria-hidden={fullFeatured && !expanded ? true : undefined}
        inert={fullFeatured && !expanded ? true : undefined}
        style={styles?.body}
        className={cn(
          'min-w-0 w-full overflow-auto font-mono text-sm',
          fullFeatured && !expanded && 'h-0 overflow-hidden opacity-0',
          classNames?.body,
        )}
      >
        <PierrePatchDiff options={options} patch={patch} />
      </div>
    </div>
  );
});

export default PatchDiff;
