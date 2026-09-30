'use client';

import { Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { Loader2Icon, PencilIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EditingIndicatorProps {
  /** The member currently holding the edit lock, or null/undefined when free. */
  holderId?: string | null;
  /**
   * True while the lock state is still being resolved (editor read-only). Shows a
   * "checking…" hint so the user understands why they can't edit yet.
   */
  pending?: boolean;
}

/**
 * Subtle edit-lock badge for any editable resource: a "checking…" hint while the
 * lock resolves, then "someone else is editing" if another member holds it.
 * Renders nothing once the resource is confirmed free.
 */
const EditingIndicator = memo<EditingIndicatorProps>(({ holderId, pending }) => {
  const { t } = useTranslation('file');
  const holder = useAuthorInfo(holderId ?? undefined);

  if (!holderId) {
    if (!pending) return null;

    const checkingLabel = t('pageEditor.editMode.checking');
    return (
      <div className="flex items-center gap-1" style={{ color: cssVar.colorTextTertiary }}>
        <Loader2Icon className="animate-spin" size={14} />
        <Text ellipsis style={{ color: 'inherit', fontSize: 12, maxWidth: 200 }}>
          {checkingLabel}
        </Text>
      </div>
    );
  }

  const label = holder?.fullName
    ? t('pageEditor.editMode.lockedByOther', { name: holder.fullName })
    : t('pageEditor.editMode.lockedBySomeone');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span style={{ display: 'inline-flex' }}>
              <div className="flex items-center gap-1" style={{ color: cssVar.colorTextTertiary }}>
                <PencilIcon size={14} />
                <Text ellipsis style={{ color: 'inherit', fontSize: 12, maxWidth: 200 }}>
                  {label}
                </Text>
              </div>
            </span>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export default EditingIndicator;
