'use client';

import { isDesktop } from '@orvilo/const';
import { RENDERER_HANDLED_LINK_ATTR } from '@orvilo/desktop-bridge';
import type { MouseEvent } from 'react';
import { memo, useCallback } from 'react';

import FileIcon from '@/components/FileIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import referenceStyles from '../ReferenceRender.module.css';
import type { MarkdownElementProps } from '../type';
import type { ParsedLocalFileHref } from './parse';
import { parseLocalFileHref } from './parse';

interface LocalFileLinkProperties {
  linkHref?: string;
  linkLabel?: string;
}

const styles = {
  reference: 'inline-flex gap-1 items-center align-[-0.16em]',
  icon: 'inline-flex shrink-0 items-center',
};

const getFileName = (filePath: string) => filePath.split(/[\\/]/).at(-1) || filePath;

const formatLocalFileTitle = ({ column, filePath, line }: ParsedLocalFileHref) => {
  if (!line) return filePath;

  return column ? `${filePath} (line ${line}, column ${column})` : `${filePath} (line ${line})`;
};

const Render = memo<MarkdownElementProps<LocalFileLinkProperties>>(({ node }) => {
  const { linkHref, linkLabel } = node?.properties || {};
  const openLocalFile = useChatStore((s) => s.openLocalFile);
  const workingDirectory = useChatStore(topicSelectors.currentTopicWorkingDirectory);
  const parsed = parseLocalFileHref(linkHref, { workingDirectory });
  const canPreview = isDesktop && !!parsed?.workingDirectory;
  const allowExternalFilePreview =
    !!parsed && (!workingDirectory || parsed.workingDirectory !== workingDirectory);
  const label = linkLabel || parsed?.filePath || linkHref || '';
  const iconFileName = parsed ? getFileName(parsed.filePath) : label;
  const title = parsed ? formatLocalFileTitle(parsed) : linkHref;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!parsed || !canPreview) return;
      if (event.button !== 0) return;

      event.preventDefault();
      openLocalFile({
        allowExternalFilePreview,
        filePath: parsed.filePath,
        workingDirectory: parsed.workingDirectory,
      });
    },
    [allowExternalFilePreview, canPreview, openLocalFile, parsed],
  );

  if (!canPreview) {
    return (
      <TooltipProvider delay={100}>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex">
                <span className={styles.reference} data-file-path={parsed?.filePath}>
                  <span aria-hidden className={styles.icon}>
                    <FileIcon fileName={iconFileName} size={16} variant={'raw'} />
                  </span>
                  <span>{label}</span>
                </span>
              </span>
            }
          />
          <TooltipContent align="start" side="top">
            {title}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <a
                {...(parsed ? { [RENDERER_HANDLED_LINK_ATTR]: 'true' } : {})}
                className={referenceStyles.localFileLink}
                data-slot="markdown-local-file-link"
                href={linkHref}
                onClick={handleClick}
              >
                <span aria-hidden className={styles.icon}>
                  <FileIcon fileName={iconFileName} size={16} variant={'raw'} />
                </span>
                <span>{label}</span>
              </a>
            </span>
          }
        />
        <TooltipContent align="start" side="top">
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

Render.displayName = 'LocalFileLinkRender';

export default Render;
