'use client';

import type { AcceptanceChecklistItem } from '@orvilo/types';
import { t } from 'i18next';
import { Check, CircleDashed, Plus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ModalInstance } from '@/components/Modal';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { useRubricCriteria, useRubrics } from '../../hooks';

interface AddCheckContentProps {
  existingIds: string[];
  onSubmit: (items: AcceptanceChecklistItem[]) => Promise<void>;
}

const AddCheckContent = memo<AddCheckContentProps>(({ existingIds, onSubmit }) => {
  const { t: tv } = useTranslation('verify');
  const { close } = useModalContext();
  const [mode, setMode] = useState<'manual' | 'rubric'>('manual');
  const [name, setName] = useState('');
  const [method, setMethod] = useState('');
  const [rubricId, setRubricId] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const { data: rubrics, isLoading: rubricsLoading } = useRubrics(mode === 'rubric');
  const { data: criteria, isLoading: criteriaLoading } = useRubricCriteria(rubricId);
  const availableCriteria = useMemo(
    () => (criteria ?? []).filter((criterion) => !existingIds.includes(criterion.id)),
    [criteria, existingIds],
  );

  const handleSave = async () => {
    if (saving) return;
    const items =
      mode === 'manual'
        ? [{ id: crypto.randomUUID(), method: method.trim() || undefined, name: name.trim() }]
        : availableCriteria
            .filter((criterion) => selectedIds.has(criterion.id))
            .map((criterion) => ({
              id: criterion.id,
              method: criterion.description ?? undefined,
              name: criterion.title,
            }));
    if (items.length === 0 || !items[0]?.name) return;
    setSaving(true);
    try {
      await onSubmit(items);
      close();
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    mode === 'manual' ? Boolean(name.trim()) : Boolean(rubricId && selectedIds.size > 0);

  return (
    <div className="flex flex-col gap-4">
      {mode === 'manual' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] text-muted-foreground">
              {tv('acceptance.tray.editModal.nameLabel')}
            </div>
            <Input
              placeholder={tv('acceptance.tray.editModal.namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] text-muted-foreground">
              {tv('acceptance.tray.editModal.methodLabel')}
            </div>
            <Textarea
              placeholder={tv('acceptance.tray.editModal.methodPlaceholder')}
              rows={2}
              style={{ maxHeight: '4lh' }}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <div className="text-[12px] text-muted-foreground">{tv('or', { ns: 'common' })}</div>
            <Button size="sm" variant="ghost" onClick={() => setMode('rubric')}>
              {tv('acceptance.checkCreate.rubric')}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Button
            size="sm"
            style={{ alignSelf: 'flex-start' }}
            variant="ghost"
            onClick={() => setMode('manual')}
          >
            {tv('acceptance.checkCreate.manual')}
          </Button>
          <Select
            disabled={rubricsLoading}
            items={(rubrics ?? []).map((rubric) => ({ label: rubric.title, value: rubric.id }))}
            value={rubricId}
            onValueChange={(value) => {
              setRubricId(value ?? undefined);
              setSelectedIds(new Set());
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={tv('acceptance.checkCreate.selectRubric')} />
            </SelectTrigger>
            <SelectContent>
              {(rubrics ?? []).map((rubric) => (
                <SelectItem key={rubric.id} value={rubric.id}>
                  {rubric.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rubricId && (
            <div className="flex flex-col gap-1">
              {criteriaLoading ? (
                <div className="text-muted-foreground">{tv('acceptance.checkCreate.loading')}</div>
              ) : availableCriteria.length === 0 ? (
                <div className="text-muted-foreground">{tv('acceptance.checkCreate.empty')}</div>
              ) : (
                availableCriteria.map((criterion) => {
                  const selected = selectedIds.has(criterion.id);
                  return (
                    <Button
                      key={criterion.id}
                      style={{ height: 'auto', justifyContent: 'flex-start', padding: 10 }}
                      variant={selected ? 'default' : 'outline'}
                      onClick={() =>
                        setSelectedIds((previous) => {
                          const next = new Set(previous);
                          if (selected) next.delete(criterion.id);
                          else next.add(criterion.id);
                          return next;
                        })
                      }
                    >
                      <div className="flex items-start gap-2">
                        {selected ? <Check size={14} /> : <Plus size={14} />}
                        <div className="flex flex-col items-start gap-0.5">
                          <div>{criterion.title}</div>
                          {criterion.description && (
                            <div className="text-[12px] text-muted-foreground">
                              {criterion.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </Button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5 rounded-(--radius-card) border border-sidebar-border bg-(--ant-color-fill-quaternary) p-3">
        <div className="flex items-center gap-1.5">
          <CircleDashed size={14} />
          <div className="text-[12px] text-muted-foreground">
            {tv('acceptance.checkCreate.previewState')}
          </div>
        </div>
        <div className="font-semibold">
          {mode === 'manual'
            ? name.trim() || tv('acceptance.checkCreate.previewTitle')
            : tv('acceptance.checkCreate.selectedCount', { count: selectedIds.size })}
        </div>
        {mode === 'manual' && method.trim() && (
          <div className="text-[12px] text-muted-foreground">{method.trim()}</div>
        )}
        <div className="text-[12px] text-muted-foreground">
          {tv('acceptance.checkCreate.previewHint')}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button disabled={saving} onClick={close}>
          {tv('acceptance.actions.cancel')}
        </Button>
        <Button
          disabled={!canSave || saving}
          loading={saving}
          variant="outline"
          onClick={handleSave}
        >
          {tv('acceptance.checkCreate.addToScope')}
        </Button>
      </div>
    </div>
  );
});

AddCheckContent.displayName = 'AcceptanceAddCheckContent';

export const openAddCheckModal = (props: AddCheckContentProps): ModalInstance =>
  createModal({
    content: <AddCheckContent {...props} />,
    footer: null,
    maskClosable: true,
    title: t('acceptance.checkCreate.title', { ns: 'verify' }),
    width: 'min(90vw, 560px)',
  });
