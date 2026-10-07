import { RENDERER_HANDLED_LINK_ATTR } from '@orvilo/desktop-bridge';
import { createStaticStyles } from 'antd-style';
import {
  CircleHelpIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { validateDescriptionReferenceNode } from '@/libs/editor/descriptionReference';
import { useFetchDescriptionReference } from '@/store/task/descriptionReference';
import { isModifierClick } from '@/utils/navigation';

export const descriptionReferenceStyles = createStaticStyles(({ css, cssVar }) => ({
  editor: css`
    [data-schema-link='true'] {
      display: inline;
    }
  `,
  chip: css`
    cursor: default;

    display: inline;

    padding-block: 0.1em;
    padding-inline: 0.2em 0.3em;
    border: 0.5px solid ${cssVar.colorBorderSecondary};
    border-radius: 4px;

    font: inherit;
    line-height: inherit;
    color: ${cssVar.colorText};
    text-decoration: none;
    white-space: normal;

    background: ${cssVar.colorFillQuaternary};
    box-decoration-break: clone;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
  icon: css`
    white-space: nowrap;

    svg {
      display: inline-block;
      vertical-align: -0.125em;
    }
  `,
  title: css`
    white-space: pre-wrap;
  `,
}));

export const DescriptionReferenceChip = ({ referenceNode }: { referenceNode: unknown }) => {
  const { t } = useTranslation(['chat', 'common']);
  const appOrigin = useAppOrigin();
  const reference = validateDescriptionReferenceNode(referenceNode, appOrigin);
  const { data, error, isLoading } = useFetchDescriptionReference(reference, appOrigin);
  // A denied background read must hide previously authorized cached preview data.
  const metadata = !error && reference ? data : undefined;
  const category = metadata?.kind === 'issue' ? metadata.workflowCategory : undefined;
  const issueVisual = category ? WORKFLOW_CATEGORY_VISUALS[category] : undefined;
  const pr = metadata?.kind === 'pull-request' ? metadata : undefined;
  const Icon =
    issueVisual?.icon ??
    (pr?.state === 'MERGED'
      ? GitPullRequestArrowIcon
      : pr?.state === 'CLOSED'
        ? GitPullRequestClosedIcon
        : pr?.state === 'OPEN'
          ? pr.isDraft
            ? GitPullRequestDraftIcon
            : GitPullRequestIcon
          : CircleHelpIcon);
  const state = metadata ? 'ready' : isLoading ? 'loading' : 'unavailable';
  const title =
    metadata?.title ?? t(`taskDetail.reference.${state === 'loading' ? 'loading' : 'unavailable'}`);
  const status = category
    ? t(`taskDetail.workflow.category.${category}`)
    : pr?.state
      ? t(
          `common:reviews.state.${pr.isDraft && pr.state === 'OPEN' ? 'draft' : pr.state.toLowerCase()}` as never,
        )
      : undefined;
  const content = (
    <>
      <span className={descriptionReferenceStyles.icon}>
        <Icon aria-hidden size={15} />
        {'\u00A0'}
      </span>
      <span className={descriptionReferenceStyles.title}>{title}</span>
    </>
  );

  // A known safe PR URL stays openable even when the viewer has not connected
  // GitHub; metadata failure never substitutes a saved title or status.
  if (!reference || (!metadata && reference.kind !== 'pull-request')) {
    return (
      <span className={descriptionReferenceStyles.chip} data-reference-state={state}>
        {content}
      </span>
    );
  }
  return (
    <a
      {...(reference.kind === 'issue' ? { [RENDERER_HANDLED_LINK_ATTR]: 'true' } : {})}
      aria-label={status ? `${title} (${status})` : title}
      className={descriptionReferenceStyles.chip}
      data-description-reference-kind={reference.kind}
      data-reference-state={state}
      href={reference.url}
      rel={reference.kind === 'pull-request' ? 'noopener noreferrer' : undefined}
      target={reference.kind === 'pull-request' ? '_blank' : undefined}
      title={status}
      onClick={(event) => {
        event.stopPropagation();
        if (reference.kind === 'issue' && !isModifierClick(event)) {
          event.preventDefault();
          appNavigate(new URL(reference.url).pathname, { escape: true });
        }
      }}
    >
      {content}
    </a>
  );
};
