'use client';

import { cn } from 'cn';
import { PanelRight } from 'lucide-react';
import { type CSSProperties, memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useConversationPanelDrop } from './useConversationPanelDrop';

const styles = {
  overlay:
    'pointer-events-none absolute z-20 inset-2 border-2 border-dashed border-info-border rounded-(--radius-overlay) opacity-90 bg-info-wash',
  root: 'relative flex-1 min-h-0 mbe-2',
};

/**
 * Wraps the main conversation body so a topic/thread dragged from the sidebar
 * can be dropped to open side-by-side in the portal. Renders a highlight
 * overlay while a droppable payload hovers.
 */
const SplitDropZone = memo<{ children: ReactNode; style?: CSSProperties }>(
  ({ children, style }) => {
    const { t } = useTranslation('common');
    const { dragKind, onDragEnter, onDragLeave, onDragOver, onDrop, onDropCapture } =
      useConversationPanelDrop();

    return (
      <div
        className={cn('flex flex-col', styles.root)}
        style={style}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDropCapture={onDropCapture}
      >
        {children}
        {dragKind && (
          <div className={cn('flex flex-col items-center justify-center', styles.overlay)}>
            <div className="flex flex-col items-center gap-2 text-info-text">
              <PanelRight size={16} />
              <div className="text-inherit text-sm font-medium">{t('openOnRightHint')}</div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

SplitDropZone.displayName = 'SplitDropZone';

export default SplitDropZone;
