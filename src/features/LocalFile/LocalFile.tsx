import { cn } from 'cn';
import { ExternalLink, EyeIcon, FolderOpen } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useLocalFileActions } from './useLocalFileActions';

const styles = {
  container:
    'cursor-pointer py-0.5 ps-1 pe-2 rounded-(--radius-chip) text-foreground [&:hover]:text-foreground [&:hover]:bg-accent focus-visible:[outline:2px_solid_var(--ant-color-primary-border)] focus-visible:outline-offset-1',
  segment:
    "cursor-pointer relative inline-flex gap-1.5 items-center py-1.25 px-2.75 border-0 border-none [font-family:inherit] text-(length:--text-dense) leading-5 text-muted-foreground whitespace-nowrap [background:transparent] [&+&::before]:content-[''] [&+&::before]:absolute [&+&::before]:[inset-block:5px] [&+&::before]:[inset-inline-start:0] [&+&::before]:w-px [&+&::before]:[background:var(--ant-color-border-secondary)] [&:hover]:text-foreground [&:hover]:bg-accent [&:hover::before]:[background:transparent] [&:hover+&::before]:bg-transparent focus-visible:rounded-[6px] focus-visible:[outline:2px_solid_var(--ant-color-primary-border)] focus-visible:-outline-offset-2",
  segmented: 'overflow-hidden inline-flex items-stretch rounded-(--ant-border-radius-lg)',
  title: 'overflow-hidden block leading-5 text-inherit text-ellipsis whitespace-nowrap',
};

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
      className={cn('flex flex-row items-center gap-1', styles.container)}
      role={handleClick ? 'button' : undefined}
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      tabIndex={handleClick ? 0 : undefined}
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
