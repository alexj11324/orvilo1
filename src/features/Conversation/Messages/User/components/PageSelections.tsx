import { Code2Icon, SquareDashedMousePointer } from 'lucide-react';
import { memo } from 'react';

import type { ContextSelection, ElementContextSelection, PageSelection } from '@/types/index';

type UserContextSelection = ContextSelection | PageSelection;

interface PageSelectionsProps {
  selections: UserContextSelection[];
}

const isContextSelection = (selection: UserContextSelection): selection is ContextSelection =>
  'source' in selection;

const isCodeSelection = (selection: UserContextSelection): selection is ContextSelection =>
  isContextSelection(selection) && selection.source === 'code';

const isElementSelection = (
  selection: UserContextSelection,
): selection is ElementContextSelection =>
  isContextSelection(selection) && selection.source === 'element';

const getCodeSelectionMeta = (selection: ContextSelection): string => {
  if (selection.source !== 'code') return selection.title || '';

  const lineRange = selection.lineRange
    ? `:${selection.lineRange.startLine}-${selection.lineRange.endLine ?? selection.lineRange.startLine}`
    : '';

  return `${selection.filePath}${lineRange}`;
};

const CodeSelection = memo<{ selection: ContextSelection }>(({ selection }) => (
  <div className="flex cursor-pointer flex-col overflow-hidden rounded-(--radius-card) border border-divider bg-fill-quaternary hover:border-border hover:bg-accent">
    <div className="flex items-center gap-1.5 overflow-hidden border-be border-divider px-2.5 py-1.5 text-foreground-tertiary">
      <Code2Icon size={14} />
      <div className="truncate font-mono text-xs leading-5">{getCodeSelectionMeta(selection)}</div>
    </div>
    <pre className="m-0 line-clamp-4 px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre text-muted-foreground">
      {selection.content}
    </pre>
  </div>
));

CodeSelection.displayName = 'UserMessageCodeSelection';

/** A picked DOM element renders as what it is — its crop and locator, not a quote. */
const ElementSelection = memo<{ selection: ElementContextSelection }>(({ selection }) => (
  <div className="flex cursor-pointer flex-col overflow-hidden rounded-(--radius-card) border border-divider bg-fill-quaternary hover:border-border hover:bg-accent">
    <div className="flex items-center gap-1.5 overflow-hidden border-be border-divider px-2.5 py-1.5 text-foreground-tertiary">
      <SquareDashedMousePointer size={14} />
      <div className="truncate font-mono text-xs leading-5">
        {selection.element.selector || `<${selection.element.tag}>`}
      </div>
    </div>
    {selection.element.thumbnailUrl ? (
      <img
        alt={selection.element.selector || selection.element.tag}
        className="mx-2.5 my-2 block max-h-50 max-w-full rounded-(--radius-input) border border-divider bg-card object-contain"
        src={selection.element.thumbnailUrl}
      />
    ) : (
      <div className="line-clamp-3 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
        {selection.preview || selection.content}
      </div>
    )}
  </div>
));

ElementSelection.displayName = 'UserMessageElementSelection';

const QuoteSelection = memo<{ selection: UserContextSelection }>(({ selection }) => (
  <div className="relative flex cursor-pointer flex-col rounded-(--radius-card) hover:bg-accent">
    <div className="flex gap-1 p-1">
      <span className="start-0 inset-bs-0.5 text-2xl leading-none text-foreground-quaternary">
        "
      </span>
      <div className="line-clamp-3 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
        {selection.content}
      </div>
    </div>
  </div>
));

QuoteSelection.displayName = 'UserMessageQuoteSelection';

const SelectionItem = memo<{ selection: UserContextSelection }>(({ selection }) => {
  if (isCodeSelection(selection)) return <CodeSelection selection={selection} />;
  if (isElementSelection(selection)) return <ElementSelection selection={selection} />;

  return <QuoteSelection selection={selection} />;
});

SelectionItem.displayName = 'UserMessageSelectionItem';

const PageSelections = memo<PageSelectionsProps>(({ selections }) => {
  if (!selections || selections.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {selections.map((selection) => (
        <SelectionItem key={selection.id} selection={selection} />
      ))}
    </div>
  );
});

export default PageSelections;
