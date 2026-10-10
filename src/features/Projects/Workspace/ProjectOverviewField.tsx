import { cn } from 'cn';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';

const styles = {
  input:
    'w-full rounded-(--radius-input) border-0 bg-transparent p-0 shadow-none focus-visible:outline-1 focus-visible:outline-primary focus-visible:outline-offset-2',
  error: 'text-xs leading-5 text-destructive-text',
};

interface ProjectOverviewFieldProps {
  canEdit?: boolean;
  kind: 'name' | 'summary';
  onSave: (value: string) => Promise<unknown>;
  value: string;
}

export function ProjectOverviewField({
  canEdit = false,
  kind,
  onSave,
  value,
}: ProjectOverviewFieldProps) {
  const { t } = useTranslation('project');
  const [draft, setDraft] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancelBlur = useRef(false);
  const pending = useRef(false);
  const save = async () => {
    if (cancelBlur.current) {
      cancelBlur.current = false;
      return;
    }
    if (!canEdit || draft === undefined || pending.current) return;
    const next = kind === 'name' ? draft.trim() : draft;
    if ((kind === 'name' && !next) || next === value) {
      setDraft(undefined);
      setFailed(false);
      return;
    }
    pending.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await onSave(next);
      setDraft(undefined);
    } catch (error) {
      console.error('Failed to save project overview field', error);
      setFailed(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <div>
      {/* Inline-edit heading: no field chrome until focused, like the issue title. */}
      <Input
        aria-busy={saving || undefined}
        aria-invalid={failed || undefined}
        aria-label={t(kind === 'name' ? 'rename.nameLabel' : 'overview.projectSummary')}
        maxLength={kind === 'name' ? 255 : 280}

        placeholder={kind === 'summary' ? t('create.summaryPlaceholder') : undefined}
        readOnly={saving || !canEdit}
        value={draft ?? value}
        visualSize="normal"
        className={cn(
          styles.input,
          'border-0 px-0 shadow-none focus-visible:ring-0 dark:bg-transparent',
          kind === 'name'
            ? 'text-2xl leading-8 font-semibold md:text-2xl'
            : 'text-sm leading-5.5 font-normal md:text-sm',
        )}
        onBlur={() => void save()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelBlur.current = true;
            setDraft(undefined);
            setFailed(false);
            event.currentTarget.blur();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {failed && (
        <div className={styles.error} role="alert">
          {t('overview.fieldSaveError')}
        </div>
      )}
    </div>
  );
}
