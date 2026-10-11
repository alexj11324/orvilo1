'use client';

import { Image, Markdown } from '@lobehub/ui';
import type {
  VerifyAgentPlanConfig,
  VerifyCheckItem,
  VerifyCodingScope,
  VerifyEvidenceType,
  VerifyRunOrigin,
  VerifySurface,
  VerifyVerdict,
} from '@orvilo/types';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  AudioLines,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDashed,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Globe,
  Image as ImageIcon,
  MessagesSquare,
  Monitor,
  RefreshCw,
  Smartphone,
  Terminal,
  Video,
  X,
} from 'lucide-react';
import { createElement, memo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import Loading from '@/components/Loading/BrandTextLoading';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import AudioPlayer from '@/features/AudioPlayer';
import type { VerifyEvidenceWithUrl } from '@/services/verify';

import { AcceptanceDrawer } from '../AcceptanceDrawer';
import { useVerifyReportBundle } from '../hooks';
import {
  buildCheckRows,
  type CheckRowData,
  type CheckState,
  extractUuid,
  renderableSurfaces,
} from '../utils';
import {
  EvidenceComparisonCard,
  type EvidenceComparisonMeta,
  isFilenameLike,
  meaningfulEvidenceCaption,
  readEvidenceComparison,
} from './EvidenceComparisonCard';
import InteractionCostPanel, { readInteractionCost } from './InteractionCost';
import {
  CollapsibleMarkdownEvidence,
  DocumentViewer,
  filenameFromUrl,
  markdownTextEvidenceTypes,
  rendersAsMarkdown,
} from './MarkdownEvidence';
import { readVisualizationManifest } from './visualization';
import { VisualizationRenderer } from './VisualizationRenderer';

const registeredStyles = createStaticStyles(({ css }) => ({
  prChip: css`
    /* Resting: number secondary, title tertiary, icon quaternary — a quiet chip.
       Hover lifts the WHOLE thing to the primary text color at once (a clearly
       perceptible emphasis, not a one-gray-step nudge), and never the global
       link-blue. Vars so number/title/icon rise together. */
    --pr-number-color: ${cssVar.colorTextSecondary};
    --pr-title-color: ${cssVar.colorTextTertiary};
    --pr-icon-color: ${cssVar.colorTextQuaternary};

    cursor: default;

    display: inline-flex;
    flex: 0 1 auto;
    gap: 6px;
    align-items: center;

    /* Owns its own line, so the title gets the full column before ellipsizing. */
    min-width: 0;
    max-width: 100%;

    font-size: 0.75rem;
    line-height: calc(20 / 12);
    color: var(--pr-number-color);
    text-decoration: none;

    transition: color var(--orvilo-motion-mid);

    &[data-link='true'] {
      cursor: pointer;
    }

    &[data-link='true']:hover {
      --pr-number-color: ${cssVar.colorText};
      --pr-title-color: ${cssVar.colorText};
      --pr-icon-color: ${cssVar.colorTextSecondary};

      /* Re-assert over the global \`a:hover\` link-blue — the chip's hover is a
         text-emphasis step, never a recolor. */
      color: var(--pr-number-color);
    }

    > svg:first-child {
      flex: 0 0 auto;
      color: var(--pr-icon-color);
      transition: color var(--orvilo-motion-mid);

      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
  prNumber: css`
    flex: 0 0 auto;
    color: var(--pr-number-color);
    transition: color var(--orvilo-motion-mid);

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
  prTitle: css`
    overflow: hidden;
    flex: 1 1 auto;

    min-width: 0;

    color: var(--pr-title-color);
    text-overflow: ellipsis;
    white-space: nowrap;

    transition: color var(--orvilo-motion-mid);

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
  originLink: css`
    cursor: pointer;
    color: ${cssVar.colorTextTertiary};
    text-decoration: none;

    &:hover {
      color: ${cssVar.colorLink};
    }

    &:hover svg {
      color: ${cssVar.colorLink};
    }
  `,
  evidenceFile: css`
    cursor: pointer;

    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 8px;
    align-items: center;

    width: min(100%, 520px);
    padding-block: 8px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    text-align: start;

    background: ${cssVar.colorFillQuaternary};

    &:hover {
      border-color: ${cssVar.colorLink};
      color: ${cssVar.colorLink};
    }
  `,
}));

const styles = {
  scroll: 'h-full w-full overflow-auto',
  page: 'mx-auto w-full max-w-240 px-4 pbs-8 pbe-16 [@media(width<=767px)]:pbs-4 [@media(width<=767px)]:[padding-block-end:calc(24px+env(safe-area-inset-bottom))] [@media(width<=767px)]:[overflow-wrap:anywhere]',
  heroLine: 'flex flex-wrap items-center gap-3',
  pill: 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs leading-5 font-semibold',
  summary: 'max-w-full text-sm leading-5.5 text-foreground',
  meta: 'mbs-1 flex flex-wrap gap-x-4 gap-y-2',
  metaItem:
    'inline-flex items-baseline gap-1.5 text-xs leading-5 text-foreground-tertiary [&_code]:font-mono [&_code]:text-xs [&_code]:leading-5 [&_code]:text-muted-foreground [&_code]:[word-break:break-word]',
  liveBanner:
    'mbs-1 inline-flex w-fit items-center gap-2 rounded-full border border-info-border bg-info-wash px-3 py-1.5 text-xs leading-5 text-info-text',
  codingScope: 'mbs-1 flex min-w-0 max-w-full flex-col gap-1.5',
  scopePullRequestLine: 'flex min-w-0 max-w-full',
  scopeMetaLine: 'flex min-w-0 max-w-full flex-wrap items-center gap-x-3.5 gap-y-1.5',
  branchChip:
    'inline-flex min-w-0 max-w-[min(360px,100%)] flex-[0_1_auto] items-center gap-1.5 text-foreground-tertiary [&_code]:min-w-0 [&_code]:truncate [&_code]:font-mono [&_code]:text-xs [&_code]:leading-5 [&_code]:text-muted-foreground [&_svg]:flex-none [&_svg]:text-foreground-quaternary',
  commitChip:
    'inline-flex flex-none items-center gap-1.5 text-foreground-tertiary [&_code]:font-mono [&_code]:text-xs [&_code]:leading-5 [&_code]:text-foreground-tertiary [&_svg]:flex-none [&_svg]:text-foreground-quaternary',
  prChip: registeredStyles.prChip,
  prNumber: registeredStyles.prNumber,
  prTitle: registeredStyles.prTitle,
  scopeMetaItem:
    'inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-5 text-foreground-tertiary [&_code]:min-w-0 [&_code]:truncate [&_code]:font-mono [&_code]:text-xs [&_code]:leading-5 [&_code]:text-muted-foreground [&_svg]:flex-none [&_svg]:text-foreground-quaternary',
  scopeEntry: 'max-w-65',
  originLink: registeredStyles.originLink,
  surfaceList: 'flex flex-wrap gap-1',
  surfaceChip:
    'inline-flex items-center gap-1 rounded-(--radius-chip) bg-muted px-1.5 py-0.5 text-xs leading-5 text-muted-foreground [&_svg]:text-foreground-tertiary',
  checks: 'mbs-6 overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  row: 'border-be border-divider last:border-be-0',
  rowHead:
    'grid w-full cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 border-0 bg-transparent px-4 py-3 text-start hover:bg-fill-quaternary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring/50 [@media(width<=767px)]:grid-cols-[16px_minmax(0,1fr)] [@media(width<=767px)]:gap-x-2 [@media(width<=767px)]:gap-y-1.5 [@media(width<=767px)]:p-3',
  rowTitle:
    'truncate text-sm leading-5.5 text-foreground data-[failed=true]:font-semibold [@media(width<=767px)]:whitespace-normal [@media(width<=767px)]:[overflow-wrap:anywhere]',
  rowSide:
    'flex items-center gap-2 [@media(width<=767px)]:col-start-2 [@media(width<=767px)]:flex-wrap',
  softTag:
    'rounded-(--radius-chip) bg-muted px-2 py-0.5 text-xs leading-5 text-foreground-tertiary',
  chev: 'text-foreground-quaternary transition-transform duration-(--orvilo-motion-mid) ease-[ease] data-[open=true]:rotate-90 motion-reduce:transition-none',
  rowBody: 'flex flex-col gap-3 ps-10 pe-4 pbs-0.5 pbe-4 [@media(width<=767px)]:px-3',
  reasoning: 'text-sm leading-5.5 text-muted-foreground',
  suggestion: 'border-s-2 border-border ps-2.5 text-sm leading-5.5 text-muted-foreground',
  planDetail:
    'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm leading-5.5 text-foreground-tertiary [@media(width<=767px)]:grid-cols-[minmax(0,1fr)] [@media(width<=767px)]:gap-1 [@media(width<=767px)]:text-muted-foreground',
  planDetailLabel: 'text-xs leading-5 whitespace-nowrap text-foreground-quaternary',
  notExecutedHint: 'text-sm leading-5.5 text-foreground-tertiary',
  narrative: 'mbs-6 [&:not([open])>:not(summary)]:hidden',
  narrativeSummary:
    'inline-flex cursor-pointer list-none items-center gap-1.5 text-xs leading-5 select-none text-foreground-tertiary [&::-webkit-details-marker]:hidden hover:text-foreground',
  narrativeBody: 'mbs-3 rounded-(--radius-card) border border-divider bg-card p-4',
  interactionCostBody: 'mbs-3',
  evidenceList: 'flex w-full flex-col items-start gap-1.5',
  evidenceFile: registeredStyles.evidenceFile,
  evidenceFileIcon: 'flex text-foreground-tertiary',
  evidenceFileBody: 'flex min-w-0 flex-col',
  evidenceFileName: 'truncate text-sm leading-5.5 text-foreground',
  evidenceFileDesc: 'mbs-0.5 truncate text-xs leading-5 text-foreground-tertiary',
  evidenceText:
    'max-h-50 overflow-auto rounded-(--radius-card) bg-fill-quaternary px-3 py-2 font-mono text-sm leading-5.5 whitespace-pre-wrap',
  evidenceVideo:
    'max-h-90 w-auto max-w-full self-start rounded-(--radius-card) border border-divider object-contain',
  evChip:
    'inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs leading-5 text-foreground-tertiary tabular-nums',
  evidenceDoc: 'flex min-h-0 w-full flex-1 overflow-hidden',
} as const;

const VERDICT_META: Record<
  CheckState,
  { bg: string; color: string; dot: string; icon: typeof Check; labelKey: string }
> = {
  failed: {
    bg: cssVar.colorErrorBg,
    color: cssVar.colorErrorText,
    dot: cssVar.colorError,
    icon: X,
    labelKey: 'report.verdict.failed',
  },
  not_executed: {
    bg: cssVar.colorFillTertiary,
    color: cssVar.colorTextTertiary,
    dot: cssVar.colorTextQuaternary,
    icon: CircleDashed,
    labelKey: 'report.verdict.notExecuted',
  },
  passed: {
    bg: cssVar.colorSuccessBg,
    color: cssVar.colorSuccessText,
    dot: cssVar.colorSuccess,
    icon: Check,
    labelKey: 'report.verdict.passed',
  },
  uncertain: {
    bg: cssVar.colorWarningBg,
    color: cssVar.colorWarningText,
    dot: cssVar.colorWarning,
    icon: CircleHelp,
    labelKey: 'report.verdict.uncertain',
  },
};

/** Each surface reads as a badge, so it needs a mark, not just a word. */
const SURFACE_ICON: Record<VerifySurface, typeof Check> = {
  bot: Bot,
  cli: Terminal,
  desktop: Monitor,
  mobile: Smartphone,
  web: Globe,
};

const imageEvidenceTypes = new Set(['gif', 'screenshot']);
/** Player media — a `<video>`/`<audio>` element, not an image box. */
const playerEvidenceTypes = new Set(['audio', 'video']);
/** Media that renders/plays inline in the check body, no click-to-open. */
const isInlineVisualEvidence = (evidence: VerifyEvidenceWithUrl) =>
  Boolean(
    evidence.fileUrl &&
    (imageEvidenceTypes.has(evidence.type) || playerEvidenceTypes.has(evidence.type)),
  );

/**
 * Evidence with a directly renderable payload in the check body, no
 * click-to-open. File-backed documents stay behind the file card on purpose —
 * an uploaded artifact is long by definition, and rendering it inline drowns
 * the check list.
 */
const isInlineEvidence = (evidence: VerifyEvidenceWithUrl) =>
  Boolean(evidence.content) || isInlineVisualEvidence(evidence);

/** Coarse attachment bucket for the type marker: image / video / audio / everything else. */
type EvidenceCategory = 'audio' | 'file' | 'image' | 'video';
const evidenceCategory = (type: VerifyEvidenceType): EvidenceCategory =>
  type === 'video'
    ? 'video'
    : type === 'audio'
      ? 'audio'
      : imageEvidenceTypes.has(type)
        ? 'image'
        : 'file';
const CATEGORY_ICON: Record<EvidenceCategory, typeof FileText> = {
  audio: AudioLines,
  file: FileText,
  image: ImageIcon,
  video: Video,
};
const CATEGORY_ORDER: EvidenceCategory[] = ['image', 'video', 'audio', 'file'];
// `errored` is terminal too (the verifier couldn't run) — stop polling and don't
// treat it as a live/in-progress status.
const terminalRunStatuses = new Set(['delivered', 'errored', 'failed', 'passed']);
const liveStatusLabelKey = {
  planned: 'report.status.planned',
  repairing: 'report.status.repairing',
  unverified: 'report.status.unverified',
  verifying: 'report.status.verifying',
} as const;

const evidenceDisplayName = (
  evidence: VerifyEvidenceWithUrl,
  t: TFunction<'verify'>,
  index: number,
) =>
  evidence.fileName ||
  (evidence.fileUrl ? filenameFromUrl(evidence.fileUrl) : '') ||
  evidence.description ||
  t('report.evidence.inlineFallback', { index });

type EvidenceComparison = EvidenceComparisonMeta;

const evidenceComparison = (evidence: VerifyEvidenceWithUrl): EvidenceComparison | null => {
  // Only inline media pairs — a text artifact can't sit in a visual diptych.
  if (!isInlineVisualEvidence(evidence)) return null;
  return readEvidenceComparison(evidence.metadata);
};

/** One evidence artifact rendered by its type: zoomable image/gif, video, doc, text. */
const EvidenceItem = memo<{
  evidence: VerifyEvidenceWithUrl;
  /** Inside a comparison card: the card frames the media, so no own border/radius/captions. */
  flat?: boolean;
  index: number;
}>(({ evidence: e, flat, index }) => {
  const { t } = useTranslation('verify');
  const label = evidenceDisplayName(e, t, index);
  const description = meaningfulEvidenceCaption(e.description, label);
  // Inline media (image/gif/video) speaks for itself — the raw filename header
  // is visual noise, so only keep a meaningful caption (description) for it.
  const isMedia = isInlineVisualEvidence(e);
  const isDocument = Boolean(e.fileUrl) && !isMedia && e.type !== 'audio';
  const isInlineProse = Boolean(e.content) && markdownTextEvidenceTypes.has(e.type);
  const hideLabel =
    isDocument ||
    isMedia ||
    (markdownTextEvidenceTypes.has(e.type) && isFilenameLike(label)) ||
    isInlineProse;

  return (
    <div
      className="flex flex-col gap-1.5"
      style={{ ...(isDocument ? { flex: 1, minHeight: 0 } : undefined) }}
    >
      {!hideLabel && <div className="font-semibold text-sm">{label}</div>}
      {description && !flat && !isInlineProse && (
        // Inline prose is excluded: its authored description becomes the fold
        // row's title below, so a standalone line here would say it twice.
        <div className="text-sm text-muted-foreground">{description}</div>
      )}
      {e.fileUrl && imageEvidenceTypes.has(e.type) ? (
        <div
          className="flex flex-col"
          style={{ alignItems: flat ? undefined : 'flex-start', maxWidth: '100%' }}
        >
          <Image
            preview
            alt={e.description ?? label}
            src={e.fileUrl}
            variant={flat ? 'borderless' : 'outlined'}
            style={
              flat ? { borderRadius: 0, maxWidth: '100%', width: '100%' } : { maxWidth: '100%' }
            }
          />
        </div>
      ) : e.fileUrl && e.type === 'video' ? (
        <video controls className={styles.evidenceVideo} src={e.fileUrl} />
      ) : e.fileUrl && e.type === 'audio' ? (
        // The same waveform player the conversation renders — one audio dialect
        // across the product, plus the download the reviewer needs to keep the
        // deliverable.
        <AudioPlayer
          fullWidth
          alt={e.description ?? label}
          downloadFileName={e.fileName ?? 'audio'}
          url={e.fileUrl}
        />
      ) : e.fileUrl ? (
        <div className={styles.evidenceDoc}>
          <DocumentViewer fileName={e.fileName} markdown={rendersAsMarkdown(e)} url={e.fileUrl} />
        </div>
      ) : e.content && markdownTextEvidenceTypes.has(e.type) ? (
        // Same dialect as the acceptance viewer: an authored alt/description
        // becomes the fold row's title, not a supplement line below it. The
        // raw description, not the caption filter — with no fileName the label
        // IS the description, and the filter would null it out.
        <CollapsibleMarkdownEvidence
          fileName={e.fileName}
          markdown={rendersAsMarkdown(e)}
          title={e.description?.trim() || e.fileName?.trim() || undefined}
        >
          {e.content}
        </CollapsibleMarkdownEvidence>
      ) : e.content ? (
        <div className={styles.evidenceText}>{e.content}</div>
      ) : (
        <span className={styles.softTag}>{e.type}</span>
      )}
    </div>
  );
});

const EvidenceFileButton = memo<{
  evidence: VerifyEvidenceWithUrl;
  index: number;
  onClick: () => void;
}>(({ evidence, index, onClick }) => {
  const { t } = useTranslation('verify');
  const name = evidenceDisplayName(evidence, t, index);
  const description =
    evidence.description && evidence.description !== name ? evidence.description : null;

  return (
    <button
      className={styles.evidenceFile}
      title={t('report.evidence.openDetail', { name })}
      type={'button'}
      onClick={onClick}
    >
      <span className={styles.evidenceFileIcon}>
        {createElement(CATEGORY_ICON[evidenceCategory(evidence.type)], { size: 16 })}
      </span>
      <span className={styles.evidenceFileBody}>
        <span className={styles.evidenceFileName}>{name}</span>
        {description && <span className={styles.evidenceFileDesc}>{description}</span>}
      </span>
    </button>
  );
});

EvidenceFileButton.displayName = 'EvidenceFileButton';

/** Right-side evidence gallery — one section per artifact, by type. */
const EvidenceDrawer = memo<{
  evidence: VerifyEvidenceWithUrl[];
  onClose: () => void;
  open: boolean;
  title: string;
}>(({ evidence, onClose, open, title }) => (
  <AcceptanceDrawer
    containerMaxWidth={'100%'}
    open={open}
    placement={'right'}
    title={title}
    width={'min(1120px, calc(100vw - 48px))'}
    styles={{
      bodyContent: {
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        padding: 0,
      },
    }}
    onClose={onClose}
  >
    <div
      className="flex flex-col gap-5 h-full"
      style={{ paddingBlock: 12, paddingInline: 16, overflow: 'auto' }}
    >
      {evidence.map((e, index) => (
        <EvidenceItem evidence={e} index={index + 1} key={e.id} />
      ))}
    </div>
  </AcceptanceDrawer>
));

EvidenceItem.displayName = 'EvidenceItem';

const EvidenceComparisonView = memo<{
  after: VerifyEvidenceWithUrl;
  before: VerifyEvidenceWithUrl;
}>(({ after, before }) => {
  // Either half may carry the layout; the `before` one wins so a pair can't
  // render as two different arrangements.
  const layout = evidenceComparison(before)?.layout ?? evidenceComparison(after)?.layout;

  // The band caption: an authored label wins; the evidence's own description is
  // the natural fallback so a pair never renders as two bare role words — but a
  // default filename description is noise, not a caption.
  const side = (evidence: VerifyEvidenceWithUrl, index: number) => ({
    caption:
      evidenceComparison(evidence)?.label ??
      (isFilenameLike(evidence.description) ? undefined : (evidence.description ?? undefined)),
    content: <EvidenceItem flat evidence={evidence} index={index} />,
  });

  return <EvidenceComparisonCard after={side(after, 2)} before={side(before, 1)} layout={layout} />;
});

EvidenceComparisonView.displayName = 'EvidenceComparisonView';

EvidenceDrawer.displayName = 'EvidenceDrawer';

/** One check — an expandable row; evidence opens one artifact at a time. */
const CheckRow = memo<{ defaultOpen: boolean; row: CheckRowData }>(({ defaultOpen, row }) => {
  const { t } = useTranslation('verify');
  const { planItem, result, state } = row;
  const [open, setOpen] = useState(defaultOpen);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const meta = VERDICT_META[state];
  const evidence = result?.evidence ?? [];
  const evidenceCount = evidence.length;
  const visualization = readVisualizationManifest(result?.metadata);
  // An agent-authored plan item records how it meant to check this and what it
  // expected to see (prose), plus the evidence media it is required to produce
  // (a closed set the executor's coverage gate enforces).
  const planConfig = (planItem?.verifierConfig ?? {}) as VerifyAgentPlanConfig;
  const requiredEvidence = planConfig.requiredEvidence ?? [];
  const categoryCounts = evidence.reduce(
    (acc, e) => {
      acc[evidenceCategory(e.type)] += 1;
      return acc;
    },
    { audio: 0, file: 0, image: 0, video: 0 } as Record<EvidenceCategory, number>,
  );
  // `required` lives on the result when there is one, on the plan item otherwise
  // — a check that never ran still knows whether it was optional.
  const required = result?.required ?? planItem?.required ?? true;
  const hasBody =
    Boolean(result?.toulmin?.evidence) ||
    Boolean(result?.suggestion) ||
    Boolean(visualization) ||
    Boolean(planConfig.method) ||
    Boolean(planConfig.expected) ||
    requiredEvidence.length > 0 ||
    state === 'not_executed' ||
    evidenceCount > 0;
  const selectedEvidenceIndex = selectedEvidenceId
    ? evidence.findIndex((e) => e.id === selectedEvidenceId)
    : -1;
  const selectedEvidence = selectedEvidenceIndex >= 0 ? evidence[selectedEvidenceIndex] : null;
  const comparisonGroups = new Map<
    string,
    Partial<Record<'after' | 'before', VerifyEvidenceWithUrl>>
  >();
  for (const item of evidence) {
    const comparison = evidenceComparison(item);
    if (!comparison) continue;
    const group = comparisonGroups.get(comparison.id) ?? {};
    group[comparison.role] = item;
    comparisonGroups.set(comparison.id, group);
  }
  const pairedEvidenceIds = new Set(
    [...comparisonGroups.values()]
      .filter((group) => group.before && group.after)
      .flatMap((group) => [group.before!.id, group.after!.id]),
  );

  return (
    <div className={styles.row}>
      <button
        aria-expanded={hasBody ? open : undefined}
        className={styles.rowHead}
        type={'button'}
        onClick={() => hasBody && setOpen((o) => !o)}
      >
        <span style={{ color: meta.dot, display: 'flex' }}>
          <meta.icon size={16} />
        </span>
        <span className={styles.rowTitle} data-failed={state === 'failed'}>
          {result?.checkItemTitle || planItem?.title || row.id}
        </span>
        <span className={styles.rowSide}>
          {CATEGORY_ORDER.map((cat) =>
            categoryCounts[cat] > 0 ? (
              <span
                className={styles.evChip}
                key={cat}
                title={`${t(`report.evidence.category.${cat}`)} × ${categoryCounts[cat]}`}
              >
                {createElement(CATEGORY_ICON[cat], { size: 16 })}
                {categoryCounts[cat]}
              </span>
            ) : null,
          )}
          {state === 'not_executed' && (
            <span className={styles.softTag}>{t('report.verdict.notExecuted')}</span>
          )}
          {!required && <span className={styles.softTag}>{t('report.check.optional')}</span>}
          {hasBody && <ChevronRight className={styles.chev} data-open={open} size={16} />}
        </span>
      </button>
      {open && hasBody && (
        <div className={styles.rowBody}>
          {(planConfig.method || planConfig.expected || requiredEvidence.length > 0) && (
            <div className={styles.planDetail}>
              {planConfig.method && (
                <>
                  <span className={styles.planDetailLabel}>{t('report.plan.method')}</span>
                  <span>{planConfig.method}</span>
                </>
              )}
              {planConfig.expected && (
                <>
                  <span className={styles.planDetailLabel}>{t('report.plan.expected')}</span>
                  <span>{planConfig.expected}</span>
                </>
              )}
              {/* The media this item is *required* to produce. Not decoration: a
                  missing one fails the item through the executor's coverage gate,
                  so a reader can see what the check was contractually owed. */}
              {requiredEvidence.length > 0 && (
                <>
                  <span className={styles.planDetailLabel}>
                    {t('report.plan.requiredEvidence')}
                  </span>
                  <span className={styles.surfaceList}>
                    {requiredEvidence.map((spec) => (
                      <span className={styles.surfaceChip} key={spec.type} title={spec.hint}>
                        {createElement(CATEGORY_ICON[evidenceCategory(spec.type)], { size: 16 })}
                        {t(`report.evidence.medium.${spec.type}`)}
                      </span>
                    ))}
                  </span>
                </>
              )}
            </div>
          )}
          {state === 'not_executed' && (
            <p className={styles.notExecutedHint}>{t('report.plan.notExecutedHint')}</p>
          )}
          {result?.toulmin?.evidence && (
            <p className={styles.reasoning}>{result.toulmin.evidence}</p>
          )}
          {result?.suggestion && <p className={styles.suggestion}>{result.suggestion}</p>}
          {visualization && <VisualizationRenderer manifest={visualization} />}
          {evidenceCount > 0 && (
            <>
              <div className={styles.evidenceList}>
                {[...comparisonGroups.entries()].map(([id, group]) =>
                  group.before && group.after ? (
                    <EvidenceComparisonView after={group.after} before={group.before} key={id} />
                  ) : null,
                )}
                {evidence.map((e, index) =>
                  pairedEvidenceIds.has(e.id) ? null : isInlineEvidence(e) ? (
                    <EvidenceItem evidence={e} index={index + 1} key={e.id} />
                  ) : (
                    <EvidenceFileButton
                      evidence={e}
                      index={index + 1}
                      key={e.id}
                      onClick={() => setSelectedEvidenceId(e.id)}
                    />
                  ),
                )}
              </div>
              {selectedEvidence && (
                <EvidenceDrawer
                  evidence={[selectedEvidence]}
                  open={Boolean(selectedEvidence)}
                  title={evidenceDisplayName(selectedEvidence, t, selectedEvidenceIndex + 1)}
                  onClose={() => setSelectedEvidenceId(null)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

CheckRow.displayName = 'CheckRow';

const ReportPageState = memo<{
  action?: ReactNode;
  description: string;
  icon: typeof AlertTriangle;
  title: string;
}>(({ action, description, icon, title }) => (
  <div
    className="flex items-center justify-center flex-col gap-4 h-full w-full"
    style={{ minHeight: '70vh' }}
  >
    <Empty>
      <EmptyHeader>
        {icon ? (
          <EmptyMedia variant={'icon'}>{createElement(icon, { size: 20 })}</EmptyMedia>
        ) : null}
        {title ? <EmptyTitle>{title}</EmptyTitle> : null}
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
    {action}
  </div>
));

const formatScopeDate = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatAbsoluteDateTime(date);
};

const safeWebUrl = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const pullRequestLabel = (
  pullRequest: NonNullable<VerifyCodingScope['pullRequest']>,
  t: TFunction<'verify'>,
) => {
  if (pullRequest.number === undefined || pullRequest.number === null)
    return t('report.scope.pullRequest');

  return t('report.scope.pullRequestNumber', {
    number: String(pullRequest.number).replace(/^#/, ''),
  });
};

/**
 * One line of provenance: the PR, the code, when, and where it ran. Reference
 * material — the reader scans it to place the report, then moves on — so it
 * stays subordinate to the verdict and the summary above it, and never grows
 * into a stack of labelled rows.
 */
const CodingScopeCard = memo<{
  context: VerifyCodingScope | null | undefined;
  origin?: VerifyRunOrigin;
}>(({ context, origin }) => {
  const { t } = useTranslation('verify');
  if (!context) return null;

  const { branch, commit, entry, pullRequest, testedAt } = context;
  const hasPullRequest = Boolean(
    pullRequest && (pullRequest.number !== undefined || pullRequest.title || pullRequest.url),
  );
  const date = formatScopeDate(testedAt);
  const surfaces = renderableSurfaces(context.surfaces);
  const originTopicId = origin?.topicId;
  const hasScope =
    Boolean(branch) ||
    Boolean(commit) ||
    Boolean(entry) ||
    hasPullRequest ||
    surfaces.length > 0 ||
    Boolean(date) ||
    Boolean(originTopicId);

  if (!hasScope) return null;

  const pullRequestUrl = safeWebUrl(pullRequest?.url);
  const pullRequestContent =
    hasPullRequest && pullRequest ? (
      <>
        <GitPullRequest size={16} />
        <span className={styles.prNumber}>{pullRequestLabel(pullRequest, t)}</span>
        {pullRequest.title && <span className={styles.prTitle}>{pullRequest.title}</span>}
        {pullRequestUrl && <ExternalLink size={16} />}
      </>
    ) : null;
  const shortCommit = commit && commit.length > 12 ? commit.slice(0, 10) : commit;

  return (
    <div className={styles.codingScope}>
      {pullRequestContent && (
        <div className={styles.scopePullRequestLine}>
          {pullRequestUrl ? (
            <a
              className={styles.prChip}
              data-link={true}
              href={pullRequestUrl}
              rel="noreferrer"
              target="_blank"
              title={pullRequest?.title ?? pullRequestUrl}
            >
              {pullRequestContent}
            </a>
          ) : (
            <span className={styles.prChip} title={pullRequest?.title}>
              {pullRequestContent}
            </span>
          )}
        </div>
      )}

      <div className={styles.scopeMetaLine}>
        {branch && (
          <span className={styles.branchChip} title={branch}>
            <GitBranch size={16} />
            <code>{branch}</code>
          </span>
        )}
        {commit && (
          <span className={styles.commitChip} title={commit}>
            <GitCommit size={16} />
            <code>{shortCommit}</code>
          </span>
        )}
        {date && (
          <span className={styles.scopeMetaItem}>
            <CalendarClock size={16} />
            <span>{date}</span>
          </span>
        )}
        {surfaces.length > 0 && (
          <span className={styles.surfaceList}>
            {surfaces.map((surface) => (
              <span className={styles.surfaceChip} key={surface}>
                {createElement(SURFACE_ICON[surface], { size: 16 })}
                {t(`report.surface.${surface}`)}
              </span>
            ))}
          </span>
        )}
        {entry && (
          <span className={cx(styles.scopeMetaItem, styles.scopeEntry)} title={entry}>
            <Terminal size={16} />
            <code>{entry}</code>
          </span>
        )}
        {/* Only ever rendered for the report's author — the server redacts `origin`
            from a bundle fetched by anyone else holding the shared link. */}
        {originTopicId && (
          <a
            className={cx(styles.scopeMetaItem, styles.originLink)}
            href={`/chat?topic=${originTopicId}`}
            rel="noreferrer"
            target="_blank"
            title={t('report.scope.origin')}
          >
            <MessagesSquare size={16} />
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  );
});

CodingScopeCard.displayName = 'CodingScopeCard';

/**
 * The report detail pane. Renders the verdict hero,
 * every check as a severity-ordered expandable row (failed rows open by default),
 * and the full narrative behind a collapsed disclosure. Addressed by `:runId`;
 * refreshes itself while the run is non-terminal.
 */
interface ReportViewerProps {
  runId?: string;
}

const ReportViewer = memo<ReportViewerProps>(({ runId: explicitRunId }) => {
  const { t } = useTranslation('verify');
  const { runId: routeRunId } = useParams<{ runId: string }>();
  // Route params come from shared links whose autolinker may have glued
  // trailing punctuation onto the id — salvage the leading UUID.
  const verifyRunId = explicitRunId ?? extractUuid(routeRunId) ?? null;
  const { data, error, isLoading, mutate } = useVerifyReportBundle(verifyRunId);

  useEffect(() => {
    const status = data?.run.status;
    if (!status || terminalRunStatuses.has(status)) return;
    const timer = window.setInterval(() => void mutate(), 5000);
    return () => window.clearInterval(timer);
  }, [data?.run.status, mutate]);

  const ordered = useMemo(() => {
    if (!data) return [];
    return buildCheckRows((data.run.plan as VerifyCheckItem[] | null) ?? null, data.results);
  }, [data]);

  if (!verifyRunId) {
    return (
      <ReportPageState
        description={t('report.missing.description')}
        icon={AlertTriangle}
        title={t('report.missing.title')}
      />
    );
  }
  if (isLoading) return <Loading debugId="verify-report-viewer" />;
  if (error) {
    return (
      <ReportPageState
        description={t('report.error.description')}
        icon={X}
        title={t('report.error.title')}
        action={
          <Button size="lg" type="button" onClick={() => void mutate()}>
            <RefreshCw size={16} />
            {t('report.actions.retry')}
          </Button>
        }
      />
    );
  }
  if (!data) {
    return (
      <ReportPageState
        description={t('report.notFound.description')}
        icon={FileText}
        title={t('report.notFound.title')}
      />
    );
  }

  const { run, report } = data;
  const liveStatus =
    run.status && !terminalRunStatuses.has(run.status)
      ? (run.status as keyof typeof liveStatusLabelKey)
      : null;

  const verdict = (report?.verdict as VerifyVerdict | null) ?? null;
  // The verdict-filter bar is gone, so every row of the round renders. The
  // per-verdict tallies went with it: they existed to label its chips, and the
  // verdict pill above already states the round's outcome.
  const visible = ordered;
  const isCodingReport = run.scenario === 'coding';
  const interactionCost = readInteractionCost(run.metadata);
  // The server strips `origin` for anyone but the author; `isOwner` keeps the
  // affordance off the page for a visitor even if that ever regressed.
  const origin = data.isOwner ? run.metadata?.origin : undefined;

  return (
    <div className={styles.scroll}>
      <div className={styles.page}>
        <main>
          <div className="flex flex-col gap-3">
            {/* Verdict above the title, not trailing it — the same order the
                acceptance page uses. A badge parked after a long title wraps
                to its own line anyway, and then reads as an afterthought
                rather than as the report's headline state. */}
            {verdict && (
              <div className={styles.heroLine} style={{ marginBlockEnd: 2 }}>
                <span
                  className={styles.pill}
                  style={{
                    background: VERDICT_META[verdict].bg,
                    color: VERDICT_META[verdict].color,
                  }}
                >
                  {createElement(VERDICT_META[verdict].icon, { size: 16 })}
                  {t(`report.verdict.${verdict}`)}
                </span>
              </div>
            )}
            <h1 className="m-0 text-2xl font-semibold">{run.title || t('report.titleFallback')}</h1>

            {!isCodingReport && run.goal && <div className={cn(styles.summary)}>{run.goal}</div>}
            {report?.summary && <div className={cn(styles.summary)}>{report.summary}</div>}

            {isCodingReport && (
              <CodingScopeCard
                context={run.context as VerifyCodingScope | null | undefined}
                origin={origin}
              />
            )}

            {liveStatus && (
              <div className={styles.liveBanner}>
                <Clock3 size={16} />
                {t(liveStatusLabelKey[liveStatus])}
              </div>
            )}
          </div>

          {visible.length > 0 ? (
            <div className={styles.checks}>
              {visible.map((row) => (
                /* Every row opens. A report is read to see what was actually
                   observed, and a page of collapsed titles makes the reader
                   click N times to learn that. */
                <CheckRow defaultOpen key={row.id} row={row} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center" style={{ padding: 24 }}>
              <div className="text-muted-foreground">{t('report.filterEmpty')}</div>
            </div>
          )}

          {report?.content && (
            <details className={styles.narrative}>
              <summary className={styles.narrativeSummary}>
                <ChevronRight size={16} />
                {t('report.sections.details')}
              </summary>
              <div className={styles.narrativeBody}>
                <Markdown fontSize={14} lineHeight={22 / 14}>
                  {report.content}
                </Markdown>
              </div>
            </details>
          )}

          {interactionCost && (
            <details className={styles.narrative}>
              <summary className={styles.narrativeSummary}>
                <ChevronRight size={16} />
                {t('report.interaction.title')}
              </summary>
              <div className={styles.interactionCostBody}>
                <InteractionCostPanel cost={interactionCost} />
              </div>
            </details>
          )}
        </main>
      </div>
    </div>
  );
});

export default ReportViewer;
