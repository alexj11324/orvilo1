import { Block, Flexbox } from '@lobehub/ui';
import { ActionIcon, Button, createModal, type ModalInstance, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { Lightbulb, PencilLineIcon, RefreshCw, X } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type ActionKeys,
  type ChatInputEditor,
  ChatInputProvider,
  DesktopChatInput,
} from '@/features/ChatInput';
import { useRandomQuestions } from '@/features/Home/SuggestQuestions/useRandomQuestions';

import type { CreateAgentModalSubmitSource } from './createAgentModalAnalytics';
import { trackCreateAgentModalCreationSucceeded } from './createAgentModalAnalytics';

const RIGHT_ACTIONS: ActionKeys[] = ['model'];
const CREATE_MODAL_WIDTH = 'min(90vw, 760px)';

interface ExampleItemProps {
  description: string;
  onClick: (prompt: string) => void;
  prompt: string;
  title: string;
}

const ExampleItem = memo<ExampleItemProps>(({ title, description, onClick, prompt }) => {
  return (
    <Block
      clickable
      variant={'outlined'}
      style={{
        borderRadius: cssVar.borderRadiusLG,
        cursor: 'pointer',
      }}
      onClick={() => onClick(prompt)}
    >
      <Flexbox gap={4} paddingBlock={12} paddingInline={14}>
        <Text ellipsis fontSize={14} style={{ fontWeight: 500 }}>
          {title}
        </Text>
        <Text color={cssVar.colorTextTertiary} ellipsis={{ rows: 2 }} fontSize={12}>
          {description}
        </Text>
      </Flexbox>
    </Block>
  );
});

interface ExamplesProps {
  onExampleClick: (prompt: string) => void;
  suggestMode: 'agent' | 'group';
}

const Examples = memo<ExamplesProps>(({ suggestMode, onExampleClick }) => {
  const { t: tCommon } = useTranslation('common');
  const { t: tSuggest } = useTranslation('suggestQuestions');
  const { questions, refresh } = useRandomQuestions(suggestMode);

  if (questions.length === 0) return null;

  return (
    <Flexbox gap={16}>
      <Flexbox horizontal align={'center'} justify={'space-between'}>
        <Flexbox horizontal align={'center'} gap={8}>
          <Lightbulb color={cssVar.colorTextDescription} size={18} />
          <Text color={cssVar.colorTextSecondary}>{tCommon('home.suggestQuestions')}</Text>
        </Flexbox>
        <Flexbox
          horizontal
          align={'center'}
          gap={4}
          style={{ cursor: 'pointer' }}
          onClick={refresh}
        >
          <ActionIcon icon={RefreshCw} size={'small'} />
          <Text color={cssVar.colorTextSecondary} fontSize={12}>
            {tCommon('switch')}
          </Text>
        </Flexbox>
      </Flexbox>
      <Flexbox gap={12} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {questions.map((item) => {
          const prompt = tSuggest(item.promptKey as any);
          return (
            <ExampleItem
              description={prompt}
              key={item.id}
              prompt={prompt}
              title={tSuggest(item.titleKey as any)}
              onClick={onExampleClick}
            />
          );
        })}
      </Flexbox>
    </Flexbox>
  );
});

export interface CreateAgentModalProps {
  agentId?: string;
  onClose: () => void;
  onCreateBlank: () => Promise<void> | void;
  onSubmit: (prompt: string) => Promise<void> | void;
  type: 'agent' | 'group';
}

export const CreateAgentModal = memo<CreateAgentModalProps>(
  ({ type, agentId, onClose, onSubmit, onCreateBlank }) => {
    const { t } = useTranslation('chat');
    const editorRef = useRef<ChatInputEditor | null>(null);
    const contentRef = useRef('');
    const examplePromptRef = useRef('');
    const submitSourceRef = useRef<CreateAgentModalSubmitSource>('manual');
    const [loading, setLoading] = useState(false);

    const isAgent = type === 'agent';
    const modalTitle = isAgent ? t('createModal.title') : t('createModal.groupTitle');

    const resetInputTracking = useCallback(() => {
      contentRef.current = '';
      examplePromptRef.current = '';
      submitSourceRef.current = 'manual';
    }, []);

    const handleClose = useCallback(() => {
      resetInputTracking();
      onClose();
    }, [onClose, resetInputTracking]);

    const getSubmitSource = useCallback((text: string): CreateAgentModalSubmitSource => {
      if (examplePromptRef.current && submitSourceRef.current !== 'manual') {
        return text.trim() === examplePromptRef.current ? 'example' : 'example_edited';
      }

      return submitSourceRef.current;
    }, []);

    const handleSubmit = useCallback(
      async (prompt?: string) => {
        const text = prompt || contentRef.current.trim();
        if (!text || loading) return;
        setLoading(true);
        try {
          await onSubmit(text);
          void trackCreateAgentModalCreationSucceeded({
            source: getSubmitSource(text),
            type,
          });
          handleClose();
        } finally {
          setLoading(false);
        }
      },
      [getSubmitSource, handleClose, loading, onSubmit, type],
    );

    const handleCreateBlank = useCallback(async () => {
      if (loading) return;
      setLoading(true);
      try {
        await onCreateBlank();
        void trackCreateAgentModalCreationSucceeded({
          source: 'blank',
          type,
        });
        handleClose();
      } finally {
        setLoading(false);
      }
    }, [handleClose, loading, onCreateBlank, type]);

    const handleExampleClick = useCallback((prompt: string) => {
      examplePromptRef.current = prompt.trim();
      submitSourceRef.current = 'example';
      editorRef.current?.instance?.setDocument('markdown', prompt);
      editorRef.current?.focus();
      contentRef.current = prompt;
    }, []);

    const handleSend = useCallback(() => {
      handleSubmit();
    }, [handleSubmit]);

    const inputContainerProps = useMemo(
      () => ({
        minHeight: 88,
        resize: false,
        style: { borderRadius: 16 },
      }),
      [],
    );

    const sendButtonProps = useMemo(
      () => ({
        generating: loading,
        onStop: () => {},
        shape: 'round' as const,
      }),
      [loading],
    );

    return (
      <Flexbox gap={24} paddingBlock={'16px 24px'} paddingInline={24}>
        {/* Header: Start Blank + Close */}
        <Flexbox horizontal align="center" gap={4} justify="flex-end">
          <Button icon={<PencilLineIcon size={14} />} type="text" onClick={handleCreateBlank}>
            {t('createModal.createBlank')}
          </Button>
          <ActionIcon icon={X} onClick={handleClose} />
        </Flexbox>
        {/* Title */}
        <Flexbox align="center">
          <h3 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{modalTitle}</h3>
        </Flexbox>

        {/* ChatInput */}
        <ChatInputProvider
          agentId={agentId}
          allowExpand={false}
          rightActions={RIGHT_ACTIONS}
          sendButtonProps={sendButtonProps}
          chatInputEditorRef={(instance) => {
            if (instance) editorRef.current = instance;
          }}
          onSend={handleSend}
          onMarkdownContentChange={(content) => {
            contentRef.current = content;
            const trimmedContent = content.trim();
            if (
              examplePromptRef.current &&
              (submitSourceRef.current === 'example' ||
                submitSourceRef.current === 'example_edited')
            ) {
              submitSourceRef.current =
                trimmedContent === examplePromptRef.current ? 'example' : 'example_edited';
            }
          }}
        >
          <DesktopChatInput
            inputContainerProps={inputContainerProps}
            placeholder={isAgent ? t('createModal.placeholder') : t('createModal.groupPlaceholder')}
            showControlBar={false}
          />
        </ChatInputProvider>

        {/* Examples */}
        <Examples suggestMode={type} onExampleClick={handleExampleClick} />
      </Flexbox>
    );
  },
);

CreateAgentModal.displayName = 'CreateAgentModal';

export interface OpenCreateAgentModalOptions extends Omit<CreateAgentModalProps, 'onClose'> {
  /** Runs once the modal has been dismissed, for whatever reason. */
  onClosed?: () => void;
}

export const openCreateAgentModal = ({
  onClosed,
  ...contentProps
}: OpenCreateAgentModalOptions) => {
  const modalRef: { current?: ModalInstance } = {};

  const instance = createModal({
    content: <CreateAgentModal {...contentProps} onClose={() => modalRef.current?.close()} />,
    footer: null,
    // NOT `onOpenChange`: that only fires for user dismissal (Escape, backdrop,
    // the header close button). `instance.close()` — which the in-content close
    // and the post-create path both call — just flips the stack entry, so the
    // provider would never learn the modal went away and could not reopen it.
    // `createModal` only ever completes with `false`, but the open flag is
    // honored so this does not depend on that renderer detail.
    onOpenChangeComplete: (open) => {
      if (!open) onClosed?.();
    },
    styles: { content: { padding: 0 } },
    width: CREATE_MODAL_WIDTH,
  });

  modalRef.current = instance;

  return instance;
};
