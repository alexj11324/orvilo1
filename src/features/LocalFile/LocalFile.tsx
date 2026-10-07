import { createStaticStyles, cssVar, cx } from 'antd-style';
import { ExternalLink, EyeIcon, FolderOpen } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { buttonHoverFeedback } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useLocalFileActions } from './useLocalFileActions';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    cursor: pointer;

    padding-block: 2px;
    padding-inline: 4px 8px;
    border-radius: 4px;

    color: ${cssVar.colorText};

    :hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimaryBorder};
      outline-offset: 1px;
    }
  `,
  segment: css`
    cursor: pointer;

    position: relative;

    display: inline-flex;
    gap: 6px;
    align-items: center;

    padding-block: 5px;
    padding-inline: 11px;
    border: none;

    font-family: inherit;
    font-size: 13px;
    line-height: 20px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;

    background: transparent;

    & + &::before {
      content: '';

      position: absolute;
      inset-block: 5px;
      inset-inline-start: 0;

      width: 1px;

      background: ${cssVar.colorBorderSecondary};
    }

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }

    &:hover::before,
    &:hover + &::before {
      background: transparent;
    }

    &:focus-visible {
      border-radius: 6px;
      outline: 2px solid ${cssVar.colorPrimaryBorder};
      outline-offset: -2px;
    }
  `,
  segmented: css`
    overflow: hidden;
    display: inline-flex;
    align-items: stretch;
    border-radius: ${cssVar.borderRadiusLG};
  `,
  title: css`
    overflow: hidden;
    display: block;

    line-height: 20px;
    color: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

interface LocalFileProps {
  isDirectory?: boolean;
  name: string;
  path?: string;
  /**
   * When true, disable interactive actions (Open / Show in Folder).
   * Used in share pages where local file operations are not available.
   */
  readonly?: boolean;
}

export const LocalFile = ({
  name,
  path,
  isDirectory = false,
  readonly = false,
}: LocalFileProps) => {
  const { t } = useTranslation('components');
  const { canPreview, handleClick, handleOpenFile, handleOpenFolder, handlePreview } =
    useLocalFileActions({ isDirectory, path, readonly });

  const fileContent = (
    <div
      role={handleClick ? 'button' : undefined}
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      tabIndex={handleClick ? 0 : undefined}
      className={cx(
        cx('flex flex-row items-center gap-1', styles.container),
        handleClick && buttonHoverFeedback,
      )}
      onClick={handleClick}
      onKeyDown={
        handleClick
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              handleClick();
            }
          : undefined
      }
    >
      <FileIcon fileName={name} isDirectory={isDirectory} size={22} variant={'raw'} />
      <div
        className="flex flex-row items-baseline gap-1"
        style={{ overflow: 'hidden', width: '100%' }}
      >
        <div className={styles.title}>{name}</div>
      </div>
    </div>
  );

  // Directory or readonly mode (e.g. share page): no popover, just display
  if (isDirectory || readonly) {
    return fileContent;
  }

  // File: show popover with actions
  const popoverContent = (
    <div className={styles.segmented}>
      {canPreview && (
        <button className={styles.segment} type={'button'} onClick={handlePreview}>
          <EyeIcon size={15} />
          {t('LocalFile.action.preview')}
        </button>
      )}
      <button className={styles.segment} type={'button'} onClick={handleOpenFile}>
        <ExternalLink size={15} />
        {t('LocalFile.action.open')}
      </button>
      <button className={styles.segment} type={'button'} onClick={handleOpenFolder}>
        <FolderOpen size={15} />
        {t('LocalFile.action.showInFolder')}
      </button>
    </div>
  );

  return (
    <Popover
      onOpenChange={(open, eventDetails) => {
        if (open && eventDetails?.reason === 'trigger-press') eventDetails.cancel();
      }}
    >
      <PopoverTrigger openOnHover render={fileContent} />
      <PopoverContent align={'start'} className="w-auto p-0" side={'bottom'}>
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
};
