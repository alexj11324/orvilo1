import { ArtifactType } from '@orvilo/types';
import { cx } from 'antd-style';
import { cn } from 'cn';
import { ArrowLeft, CodeIcon, EyeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import ArtifactDeploymentActions from '@/business/client/features/ArtifactDeploymentActions';
import ActionIcon from '@/components/ActionIcon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { ArtifactDisplayMode } from '@/store/chat/slices/portal/initialState';
import { oneLineEllipsis } from '@/styles';

const Title = () => {
  const { t } = useTranslation('portal');

  const [
    messageId,
    artifactIdentifier,
    topicId,
    displayMode,
    artifactType,
    artifactTitle,
    isArtifactTagClosed,
    closeArtifact,
  ] = useChatStore((s) => {
    const messageId = chatPortalSelectors.artifactMessageId(s) || '';
    const identifier = chatPortalSelectors.artifactIdentifier(s);

    return [
      messageId,
      identifier,
      s.activeTopicId,
      s.portalArtifactDisplayMode,
      chatPortalSelectors.artifactType(s),
      chatPortalSelectors.artifactTitle(s),
      chatPortalSelectors.isArtifactTagClosed(messageId, identifier)(s),
      s.closeArtifact,
    ];
  });

  // show switch only when artifact is closed and the type is not code
  const showSwitch = isArtifactTagClosed && artifactType !== ArtifactType.Code;

  return (
    <div className="flex flex-row items-center flex-1 gap-3 justify-between w-[100%]">
      <div className="flex flex-row items-center gap-1">
        <ActionIcon icon={ArrowLeft} size={'small'} onClick={() => closeArtifact()} />
        <div className={cn('text-muted-foreground', cx(oneLineEllipsis))}>{artifactTitle}</div>
      </div>

      <div className="flex flex-row items-center gap-1">
        <ArtifactDeploymentActions
          artifactIdentifier={artifactIdentifier}
          artifactTitle={artifactTitle}
          artifactType={artifactType}
          displayMode={displayMode}
          isArtifactTagClosed={isArtifactTagClosed}
          messageId={messageId}
          topicId={topicId}
        />
        {showSwitch && (
          <Tabs
            value={displayMode}
            onValueChange={(key) => {
              useChatStore.setState({ portalArtifactDisplayMode: key as ArtifactDisplayMode });
            }}
          >
            <TabsList>
              <TabsTrigger value={ArtifactDisplayMode.Preview}>
                <span className="anticon" role="img">
                  <EyeIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                </span>
                {t('artifacts.display.preview')}
              </TabsTrigger>
              <TabsTrigger value={ArtifactDisplayMode.Code}>
                <span className="anticon" role="img">
                  <CodeIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                </span>
                {t('artifacts.display.code')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Title;
