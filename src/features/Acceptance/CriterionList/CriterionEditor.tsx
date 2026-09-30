'use client';

import { type VerifierType, verifierTypes } from '@orvilo/const/verify';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { VerifyCriterionDraft } from '@/services/verify';

/**
 * True when the criterion's judging rule lives in a linked document this editor
 * neither loads nor can update (`updateCriterion` carries no instruction
 * field). Rendering an editable blank box in that state would silently discard
 * whatever the user types into it, so the editor shows a read-only note.
 */
export const hasLinkedInstruction = (
  initial: Pick<VerifyCriterionDraft, 'documentId' | 'instruction'>,
) => Boolean(initial.documentId) && !initial.instruction;

export interface CriterionEditorProps {
  initial: VerifyCriterionDraft;
  /** Create flow: the criterion only exists once it is saved. */
  isNew?: boolean;
  onClose: () => void;
  /** Omitted when the criterion is brand-new and not yet committed. */
  onDelete?: () => void;
  onSubmit: (next: VerifyCriterionDraft) => void | Promise<void>;
}

/**
 * The single criterion editing surface, shared by goal creation, the /goal
 * intervention card, and the task verify config (modal and drawer alike). A
 * criterion's judge prompt is the thing the whole loop is scored against, so it
 * gets a real editing surface rather than a row that grows a textarea in place.
 */
export const CriterionEditor = ({
  initial,
  isNew,
  onClose,
  onDelete,
  onSubmit,
}: CriterionEditorProps) => {
  const { t } = useTranslation('verify');
  const [draft, setDraft] = useState<VerifyCriterionDraft>(initial);
  const [saving, setSaving] = useState(false);
  const verifierType = draft.verifierType ?? 'llm';
  const isProgram = verifierType === 'program';
  const instructionLinked = hasLinkedInstruction(initial);

  const patch = (value: Partial<VerifyCriterionDraft>) =>
    setDraft((previous) => ({ ...previous, ...value }));

  const verifierOptions = useMemo(
    () =>
      verifierTypes.map((type) => ({
        label: t(`criterion.verifierType.${type}` as const),
        value: type,
      })),
    [t],
  );

  const handleSave = async () => {
    const title = draft.title.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ...draft,
        description: draft.description?.trim() || undefined,
        // Empty means "not overridden": criteria whose rubric lives in a linked
        // document keep the documentId instead of gaining a blank inline rule.
        instruction: draft.instruction?.trim() ? draft.instruction : undefined,
        title,
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('acceptance.actionError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" style={{ padding: 16 }}>
      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] text-muted-foreground">{t('criterion.titleLabel')}</div>
        <Input
          autoFocus
          placeholder={t('criterion.titlePlaceholder')}
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] text-muted-foreground">{t('criterion.descriptionLabel')}</div>
        <Textarea
          placeholder={t('criterion.descriptionPlaceholder')}
          rows={2}
          style={{ maxHeight: '6lh' }}
          value={draft.description ?? ''}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] text-muted-foreground">{t('criterion.verifierLabel')}</div>
        <Select
          items={verifierOptions}
          value={verifierType}
          onValueChange={(value) => patch({ verifierType: value as VerifierType })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {verifierOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col gap-0.5">
                  <div>{option.label}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {t(`criterion.verifierTypeDesc.${option.value as VerifierType}` as const)}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] text-muted-foreground">
          {isProgram ? t('criterion.scriptLabel') : t('criterion.instructionLabel')}
        </div>
        {isProgram ? (
          <Textarea
            rows={3}
            style={{ maxHeight: '8lh' }}
            value={String(draft.verifierConfig?.command ?? '')}
            onChange={(event) =>
              patch({ verifierConfig: { ...draft.verifierConfig, command: event.target.value } })
            }
          />
        ) : instructionLinked ? (
          <div className="text-[12px] text-muted-foreground">
            {t('criterion.instructionLinked')}
          </div>
        ) : (
          <Textarea
            placeholder={t('criterion.instructionPlaceholder')}
            rows={3}
            style={{ maxHeight: '10lh' }}
            value={draft.instruction ?? ''}
            onChange={(event) => patch({ instruction: event.target.value })}
          />
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <Switch
          checked={draft.required !== false}
          size="sm"
          onCheckedChange={(checked) => patch({ required: checked })}
        />
        <div className="text-[13px]">{t('criterion.requiredHint')}</div>
      </div>

      <div className="flex items-center justify-between">
        {onDelete ? (
          <Button
            variant="destructive"
            variant="ghost"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            {t('criterion.delete')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onClose}>{t('criterion.cancel')}</Button>
          <Button
            disabled={!draft.title.trim()}
            loading={saving}
            variant="outline"
            onClick={handleSave}
          >
            {t(isNew ? 'criterion.add' : 'criterion.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};
