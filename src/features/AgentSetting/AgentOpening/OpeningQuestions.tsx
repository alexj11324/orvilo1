'use client';

import { createStaticStyles } from 'antd-style';
import { MessageCircle, PlusIcon, Trash } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMergeState from 'use-merge-value';

import ActionIcon from '@/components/ActionIcon';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';

import { useStore } from '../store';
import { selectors } from '../store/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  empty: css`
    margin-block: 24px;
    margin-inline: auto;
  `,
  questionItemContainer: css`
    padding-block: 8px;
    padding-inline-end: 8px;
  `,
  questionItemContent: css`
    flex: 1;
  `,
  questionsList: css`
    width: 100%;
    margin-block-start: 16px;
  `,
  repeatError: css`
    margin: 0;
    color: ${cssVar.colorErrorText};
  `,
}));

interface QuestionItem {
  content: string;
  id: string | number;
}

const OpeningQuestions = memo(() => {
  const { t } = useTranslation('setting');
  const [questionInput, setQuestionInput] = useState('');

  const openingQuestions = useStore(selectors.openingQuestions);
  const [disabled, updateConfig] = useStore((s) => [s.disabled, s.setAgentConfig]);

  // Optimistic update to avoid jitter
  const [questions, setQuestions] = useMergeState(openingQuestions, {
    onChange: (questions: string[]) => {
      if (disabled) return;

      updateConfig({ openingQuestions: questions });
    },
    value: openingQuestions,
  });

  const items: QuestionItem[] = useMemo(() => {
    return questions.map((item, index) => ({
      content: item,
      id: item || index,
    }));
  }, [questions]);

  const addQuestion = useCallback(() => {
    if (disabled) return;
    if (!questionInput.trim()) return;

    setQuestions([...openingQuestions, questionInput.trim()]);
    setQuestionInput('');
  }, [disabled, openingQuestions, questionInput, setQuestions]);

  const removeQuestion = useCallback(
    (content: string) => {
      if (disabled) return;

      const newQuestions = [...openingQuestions];
      const index = newQuestions.indexOf(content);
      newQuestions.splice(index, 1);
      setQuestions(newQuestions);
    },
    [disabled, openingQuestions, setQuestions],
  );

  // Handle logic after drag-and-drop sorting
  const handleSortEnd = useCallback(
    (items: QuestionItem[]) => {
      if (disabled) return;

      setQuestions(items.map((item) => item.content));
    },
    [disabled, setQuestions],
  );

  const isRepeat = openingQuestions.includes(questionInput.trim());

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center gap-2 w-full">
          <Input
            disabled={disabled}
            placeholder={t('settingOpening.openingQuestions.placeholder')}
            style={{ flex: 1 }}
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addQuestion();
            }}
          />
          <Button
            // don't allow repeat
            disabled={disabled || openingQuestions.includes(questionInput.trim())}
            icon={PlusIcon}
            onClick={addQuestion}
          />
        </div>

        {isRepeat && (
          <p className={styles.repeatError}>{t('settingOpening.openingQuestions.repeat')}</p>
        )}
      </div>

      <div className={styles.questionsList}>
        {openingQuestions.length > 0 ? (
          <Sortable
            getItemValue={(item: QuestionItem) => item.id}
            value={items}
            onValueChange={handleSortEnd}
          >
            {items.map((item: QuestionItem) => (
              <SortableItem className={styles.questionItemContainer} key={item.id} value={item.id}>
                {!disabled && <SortableItemHandle />}
                <div className={styles.questionItemContent}>{item.content}</div>
                <ActionIcon
                  disabled={disabled}
                  icon={Trash}
                  size={'small'}
                  onClick={() => removeQuestion(item.content)}
                />
              </SortableItem>
            ))}
          </Sortable>
        ) : (
          <Empty className={styles.empty} style={{ maxWidth: 400 }}>
            <EmptyHeader>
              <EmptyMedia variant={'icon'}>
                <MessageCircle />
              </EmptyMedia>
              <EmptyDescription>{t('settingOpening.openingQuestions.empty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
});

export default OpeningQuestions;
