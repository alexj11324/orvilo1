import { type UIChatMessage } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { Info } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

import { dataSelectors, useConversationStore } from '../../store';
import Tool from './Tool';

interface ToolMessageProps {
  disableEditing?: boolean;
  id: string;
  index: number;
}

const ToolMessage = memo<ToolMessageProps>(({ disableEditing, id, index }) => {
  const { t } = useTranslation('plugin');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const item = useConversationStore(dataSelectors.getDbMessageById(id), isEqual) as UIChatMessage;
  const deleteToolMessage = useConversationStore((s) => s.deleteToolMessage);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteToolMessage(id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 py-3">
      {canEdit && !disableEditing && (
        <Alert variant="default">
          <Info />
          <AlertTitle>{t('inspector.orphanedToolCall')}</AlertTitle>
          <AlertAction>
            {
              <Button loading={loading} size="sm" variant="default" onClick={handleDelete}>
                {t('inspector.delete')}
              </Button>
            }
          </AlertAction>
        </Alert>
      )}
      {item.plugin && (
        <Tool
          {...item.plugin}
          disableEditing={disableEditing}
          index={index}
          messageId={id}
          toolCallId={item.tool_call_id!}
        />
      )}
    </div>
  );
}, isEqual);

export default ToolMessage;
