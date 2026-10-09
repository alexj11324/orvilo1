import { cn } from 'cn';
import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Artifact,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import { Spinner } from '@/components/ui/spinner';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors, messageStateSelectors } from '@/store/chat/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { type MarkdownElementProps } from '../../type';
import ArtifactIcon from './Icon';

interface ArtifactProps extends MarkdownElementProps {
  identifier: string;
  language?: string;
  title: string;
  type: string;
}

const Render = memo<ArtifactProps>(({ identifier, title, type, language, children, id }) => {
  const { t } = useTranslation('chat');

  const hasChildren = !!children;
  const str = ((children as string) || '').toString?.();

  const [isGenerating, isArtifactTagClosed, openArtifact, closeArtifact] = useChatStore((s) => {
    return [
      messageStateSelectors.isMessageGenerating(id)(s),
      chatPortalSelectors.isArtifactTagClosed(id, identifier)(s),
      s.openArtifact,
      s.closeArtifact,
    ];
  });

  const openArtifactUI = () => {
    openArtifact({ id, identifier, language, title, type });
  };

  useEffect(() => {
    if (!hasChildren || !isGenerating) return;

    openArtifact({ id, identifier, language, title, type });
  }, [isGenerating, hasChildren, str, identifier, title, type, id, language, openArtifact]);

  return (
    <Artifact
      {...clickableProps()}
      style={{ width: '100%' }}
      className={cn(
        'mt-3 w-full cursor-pointer transition-colors hover:bg-muted/50',
        CLICKABLE_FOCUS_RING,
      )}
      onClick={() => {
        const state = useChatStore.getState();
        const currentArtifactMessageId = chatPortalSelectors.artifactMessageId(state);
        const currentArtifactIdentifier = chatPortalSelectors.artifactIdentifier(state);
        if (currentArtifactMessageId === id && currentArtifactIdentifier === identifier) {
          closeArtifact();
        } else {
          openArtifactUI();
        }
      }}
    >
      <ArtifactHeader className="justify-start gap-3 border-b-0">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <ArtifactIcon type={type} />
        </div>
        <div className="min-w-0 space-y-1">
          <ArtifactTitle className="truncate">
            {!title && isGenerating
              ? t('artifact.generating')
              : title || t('artifact.unknownTitle')}
          </ArtifactTitle>
          {hasChildren && (
            <ArtifactDescription className="flex items-center gap-1 text-xs">
              <span className="truncate">{identifier}</span> ·{!isArtifactTagClosed && <Spinner />}
              <span>{str?.length}</span>
            </ArtifactDescription>
          )}
        </div>
      </ArtifactHeader>
    </Artifact>
  );
});

export default Render;
