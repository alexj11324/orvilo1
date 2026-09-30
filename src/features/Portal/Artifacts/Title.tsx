import { ActionIcon, Tabs, Text } from '@lobehub/ui/base-ui';
import { ArtifactType } from '@orvilo/types';
import { cx } from 'antd-style';
import { ArrowLeft, CodeIcon, EyeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import ArtifactDeploymentActions from '@/business/client/features/ArtifactDeploymentActions';
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
        <Text className={cx(oneLineEllipsis)} type={'secondary'}>
          {artifactTitle}
        </Text>
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
            activeKey={displayMode}
            size={'small'}
            items={[
              {
                icon: (
                  <span className="anticon" role="img">
                    <EyeIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                  </span>
                ),
                key: ArtifactDisplayMode.Preview,
                label: t('artifacts.display.preview'),
              },
              {
                icon: (
                  <span className="anticon" role="img">
                    <CodeIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                  </span>
                ),
                key: ArtifactDisplayMode.Code,
                label: t('artifacts.display.code'),
              },
            ]}
            onChange={(key) => {
              useChatStore.setState({ portalArtifactDisplayMode: key as ArtifactDisplayMode });
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Title;
