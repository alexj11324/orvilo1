import { isDesktop } from '@orvilo/const';
import { cn } from 'cn';
import type { LexicalEditor } from 'lexical';
import { $createNodeSelection, $setSelection, CLICK_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';
import { ExternalLink, EyeIcon, FolderOpen } from 'lucide-react';
import type { ComponentPropsWithRef, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClientDataSWR } from '@/libs/swr';
import { localFileKeys } from '@/libs/swr/keys';
import { localFileService } from '@/services/electron/localFileService';
import type { LocalFilePreview } from '@/services/projectFile';
import { projectFileService } from '@/services/projectFile';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import { parseLocalFileHref } from '../../../Conversation/Markdown/plugins/LocalFileLink/parse';
import { TAG_MARGIN_INLINE_END } from '../constants';
import { getFileExtension } from '../MentionMenu/localFileDisplay';

const PREVIEWABLE_IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

const styles = {
  actionBar: 'flex-wrap max-w-80',
  label: 'overflow-hidden self-baseline min-w-0 font-normal text-ellipsis whitespace-nowrap',
  path: 'max-w-90 py-2 px-2.5 rounded-(--ant-border-radius) font-mono text-[12px] leading-[1.5] text-muted-foreground break-all bg-(--ant-color-fill-quaternary)',
  popover: 'max-w-98',
  previewFrame:
    'overflow-hidden flex items-center justify-center w-[min(360px,72vw)] max-h-60 border border-selected rounded-(--ant-border-radius-lg) bg-(--ant-color-fill-quaternary)',
  previewImage: 'block max-w-full max-h-60 object-contain',
  tag: 'cursor-default select-none inline-flex gap-1.5 items-center box-border max-w-[min(240px,100%)] h-6 py-0.5 px-2 rounded-(--ant-border-radius) text-[length:inherit] leading-5 text-muted-foreground align-baseline hover:bg-selected [&.selected]:outline-2 [&.selected]:outline-solid [&.selected]:outline-info [&.selected]:outline-offset-1',
  thumbnail:
    'shrink-0 size-4 rounded-(--ant-border-radius-xs) object-cover bg-(--ant-color-fill-quaternary) shadow-[inset_0_0_0_1px_var(--selected)]',
};

export interface LocalFileTagData {
  isDirectory?: boolean;
  name: string;
  path: string;
}

export interface LocalFileTagProps {
  className?: string;
  editor?: LexicalEditor;
  file: LocalFileTagData;
  nodeKey?: string;
}

interface LocalFileTagTriggerProps extends Omit<
  ComponentPropsWithRef<'span'>,
  'children' | 'className' | 'title'
> {
  children: ReactNode;
  className?: string;
  editor?: LexicalEditor;
  nodeKey?: string;
  title?: string;
}

const isPreviewableImageFile = (file: LocalFileTagData) =>
  !file.isDirectory && PREVIEWABLE_IMAGE_EXTENSIONS.has(getFileExtension(file.name || file.path));

const stopActionPropagation = (event: ReactMouseEvent<HTMLElement>) => {
  event.preventDefault();
  event.stopPropagation();
};

const LocalFileTagTrigger = memo<LocalFileTagTriggerProps>(
  ({ children, className, editor, nodeKey, ref: forwardedRef, title, ...rest }) => {
    const spanRef = useRef<HTMLSpanElement>(null);

    const setSpanRef = useCallback(
      (element: HTMLSpanElement | null) => {
        spanRef.current = element;

        if (!forwardedRef) return;
        if (typeof forwardedRef === 'function') {
          forwardedRef(element);
          return;
        }

        const mutableRef = forwardedRef as { current: HTMLSpanElement | null };
        mutableRef.current = element;
      },
      [forwardedRef],
    );

    const onClick = useCallback(
      (payload: MouseEvent) => {
        if (!editor || !nodeKey) return false;
        if (
          payload.target !== spanRef.current &&
          !spanRef.current?.contains(payload.target as Node)
        ) {
          return false;
        }

        payload.preventDefault();
        editor.update(() => {
          const selection = $createNodeSelection();
          selection.add(nodeKey);
          $setSelection(selection);
        });
        return true;
      },
      [editor, nodeKey],
    );

    useEffect(() => {
      if (!editor || !nodeKey) return;
      return editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW);
    }, [editor, nodeKey, onClick]);

    return (
      <Badge
        {...rest}
        className={cn(styles.tag, className)}
        ref={setSpanRef}
        style={{ marginInlineEnd: TAG_MARGIN_INLINE_END }}
        title={title}
        variant="secondary"
      >
        {children}
      </Badge>
    );
  },
);

LocalFileTagTrigger.displayName = 'LocalFileTagTrigger';

export const LocalFileTag = memo<LocalFileTagProps>(({ className, editor, file, nodeKey }) => {
  const { t } = useTranslation('chat');
  const openLocalFile = useChatStore((s) => s.openLocalFile);
  const workingDirectory = useChatStore(topicSelectors.currentTopicWorkingDirectory);

  const parsed = useMemo(
    () => parseLocalFileHref(file.path, { workingDirectory }),
    [file.path, workingDirectory],
  );
  const allowExternalFilePreview =
    !!parsed && (!workingDirectory || parsed.workingDirectory !== workingDirectory);
  const canPreview = isDesktop && !file.isDirectory && !!parsed?.workingDirectory;
  const canRenderImagePreview = canPreview && isPreviewableImageFile(file);

  const { data: imagePreview } = useClientDataSWR<LocalFilePreview>(
    canRenderImagePreview && parsed
      ? localFileKeys.preview({
          accept: 'image',
          allowExternalFile: allowExternalFilePreview || undefined,
          filePath: parsed.filePath,
          workingDirectory: parsed.workingDirectory,
        })
      : null,
    () =>
      projectFileService.getLocalFilePreview({
        accept: 'image',
        allowExternalFile: allowExternalFilePreview || undefined,
        path: parsed!.filePath,
        workingDirectory: parsed!.workingDirectory,
      }),
    { revalidateOnFocus: false },
  );
  const [imageSrc, setImageSrc] = useState<string>();

  useEffect(() => {
    if (!canRenderImagePreview || imagePreview?.type !== 'image') {
      setImageSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(imagePreview.blob);
    setImageSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [canRenderImagePreview, imagePreview]);

  const handlePreview = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      stopActionPropagation(event);
      if (!parsed) return;

      openLocalFile({
        allowExternalFilePreview,
        filePath: parsed.filePath,
        workingDirectory: parsed.workingDirectory,
      });
    },
    [allowExternalFilePreview, openLocalFile, parsed],
  );

  const handleOpen = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      stopActionPropagation(event);
      void localFileService.openLocalFileOrFolder(file.path, !!file.isDirectory);
    },
    [file.isDirectory, file.path],
  );

  const handleReveal = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      stopActionPropagation(event);
      void localFileService.openFileFolder(file.path);
    },
    [file.path],
  );

  const content = (
    <div
      className={cn('flex flex-col gap-2.5', styles.popover)}
      onClick={(event) => event.stopPropagation()}
    >
      {imageSrc && (
        <div className={styles.previewFrame}>
          <img
            alt={file.name}
            className={styles.previewImage}
            data-testid="local-file-image-hover-preview"
            draggable={false}
            src={imageSrc}
          />
        </div>
      )}
      <div className={styles.path}>{file.path}</div>
      {isDesktop && (
        <div className={cn('flex flex-row gap-1.5', styles.actionBar)}>
          {canPreview && (
            <Button size={'sm'} variant="outline" onClick={handlePreview}>
              <span className="anticon" data-icon="inline-start" role="img">
                <EyeIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
              </span>
              {t('workingPanel.documents.preview')}
            </Button>
          )}
          <Button size={'sm'} variant="outline" onClick={handleOpen}>
            <span className="anticon" data-icon="inline-start" role="img">
              <ExternalLink fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
            {t('workingPanel.files.open')}
          </Button>
          <Button size={'sm'} variant="outline" onClick={handleReveal}>
            <span className="anticon" data-icon="inline-start" role="img">
              <FolderOpen fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
            {t('workingPanel.files.showInSystem')}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <LocalFileTagTrigger
            className={className}
            editor={editor}
            nodeKey={nodeKey}
            title={file.path}
          >
            {imageSrc ? (
              <img
                alt=""
                className={styles.thumbnail}
                data-testid="local-file-image-preview"
                draggable={false}
                src={imageSrc}
              />
            ) : (
              <FileIcon
                fileName={file.name}
                isDirectory={!!file.isDirectory}
                size={16}
                variant={'raw'}
              />
            )}
            <span className={styles.label}>{file.name}</span>
          </LocalFileTagTrigger>
        }
      />
      <PopoverContent side={'top'} style={{ padding: 8 }}>
        {content}
      </PopoverContent>
    </Popover>
  );
});

LocalFileTag.displayName = 'LocalFileTag';
