'use client';

import { clsx as cx, cn } from 'cn';
import { FileImage, FileText, FileUpIcon, FolderIcon } from 'lucide-react';
import { createElement, type CSSProperties, type ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useDragUploadContext } from './DragUploadProvider';
import { type DroppedLocalPath, useLocalDragUpload } from './useLocalDragUpload';

const styles = {
  container: 'relative',
  content: 'relative z-1 box-border h-full w-full px-7 py-6',
  desc: 'text-xs leading-5',
  icon: 'h-[calc(var(--spacing)*14.4)] w-12 rounded-(--radius-card)',
  iconGroup: 'mbs-0',
  iconSoft: 'bg-primary-subtle text-primary-text',
  iconSoftLocalPath: 'bg-info-subtle text-info-text',
  iconStrong: 'border border-primary-border bg-card text-card-foreground',
  iconStrongLocalPath: 'border-info-border',
  overlay:
    'pointer-events-none absolute inset-0 z-100 flex items-center justify-center bg-overlay-mask transition-opacity duration-(--orvilo-motion-mid) ease-in-out motion-reduce:transition-none',
  overlayContent:
    "relative box-border w-[min(460px,72vw)] rounded-(--radius-overlay) bg-primary p-7 text-primary-foreground shadow-(--shadow-dialog) before:pointer-events-none before:absolute before:inset-2.5 before:rounded-(--radius-overlay) before:border-[length:calc(var(--spacing)_*_3_/_8)] before:border-dashed before:border-current before:content-['']",
  overlayContentLocalPath: 'bg-info text-info-on-fill',
  title: 'text-base font-semibold leading-6',
};

export interface DragUploadZoneProps {
  /**
   * The content to render inside the drop zone
   */
  children: ReactNode;
  /**
   * Custom class name for the container
   */
  className?: string;
  /**
   * Whether the drop zone is disabled
   */
  disabled?: boolean;
  /**
   * Whether to show file types (images + documents) or just images
   * @default true
   */
  enabledFiles?: boolean;
  /**
   * Whether dropping local files/folders should insert their filesystem paths
   * into the chat input instead of uploading them. Requires Electron (uses
   * webUtils to resolve paths). Unresolved items fall back to upload.
   */
  enableLocalPathReference?: boolean;
  /**
   * Callback when top-level local files/folders are dropped and local path
   * reference mode is on.
   */
  onLocalPaths?: (paths: DroppedLocalPath[]) => void | Promise<void>;
  /**
   * Callback when files are dropped
   */
  onUploadFiles: (files: File[]) => void | Promise<void>;
  /**
   * Minimum height of the overlay content
   */
  overlayMinHeight?: number;
  /**
   * Custom style for the container
   */
  style?: CSSProperties;
}

const DragUploadZone = memo<DragUploadZoneProps>(
  ({
    children,
    className,
    disabled = false,
    enabledFiles = true,
    enableLocalPathReference = false,
    onLocalPaths,
    overlayMinHeight = 160,
    onUploadFiles,
    style,
  }) => {
    const { t } = useTranslation('components');

    // Global drag state - shows overlay when dragging anywhere on page
    const { isDraggingGlobally, dragContentKind } = useDragUploadContext();

    // Local drop handler - only handles drop events
    const { getContainerProps } = useLocalDragUpload({
      disabled,
      enableLocalPathReference,
      onLocalPaths,
      onUploadFiles,
    });

    // Show overlay when files are being dragged anywhere on the page
    const showOverlay = isDraggingGlobally && !disabled;
    const isLocalPathReferenceOverlay = enableLocalPathReference && dragContentKind !== 'none';

    // Local path reference mode has distinct copy and tone so users can tell it
    // will insert filesystem references rather than upload files.
    const overlayCopy = useMemo(() => {
      if (isLocalPathReferenceOverlay) {
        return {
          desc: t('DragUpload.dragLocalPathDesc'),
          showFolderIcon: dragContentKind === 'folders',
          title: t('DragUpload.dragLocalPathTitle'),
        };
      }
      if (dragContentKind === 'folders') {
        return {
          desc: t('DragUpload.dragFolderDesc'),
          showFolderIcon: true,
          title: t('DragUpload.dragFolderTitle'),
        };
      }
      if (dragContentKind === 'mixed') {
        return {
          desc: t('DragUpload.dragMixedDesc'),
          showFolderIcon: true,
          title: t('DragUpload.dragMixedTitle'),
        };
      }
      return {
        desc: t(enabledFiles ? 'DragUpload.dragFileDesc' : 'DragUpload.dragDesc'),
        showFolderIcon: false,
        title: t(enabledFiles ? 'DragUpload.dragFileTitle' : 'DragUpload.dragTitle'),
      };
    }, [dragContentKind, enabledFiles, isLocalPathReferenceOverlay, t]);

    const overlayIcons = useMemo(() => {
      if (isLocalPathReferenceOverlay && dragContentKind === 'mixed') {
        return [FolderIcon, FileUpIcon, FileText];
      }
      if (overlayCopy.showFolderIcon) return [FolderIcon, FolderIcon, FolderIcon];
      return [FileImage, FileUpIcon, FileText];
    }, [dragContentKind, isLocalPathReferenceOverlay, overlayCopy.showFolderIcon]);

    return (
      <div className={cx(styles.container, className)} style={style} {...getContainerProps()}>
        {children}
        {showOverlay && (
          <div className={styles.overlay}>
            <div
              style={{ minHeight: overlayMinHeight }}
              className={cn(
                styles.overlayContent,
                isLocalPathReferenceOverlay && styles.overlayContentLocalPath,
              )}
            >
              <div
                className={cn('flex flex-col items-center justify-center gap-2', styles.content)}
              >
                <div className={cn('flex', styles.iconGroup)}>
                  <div
                    className={cn(
                      'flex flex-col items-center justify-center [transform:rotateZ(-20deg)_translateX(calc(var(--spacing)*2))]',
                      styles.icon,
                      styles.iconSoft,
                      isLocalPathReferenceOverlay && styles.iconSoftLocalPath,
                    )}
                  >
                    {createElement(overlayIcons[0], { size: 16, strokeWidth: 1.5 })}
                  </div>
                  <div
                    className={cn(
                      'z-1 flex flex-col items-center justify-center [transform:translateY(calc(var(--spacing)*-2.5))]',
                      styles.icon,
                      styles.iconStrong,
                      isLocalPathReferenceOverlay && styles.iconStrongLocalPath,
                    )}
                  >
                    {createElement(overlayIcons[1], { size: 16, strokeWidth: 1.5 })}
                  </div>
                  <div
                    className={cn(
                      'flex flex-col items-center justify-center [transform:rotateZ(20deg)_translateX(calc(var(--spacing)*-2))]',
                      styles.icon,
                      styles.iconSoft,
                      isLocalPathReferenceOverlay && styles.iconSoftLocalPath,
                    )}
                  >
                    {createElement(overlayIcons[2], { size: 16, strokeWidth: 1.5 })}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className={cn('flex flex-col', styles.title)}>{overlayCopy.title}</div>
                  <div className={cn('flex flex-col', styles.desc)}>{overlayCopy.desc}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

DragUploadZone.displayName = 'DragUploadZone';

export type { DroppedLocalPath } from './useLocalDragUpload';
export { usePasteFile } from './usePasteFile';
export { useUploadFiles } from './useUploadFiles';
export default DragUploadZone;
