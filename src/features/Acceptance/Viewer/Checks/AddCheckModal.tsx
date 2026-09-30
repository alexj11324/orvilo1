'use client';

import {
  Button,
  createModal,
  type ModalInstance,
  Select,
  Text,
  useModalContext,
} from '@lobehub/ui/base-ui';
import type { AcceptanceChecklistItem } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { t } from 'i18next';
import { Check, CircleDashed, Plus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
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
            <Text fontSize={12} type={'secondary'}>
              {tv('acceptance.tray.editModal.nameLabel')}
            </Text>
            <Input
              placeholder={tv('acceptance.tray.editModal.namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Text fontSize={12} type={'secondary'}>
              {tv('acceptance.tray.editModal.methodLabel')}
            </Text>
            <Textarea
              placeholder={tv('acceptance.tray.editModal.methodPlaceholder')}
              rows={2}
              style={{ maxHeight: '4lh' }}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <Text fontSize={12} type={'secondary'}>
              {tv('or', { ns: 'common' })}
            </Text>
            <Button size={'small'} type={'text'} onClick={() => setMode('rubric')}>
              {tv('acceptance.checkCreate.rubric')}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Button
            size={'small'}
            style={{ alignSelf: 'flex-start' }}
            type={'text'}
            onClick={() => setMode('manual')}
          >
            {tv('acceptance.checkCreate.manual')}
          </Button>
          <Select
            loading={rubricsLoading}
            options={(rubrics ?? []).map((rubric) => ({ label: rubric.title, value: rubric.id }))}
            placeholder={tv('acceptance.checkCreate.selectRubric')}
            value={rubricId}
            onChange={(value) => {
              setRubricId(value);
              setSelectedIds(new Set());
            }}
          />
          {rubricId && (
            <div className="flex flex-col gap-1">
              {criteriaLoading ? (
                <Text type={'secondary'}>{tv('acceptance.checkCreate.loading')}</Text>
              ) : availableCriteria.length === 0 ? (
                <Text type={'secondary'}>{tv('acceptance.checkCreate.empty')}</Text>
              ) : (
                availableCriteria.map((criterion) => {
                  const selected = selectedIds.has(criterion.id);
                  return (
                    <Button
                      key={criterion.id}
                      style={{ height: 'auto', justifyContent: 'flex-start', padding: 10 }}
                      type={selected ? 'primary' : 'default'}
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
                          <Text>{criterion.title}</Text>
                          {criterion.description && (
                            <Text fontSize={12} type={'secondary'}>
                              {criterion.description}
                            </Text>
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
      <div
        className="flex flex-col gap-1.5"
        style={{
          padding: 12,
          background: cssVar.colorFillQuaternary,
          border: `1px solid ${cssVar.colorBorderSecondary}`,
          borderRadius: 8,
        }}
      >
        <div className="flex items-center gap-1.5">
          <CircleDashed size={14} />
          <Text fontSize={12} type={'secondary'}>
            {tv('acceptance.checkCreate.previewState')}
          </Text>
        </div>
        <Text strong>
          {mode === 'manual'
            ? name.trim() || tv('acceptance.checkCreate.previewTitle')
            : tv('acceptance.checkCreate.selectedCount', { count: selectedIds.size })}
        </Text>
        {mode === 'manual' && method.trim() && (
          <Text fontSize={12} type={'secondary'}>
            {method.trim()}
          </Text>
        )}
        <Text fontSize={12} type={'secondary'}>
          {tv('acceptance.checkCreate.previewHint')}
        </Text>
      </div>
      <div className="flex gap-2 justify-end">
        <Button disabled={saving} onClick={close}>
          {tv('acceptance.actions.cancel')}
        </Button>
        <Button
          disabled={!canSave || saving}
          loading={saving}
          type={'primary'}
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
