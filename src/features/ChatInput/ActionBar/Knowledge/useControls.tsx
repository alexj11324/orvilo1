import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { LibraryBig } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import RepoIcon from '@/components/LibIcon';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import type { ActionMenuItem } from '../../menuItems';
import CheckboxItem from '../components/CheckboxWithLoading';

// Cap so the widest library/file row (icon + label + checkbox + paddings) stays within the
// submenu's 320px footer-driven width, keeping it level with the skill submenu instead of
// growing past it.
const labelMaxWidth = 'min(210px, 45vw)';

const styles = {
  viewMore:
    'cursor-pointer flex w-80 items-center gap-3 -mbe-2 -mx-3 px-3 border-0 rounded-(--radius-button) text-sm leading-5.5 font-normal text-foreground bg-transparent active:not-aria-[haspopup]:translate-y-0 transition-[background-color] [&:hover]:bg-accent duration-(--orvilo-motion-fast) ease-(--orvilo-motion-ease-out)',
  viewMoreLabel: 'flex-1 text-start',
};

export interface KnowledgeControls {
  enabledCount: number;
  footer: ReactNode;
  items: ActionMenuItem[];
}

export const useControls = ({
  openAttachKnowledgeModal,
}: {
  openAttachKnowledgeModal: () => void;
}) => {
  const { t } = useTranslation('chat');
  const agentId = useAgentId();

  const files = useAgentStore((s) => agentByIdSelectors.getAgentFilesById(agentId)(s), isEqual);
  const knowledgeBases = useAgentStore(
    (s) => agentByIdSelectors.getAgentKnowledgeBasesById(agentId)(s),
    isEqual,
  );

  const toggleFile = useAgentStore((s) => s.toggleFile);
  const enabledCount =
    files.filter((item) => item.enabled).length +
    knowledgeBases.filter((item) => item.enabled).length;

  const libraryItems = knowledgeBases.map((item) => ({
    icon: <RepoIcon />,
    key: item.id,
    label: item.name,
  }));

  const fileItems = files.map((item) => ({
    icon: <FileIcon fileName={item.name} fileType={item.type} size={20} />,
    key: item.id,
    label: (
      <CheckboxItem
        checked={item.enabled}
        hasPadding={false}
        id={item.id}
        label={item.name}
        labelMaxWidth={labelMaxWidth}
        onUpdate={async (id, enabled) => {
          await toggleFile(id, enabled);
        }}
      />
    ),
  }));

  // Flat list (no "Libraries" / "Files" group headers): libraries first, then files.
  const relatedGroups: ActionMenuItem[] = [
    ...libraryItems,
    ...(libraryItems.length > 0 && fileItems.length > 0 ? [{ type: 'divider' as const }] : []),
    ...fileItems,
  ];

  // The footer is the only entry into the full library / file picker, so it stays
  // rendered when nothing is attached yet — otherwise the submenu shows "no related
  // files or libraries" with no way to attach the first one.
  const footer = (
    <Button
      className={cn(styles.viewMore)}
      size="normal"
      type="button"
      variant="ghost"
      onClick={(event) => {
        event.stopPropagation();
        openAttachKnowledgeModal();
      }}
    >
      <span className="anticon" role="img">
        <LibraryBig
          className="size-4 text-muted-foreground"
          fill={'transparent'}
          height={16}
          size={16}
          width={16}
        />
      </span>
      <span className={cn(styles.viewMoreLabel)}>
        {relatedGroups.length > 0 ? t('knowledgeBase.viewMore') : t('knowledgeBase.related.browse')}
      </span>
    </Button>
  );

  return { enabledCount, footer, items: relatedGroups } satisfies KnowledgeControls;
};
