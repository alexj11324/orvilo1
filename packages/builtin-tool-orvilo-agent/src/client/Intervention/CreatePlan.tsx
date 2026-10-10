'use client';

import {
  ReactCodeblockPlugin,
  ReactCodePlugin,
  ReactHRPlugin,
  ReactLinkPlugin,
  ReactListPlugin,
  ReactMathPlugin,
  ReactTablePlugin,
} from '@lobehub/editor';
import { Editor, useEditor } from '@lobehub/editor/react';
import type { BuiltinInterventionProps } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Textarea } from '@/components/ui/textarea';

import type { CreatePlanParams } from '../../types';

const styles = {
  description:
    'text-[14px] leading-(--text-base--line-height) text-muted-foreground md:text-[14px] md:leading-(--text-sm--line-height)',
  title:
    'text-[28px] leading-(--text-base--line-height) font-semibold md:text-[28px] md:leading-(--text-sm--line-height)',
};

const CreatePlanIntervention = memo<BuiltinInterventionProps<CreatePlanParams>>(
  ({ args, onArgsChange, registerBeforeApprove }) => {
    const { t } = useTranslation('tool');
    const [goal, setGoal] = useState(args?.goal || '');
    const [description, setDescription] = useState(args?.description || '');

    const editor = useEditor();
    const editorInitializedRef = useRef(false);

    // Track pending changes
    const pendingChangesRef = useRef<CreatePlanParams | null>(null);

    // Initialize editor content when args.context changes
    useEffect(() => {
      if (editor && args?.context && !editorInitializedRef.current) {
        editor.setDocument('text', args.context);
        editorInitializedRef.current = true;
      }
    }, [editor, args?.context]);

    // Get current context from editor
    const getContext = useCallback(() => {
      if (!editor) return args?.context || '';
      return (editor.getDocument('text') as unknown as string) || '';
    }, [editor, args?.context]);

    // Save function
    const save = useCallback(async () => {
      const context = getContext();
      const changes: CreatePlanParams = {
        context: context || undefined,
        description,
        goal,
      };

      // Always submit current state when approving
      await onArgsChange?.(changes);
      pendingChangesRef.current = null;
    }, [onArgsChange, goal, description, getContext]);

    // Register before approve callback
    useEffect(() => {
      return registerBeforeApprove?.('createPlan', save);
    }, [registerBeforeApprove, save]);

    const handleGoalChange = useCallback(
      (value: string) => {
        setGoal(value);
        pendingChangesRef.current = {
          context: getContext() || undefined,
          description,
          goal: value,
        };
      },
      [description, getContext],
    );

    const handleDescriptionChange = useCallback(
      (value: string) => {
        setDescription(value);
        pendingChangesRef.current = {
          context: getContext() || undefined,
          description: value,
          goal,
        };
      },
      [goal, getContext],
    );

    const handleContentChange = useCallback(() => {
      pendingChangesRef.current = {
        context: getContext() || undefined,
        description,
        goal,
      };
    }, [description, goal, getContext]);

    // Focus editor when pressing Enter in description
    const handleDescriptionKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          editor?.focus();
        }
      },
      [editor],
    );

    // Focus description when pressing Enter in goal
    const handleGoalKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Focus description textarea
        const descriptionTextarea = document.querySelector(
          '[data-testid="plan-description"]',
        ) as HTMLTextAreaElement;
        descriptionTextarea?.focus();
      }
    }, []);

    return (
      <div
        className="flex flex-col gap-2 py-4"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {/* Goal - Main Title */}
        <Textarea
          className={styles.title}
          placeholder={t('orvilo-agent.createPlan.goal.placeholder')}
          style={{ padding: 0, resize: 'none' }}
          value={goal}
          onChange={(e) => handleGoalChange(e.target.value)}
          onKeyDown={handleGoalKeyDown}
        />

        {/* Description - Subtitle */}
        <Textarea
          className={styles.description}
          data-testid="plan-description"
          placeholder={t('orvilo-agent.createPlan.description.placeholder')}
          style={{ padding: 0, resize: 'none' }}
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          onKeyDown={handleDescriptionKeyDown}
        />

        {/* Context - Rich Text Editor */}
        <div style={{ marginTop: 8, minHeight: 200 }}>
          <Editor
            content={args.context}
            editor={editor}
            lineEmptyPlaceholder={t('orvilo-agent.createPlan.context.placeholder')}
            placeholder={t('orvilo-agent.createPlan.context.placeholder')}
            type={'text'}
            plugins={[
              ReactListPlugin,
              ReactCodePlugin,
              ReactCodeblockPlugin,
              ReactHRPlugin,
              ReactLinkPlugin,
              ReactTablePlugin,
              ReactMathPlugin,
            ]}
            style={{
              minHeight: 200,
            }}
            onTextChange={handleContentChange}
          />
        </div>
      </div>
    );
  },
  isEqual,
);

CreatePlanIntervention.displayName = 'CreatePlanIntervention';

export default CreatePlanIntervention;
