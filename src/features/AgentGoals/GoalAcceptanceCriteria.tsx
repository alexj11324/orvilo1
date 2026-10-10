'use client';

import { PencilIcon, PlusIcon, XIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { openCriterionEditModal } from '@/features/Acceptance';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { goalService } from '@/services/goal';
import type { GoalCriterionWithInstruction } from '@/services/verify';
import { verifyService } from '@/services/verify';
import { useGoalStore } from '@/store/goal';

const styles = {
  row: '[padding-block:8px] [&:not(:last-child)]:[border-block-end:1px_dashed_var(--sidebar-border)]',
  seq: 'flex-none font-mono text-xs leading-[inherit] text-(--ant-color-text-quaternary)',
};

/**
 * The goal's structured acceptance standard: the persisted verify criteria the
 * terminal Goal-acceptance Task is gated on. Rendered as its own section so the
 * standard is inspectable and editable instead of living only inside the
 * requirement prose.
 *
 * Editing note: the how-to-judge instruction lives in a linked document, so a
 * save that changes it persists a replacement criterion (new row + doc) and
 * rebinds the goal; title/description-only edits update the row in place.
 */
const GoalAcceptanceCriteria = memo<{ criteriaIds: string[]; goalId: string }>(
  ({ criteriaIds, goalId }) => {
    const { t } = useTranslation('chat');
    const { allowed: canEdit } = usePermission('create_content');
    const refreshGoalGraph = useGoalStore((s) => s.refreshGoalGraph);

    const { data: criteria, mutate } = useClientDataSWR(
      criteriaIds.length > 0 ? ['goal-acceptance-criteria', goalId, criteriaIds.join(',')] : null,
      () => verifyService.getCriteria(criteriaIds),
    );

    const rebind = useCallback(
      async (nextIds: string[]) => {
        await goalService.setAcceptanceCriteria(goalId, nextIds);
        await refreshGoalGraph(goalId);
        await mutate();
      },
      [goalId, mutate, refreshGoalGraph],
    );

    const openEdit = (item?: GoalCriterionWithInstruction) => {
      openCriterionEditModal({
        criterion: item
          ? {
              description: item.description ?? undefined,
              instruction: item.instruction,
              onFail: item.onFail,
              required: item.required,
              title: item.title,
              verifierConfig: item.verifierConfig ?? undefined,
              verifierType: item.verifierType,
            }
          : { onFail: 'manual', required: true, title: '', verifierType: 'agent' },
        isNew: !item,
        onSubmit: async (draft) => {
          if (item && (draft.instruction ?? '').trim() === (item.instruction ?? '').trim()) {
            await verifyService.updateCriterion(item.id, {
              description: draft.description || null,
              onFail: draft.onFail,
              required: draft.required,
              title: draft.title,
              verifierConfig: draft.verifierConfig,
              verifierType: draft.verifierType,
            });
            await mutate();
          } else {
            const [createdId] = await verifyService.createCriteria([draft]);
            if (createdId) {
              await rebind(
                item
                  ? criteriaIds.map((id) => (id === item.id ? createdId : id))
                  : [...criteriaIds, createdId],
              );
            }
          }
        },
      });
    };

    const handleRemove = (item: GoalCriterionWithInstruction) => {
      confirmModal({
        content: t('goalAcceptance.removeConfirm.content', { title: item.title }),
        okButtonProps: { danger: true },
        onOk: async () => {
          await rebind(criteriaIds.filter((id) => id !== item.id));
        },
        title: t('goalAcceptance.removeConfirm.title'),
      });
    };

    // The section header (title + count + gate hint) belongs to the hosting
    // accordion row in ProcessControl — this renders the list body only.
    return (
      <div
        className="flex flex-col rounded-md border border-border"
        style={{ paddingBlock: 4, paddingInline: 16 }}
      >
        {criteriaIds.length === 0 && (
          <div className={`flex flex-col ${styles.row}`}>
            <div className="text-[13px] text-muted-foreground">{t('goalAcceptance.empty')}</div>
          </div>
        )}
        {(criteria ?? []).map((item, index) => (
          <div className={`flex flex-col gap-1 ${styles.row}`} key={item.id}>
            <div className="flex items-center gap-2.5">
              <span className={styles.seq}>C{index + 1}</span>
              <div className="font-medium" style={{ flex: 1, minWidth: 0 }}>
                {item.title}
              </div>
              {canEdit && (
                <div className="flex gap-0.5" style={{ flex: 'none' }}>
                  <ActionIcon
                    icon={PencilIcon}
                    size={'small'}
                    title={t('goalAcceptance.edit')}
                    onClick={() => openEdit(item)}
                  />
                  <ActionIcon
                    icon={XIcon}
                    size={'small'}
                    title={t('goalAcceptance.remove')}
                    onClick={() => handleRemove(item)}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        {canEdit && (
          <div className={`flex ${styles.row}`}>
            <Button size="sm" variant="ghost" onClick={() => openEdit()}>
              <PlusIcon />
              {t('goalAcceptance.add')}
            </Button>
          </div>
        )}
      </div>
    );
  },
);

GoalAcceptanceCriteria.displayName = 'GoalAcceptanceCriteria';

export default GoalAcceptanceCriteria;
