'use client';

import { Select, toast } from '@lobehub/ui/base-ui';
import { TagIcon } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { useProjectStore } from '@/store/project';

export interface ProjectLabelPickerProps {
  className?: string;
  disabled?: boolean;
  /** Forwarded onto the Select so a wrapping `<label htmlFor>` keeps working. */
  id?: string;
  /**
   * Controlled selection — the label ids currently bound to the project.
   * The picker saves through `updateProject({ labelIds })` on change.
   */
  labelIds: readonly string[];
  /**
   * Fallback option list used until the workspace label query resolves
   * (typically `detail.labels`). Keeps selected names renderable offline.
   */
  labels?: readonly { id: string; name: string }[];
  /** Extra hook fired after a successful save (e.g. detail revalidation). */
  onSaved?: (labelIds: string[]) => void;
  placeholder?: string;
  projectId: string;
}

/**
 * Self-contained Linear-parity label picker: a searchable multi-select bound
 * to the workspace project-label list (`project.labels`) and the real
 * mutation (`project.update { labelIds }`). Extracted from the project
 * properties rail so any surface — properties card, create modal, future
 * issue properties — mounts the same control instead of re-wiring the query
 * and save path.
 *
 * Scope note: this binds *project* labels. Task/issue labels have no schema
 * or endpoints yet; when they land, a `TaskLabelPicker` can mirror this shape
 * against the task endpoints.
 */
const ProjectLabelPicker = memo<ProjectLabelPickerProps>(
  ({ className, disabled, id, labelIds, labels, onSaved, placeholder, projectId }) => {
    const { t } = useTranslation('project');
    const query = useProjectStore((s) => s.useFetchProjectLabels)();
    const update = useProjectStore((s) => s.updateProject);
    const lock = useRef(false);
    const [saving, setSaving] = useState(false);

    if (query.error && !query.data)
      return (
        <AsyncError error={query.error} variant="inline" onRetry={() => void query.mutate()} />
      );

    const options = query.data?.data ?? labels ?? [];

    const save = async (value: string[]) => {
      if (lock.current) return;
      lock.current = true;
      setSaving(true);
      try {
        await update(projectId, { labelIds: value });
        onSaved?.(value);
      } catch (error) {
        console.error('Failed to update project labels', error);
        toast.error(t('properties.saveError'));
      } finally {
        lock.current = false;
        setSaving(false);
      }
    };

    return (
      <Select
        showSearch
        className={className}
        disabled={disabled || saving || query.isLoading}
        id={id}
        loading={saving || query.isLoading}
        mode="multiple"
        options={options.map((label) => ({ label: label.name, value: label.id }))}
        placeholder={placeholder}
        popupMatchSelectWidth={false}
        prefix={TagIcon}
        size="small"
        suffixIcon={null}
        value={[...labelIds]}
        onChange={(value) => {
          if (Array.isArray(value)) void save(value);
        }}
      />
    );
  },
);

ProjectLabelPicker.displayName = 'ProjectLabelPicker';

export default ProjectLabelPicker;
