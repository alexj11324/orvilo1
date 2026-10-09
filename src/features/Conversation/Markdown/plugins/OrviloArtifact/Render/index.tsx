import { cn } from 'cn';
import { PanelRightOpenIcon } from 'lucide-react';
import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockExpandButton,
} from '@/components/reui/code-block/code-block';
import { Spinner } from '@/components/ui/spinner';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors, messageStateSelectors } from '@/store/chat/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { type MarkdownElementProps } from '../../type';

interface ArtifactProps extends MarkdownElementProps {
  identifier: string;
  language?: string;
  title: string;
  type: string;
}

const Render = memo<ArtifactProps>(({ identifier, title, type, language, children, id }) => {
  const { t } = useTranslation(['chat', 'common']);

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

  const toggleArtifact = () => {
    const state = useChatStore.getState();
    if (
      chatPortalSelectors.artifactMessageId(state) === id &&
      chatPortalSelectors.artifactIdentifier(state) === identifier
    )
      closeArtifact();
    else openArtifactUI();
  };

  return (
    <Artifact className="mt-3 w-full">
      <ArtifactHeader>
        <div
          {...clickableProps()}
          className={cn('min-w-0 cursor-pointer space-y-1', CLICKABLE_FOCUS_RING)}
          onClick={toggleArtifact}
        >
          <ArtifactTitle className="truncate">
            {!title && isGenerating
              ? t('artifact.generating')
              : title || t('artifact.unknownTitle')}
          </ArtifactTitle>
          {hasChildren && (
            <ArtifactDescription className="flex items-center gap-1">
              <span className="truncate">{identifier}</span> ·{!isArtifactTagClosed && <Spinner />}
              <span>{str?.length}</span>
            </ArtifactDescription>
          )}
        </div>
        <ArtifactActions>
          <ArtifactAction
            icon={PanelRightOpenIcon}
            label={t('openOnRight', { ns: 'common' })}
            tooltip={t('openOnRight', { ns: 'common' })}
            onClick={toggleArtifact}
          />
        </ArtifactActions>
      </ArtifactHeader>
      {hasChildren && (
        <ArtifactContent className="p-0">
          <CodeBlock
            className="rounded-none border-0"
            code={str}
            maxLines={8}
            language={
              language ||
              (type === 'text/html' ? 'html' : type === 'image/svg+xml' ? 'xml' : undefined)
            }
          >
            <CodeBlockCopyButton />
            <CodeBlockExpandButton />
          </CodeBlock>
        </ArtifactContent>
      )}
    </Artifact>
  );
});

export default Render;
