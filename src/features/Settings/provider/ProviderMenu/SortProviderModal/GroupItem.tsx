import { GripVertical } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { ProviderIcon } from '@/components/OrviloIcons';
import { SortableItemHandle } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';
import { type AiProviderListItem } from '@/types/aiProvider';

interface GroupItemProps extends AiProviderListItem {
  disabled?: boolean;
}

const GroupItem = memo<GroupItemProps>(({ id, name, source, logo, disabled }) => {
  const { t } = useTranslation('modelProvider');

  return (
    <>
      <div className="flex items-center gap-2">
        {source === 'custom' && logo ? (
          <Avatar alt={name || id} avatar={logo} shape={'square'} size={24} />
        ) : (
          <ProviderIcon provider={id} size={24} type={'avatar'} />
        )}
        {name}
      </div>
      {!disabled && (
        <SortableItemHandle
          className="flex size-8 items-center justify-center rounded-(--radius-input) text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-11"
          render={
            <Button
              aria-label={`${t('sortModal.title')}: ${name || id}`}
              size="icon"
              type="button"
              variant="ghost"
            />
          }
        >
          <GripVertical aria-hidden className="size-4" />
        </SortableItemHandle>
      )}
    </>
  );
});

export default GroupItem;
