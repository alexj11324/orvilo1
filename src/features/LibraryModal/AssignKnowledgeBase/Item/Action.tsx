import { InfoIcon, MoreVerticalIcon, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { DropdownMenu } from '@/components/ItemsMenu';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/store/agent';
import { useServerConfigStore } from '@/store/serverConfig';
import { KnowledgeType } from '@/types/knowledgeBase';

interface ActionsProps {
  enabled?: boolean;
  id: string;
  type: KnowledgeType;
}

const Actions = memo<ActionsProps>(({ id, type, enabled }) => {
  const { t } = useTranslation('chat');

  const mobile = useServerConfigStore((s) => s.isMobile);
  const [
    addFilesToAgent,
    addKnowledgeBasesToAgent,
    removeFilesFromAgent,
    removeKnowledgeBasesFromAgent,
  ] = useAgentStore((s) => [
    s.addFilesToAgent,
    s.addKnowledgeBaseToAgent,
    s.removeFileFromAgent,
    s.removeKnowledgeBaseFromAgent,
  ]);

  const [loading, setLoading] = useState(false);

  const assignKnowledge = async () => {
    setLoading(true);
    if (type === KnowledgeType.KnowledgeBase) {
      await addKnowledgeBasesToAgent(id);
    } else {
      await addFilesToAgent([id], true);
    }
    setLoading(false);
  };

  const removeKnowledge = async () => {
    setLoading(true);
    if (type === KnowledgeType.KnowledgeBase) {
      await removeKnowledgeBasesFromAgent(id);
    } else {
      await removeFilesFromAgent(id);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-row items-center">
      {enabled ? (
        <DropdownMenu
          placement="bottomRight"
          items={[
            {
              icon: (
                <span className="anticon" role="img">
                  <InfoIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                </span>
              ),
              key: 'detail',
              label: t('knowledgeBase.library.action.detail'),
              onClick: () => {
                if (type === KnowledgeType.KnowledgeBase) {
                  window.open(`/resource/library/${id}`);
                  return;
                }

                window.open(`/resource?file=${id}`);
              },
            },
            {
              danger: true,
              icon: (
                <span className="anticon" role="img">
                  <Trash2 fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                </span>
              ),
              key: 'remove',
              label: t('knowledgeBase.library.action.remove'),
              onClick: removeKnowledge,
            },
          ]}
        >
          <ActionIcon icon={MoreVerticalIcon} loading={loading} />
        </DropdownMenu>
      ) : (
        <Button
          loading={loading}
          size={mobile ? 'small' : undefined}
          variant="default"
          onClick={assignKnowledge}
        >
          {t('knowledgeBase.library.action.add')}
        </Button>
      )}
    </div>
  );
});

export default Actions;
