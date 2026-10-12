import { cn } from 'cn';
import { ExternalLink, EyeIcon, FolderOpen } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useLocalFileActions } from './useLocalFileActions';

const styles = {
  container:
    'cursor-pointer py-0.5 ps-1 pe-2 rounded-(--radius-chip) text-foreground [&:hover]:text-foreground [&:hover]:bg-accent focus-visible:[outline:2px_solid_var(--ant-color-primary-border)] focus-visible:outline-offset-1',
  segment:
    "cursor-pointer relative inline-flex gap-1.5 items-center py-1 px-3 border-0 border-none [font-family:inherit] text-sm leading-5.5 text-muted-foreground whitespace-nowrap bg-transparent [&+&::before]:content-[''] [&+&::before]:absolute [&+&::before]:inset-y-1.5 [&+&::before]:start-0 [&+&::before]:w-px [&+&::before]:bg-divider [&:hover]:text-foreground [&:hover]:bg-accent [&:hover::before]:bg-transparent [&:hover+&::before]:bg-transparent focus-visible:rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-(color:--primary-border) focus-visible:-outline-offset-2 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
  segmented: 'overflow-hidden inline-flex items-stretch rounded-(--radius-overlay)',
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
      role={handleClick ? 'button' : undefined}
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      tabIndex={handleClick ? 0 : undefined}
      className={cn(
        'flex flex-row items-center gap-1',
        styles.container,
        handleClick && 'min-h-8 [@media(pointer:coarse)]:min-h-11',
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
      <div className="flex w-full flex-row items-baseline gap-1 overflow-hidden">
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
        <Button
          className={styles.segment}
          size="compact"
          type={'button'}
          variant="ghost"
          onClick={handlePreview}
        >
          <EyeIcon size={16} />
          {t('LocalFile.action.preview')}
        </Button>
      )}
      <Button
        className={styles.segment}
        size="compact"
        type={'button'}
        variant="ghost"
        onClick={handleOpenFile}
      >
        <ExternalLink size={16} />
        {t('LocalFile.action.open')}
      </Button>
      <Button
        className={styles.segment}
        size="compact"
        type={'button'}
        variant="ghost"
        onClick={handleOpenFolder}
      >
        <FolderOpen size={16} />
        {t('LocalFile.action.showInFolder')}
      </Button>
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
