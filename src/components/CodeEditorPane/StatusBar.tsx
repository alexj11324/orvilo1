'use client';

import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { IndentStyle } from './indent';

const styles = {
  bar: 'h-8 shrink-0 border-t border-divider bg-card px-2.5 text-xs leading-5 text-foreground-tertiary',
  button:
    'cursor-pointer px-1.5 font-normal leading-5 whitespace-nowrap text-inherit hover:bg-accent hover:text-foreground focus-visible:ring-inset',
  item: 'px-1.5 whitespace-nowrap',
  readOnly: 'rounded-(--radius-chip) bg-accent px-1.5 text-muted-foreground',
};

export interface CursorPosition {
  column: number;
  line: number;
  /** Characters covered by the current selection; 0 when it is just a caret. */
  selectionLength: number;
}

interface StatusBarProps {
  cursor?: CursorPosition;
  indent: IndentStyle;
  languageLabel: string;
  lineWrapping: boolean;
  onLineWrappingChange: (next: boolean) => void;
  readOnly?: boolean;
}

const StatusBar = ({
  cursor,
  indent,
  languageLabel,
  lineWrapping,
  onLineWrappingChange,
  readOnly,
}: StatusBarProps) => {
  const { t } = useTranslation('components');

  return (
    <div className={cn('flex items-center justify-between', styles.bar)}>
      <div className={'flex items-center'}>
        {readOnly && <span className={styles.readOnly}>{t('CodeEditorPane.readOnly')}</span>}
      </div>
      <div className={'flex items-center'}>
        {cursor && (
          <span className={styles.item}>
            {t('CodeEditorPane.cursor', { column: cursor.column, line: cursor.line })}
            {cursor.selectionLength > 0 &&
              ` ${t('CodeEditorPane.selected', { length: cursor.selectionLength })}`}
          </span>
        )}
        <span className={styles.item}>
          {t(indent.useTabs ? 'CodeEditorPane.tabSize' : 'CodeEditorPane.spaces', {
            size: indent.size,
          })}
        </span>
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <Button
              aria-pressed={lineWrapping}
              className={styles.button}
              size="sm"
              type={'button'}
              variant="ghost"
              onClick={() => onLineWrappingChange(!lineWrapping)}
            >
              {t(lineWrapping ? 'CodeEditorPane.wrapOn' : 'CodeEditorPane.wrapOff')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('CodeEditorPane.toggleWordWrap')}</TooltipContent>
        </Tooltip>
        <span className={styles.item}>{languageLabel}</span>
      </div>
    </div>
  );
};

StatusBar.displayName = 'StatusBar';

export default StatusBar;
