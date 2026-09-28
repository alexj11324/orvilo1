import { type TFunction } from 'i18next';

/**
 * Section labels per polarity: `bad` writes wrong/why/breaks/correct, `good` good/works/dont,
 * `rule` rule/why/how/limits. One map covers all three so every surface labels them the same.
 */
export const LESSON_SECTION_LABELS = {
  breaks: 'rules.section.breaks',
  correct: 'rules.section.correct',
  dont: 'rules.section.dont',
  good: 'rules.section.good',
  how: 'rules.section.how',
  limits: 'rules.section.limits',
  rule: 'rules.section.rule',
  why: 'rules.section.why',
  works: 'rules.section.works',
  wrong: 'rules.section.wrong',
} as const;

export type LessonSectionKey = keyof typeof LESSON_SECTION_LABELS;

/** `undefined` for a section key no polarity declares; callers fall back to the raw key. */
export const lessonSectionLabel = (key: string) =>
  LESSON_SECTION_LABELS[key as LessonSectionKey] as
    (typeof LESSON_SECTION_LABELS)[LessonSectionKey] | undefined;

/** Worth reading at a glance; `rule` only restates the title the surface already shows. */
const PREVIEW_SECTION_KEYS = new Set(['why', 'how', 'works', 'breaks', 'correct', 'limits']);

/**
 * The sections a hover preview shows, already paired with their label key.
 * Empty bodies are dropped so the card never renders a labelled blank row.
 */
export const previewSections = (sections: { body: string; key: string }[] = []) =>
  sections
    .filter((section) => PREVIEW_SECTION_KEYS.has(section.key) && section.body.trim().length > 0)
    .map((section) => ({ ...section, label: lessonSectionLabel(section.key) }));

/**
 * The line a rule row shows about its own practice history: what happened, in counts.
 *
 * The surfaces used to turn this into a verdict — "老毛病" / "还不稳" / "已养成" — and a rule
 * still being learned reads differently from one taught by hand, so the taught case says so
 * rather than reporting an empty history as if it were a result.
 */
export const describeRecent = (
  recent: { pass: boolean }[],
  taughtByUser: boolean,
  // The real `TFunction`, not a hand-written `(key, options?) => string` — the
  // narrower shape is not a supertype of i18next's overloaded one, so passing a
  // `t` from `useTranslation` to it is a type error at every call site.
  t: TFunction<'selfLearning'>,
) => {
  if (recent.length === 0)
    return t(taughtByUser ? 'habit.hint.taughtPending' : 'habit.recentTip.none');

  return t('habit.recentTip.title', {
    count: recent.length,
    list: recent
      .map((r) => t(r.pass ? 'habit.recentTip.pass' : 'habit.recentTip.violation'))
      .join(' '),
  });
};
