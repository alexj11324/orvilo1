import { createStaticStyles, cssVar } from 'antd-style';
import { type ComponentProps, memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getTaskVisibilityDefaultLabel,
  getTaskVisibilityLabelKey,
  TASK_VISIBILITY_ICONS,
} from './taskVisibilityLabel';

const styles = createStaticStyles(({ css, cssVar }) => ({
  chip: css`
    cursor: pointer;

    display: flex;
    align-items: center;

    padding-block: 4px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface TaskVisibilityChipLabelProps extends Omit<ComponentProps<'div'>, 'children' | 'variant'> {
  /** Render mode: 'chip' shows the [icon + text] pill used in create forms;
   *  'tag' shows a tighter [icon + text] used in the detail panel. They only
   *  differ in spacing. */
  variant?: 'chip' | 'tag';
  visibility: 'private' | 'public';
}

/**
 * Shared chip body for the visibility tag: lock/users icon + localized label.
 * Three call sites (`CreateTaskContent`, `CreateTaskInlineEntry`,
 * `TaskProperties`) used to inline this same JSX; centralizing keeps the
 * icon/label mapping in one place when we add new visibility values later.
 *
 * Extra props and `ref` are forwarded to the underlying `div` so that when
 * this component is used as the `DropdownMenu` trigger inside
 * `TaskVisibilityTag`, the menu's click/aria/ref props reach a real DOM node.
 */
const TaskVisibilityChipLabel = memo<TaskVisibilityChipLabelProps>(
  ({ variant = 'chip', visibility, ...rest }) => {
    const { t } = useTranslation('chat');
    const IconComp = TASK_VISIBILITY_ICONS[visibility];
    const label = t(getTaskVisibilityLabelKey(visibility) as never, {
      defaultValue: getTaskVisibilityDefaultLabel(visibility),
    });

    const iconColor = variant === 'tag' ? cssVar.colorTextSecondary : cssVar.colorTextDescription;
    const iconSize = variant === 'tag' ? 16 : 14;

    return (
      <div className={styles.chip} style={{ gap: variant === 'tag' ? 10 : 6 }} {...rest}>
        <IconComp color={iconColor} size={iconSize} />
        {variant === 'tag' ? (
          <div className="font-medium">{label}</div>
        ) : (
          <div className="text-[12px]">{label}</div>
        )}
      </div>
    );
  },
);

TaskVisibilityChipLabel.displayName = 'TaskVisibilityChipLabel';

export default TaskVisibilityChipLabel;
