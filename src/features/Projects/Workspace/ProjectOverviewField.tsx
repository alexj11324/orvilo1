import { Input } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BODY_TEXT_COLOR } from '@/features/Projects/sectionLabel';

const styles = createStaticStyles(({ css, cssVar }) => ({
  input: css`
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 2px;

    background: transparent;
    box-shadow: none;

    &:focus-visible {
      outline: 1px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
  error: css`
    font-size: 12px;
    color: ${cssVar.colorError};
  `,
}));

interface ProjectOverviewFieldProps {
  kind: 'name' | 'summary';
  onSave: (value: string) => Promise<unknown>;
  value: string;
}

export function ProjectOverviewField({ kind, onSave, value }: ProjectOverviewFieldProps) {
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
    if (draft === undefined || pending.current) return;
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
      <Input
        aria-busy={saving || undefined}
        aria-invalid={failed || undefined}
        aria-label={t(kind === 'name' ? 'rename.nameLabel' : 'overview.projectSummary')}
        className={styles.input}
        maxLength={kind === 'name' ? 255 : 280}
        placeholder={kind === 'summary' ? t('create.summaryPlaceholder') : undefined}
        readOnly={saving}
        value={draft ?? value}
        style={{
          color: kind === 'name' ? undefined : BODY_TEXT_COLOR,
          fontSize: kind === 'name' ? 24 : 15,
          fontWeight: kind === 'name' ? 600 : 450,
          height: kind === 'name' ? 32 : 24,
        }}
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
