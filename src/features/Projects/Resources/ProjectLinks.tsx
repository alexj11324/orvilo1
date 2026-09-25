import { Flexbox, Icon } from '@lobehub/ui';
import { Button, DropdownMenu, Skeleton, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { EllipsisIcon, Link2Icon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { openProjectLinkModal } from './ProjectLinkModal';

const styles = createStaticStyles(({ css }) => ({
  link: css`
    display: inline-flex;
    gap: 6px;
    align-items: center;

    max-width: 240px;
    height: 28px;
    padding-inline: 6px;
    border-radius: 6px;

    font-size: 13px;
    color: ${cssVar.colorText};
    text-decoration: none;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
}));

export function ProjectLinks({
  projectId,
  ownerId,
}: {
  projectId: string;
  ownerId: string | null;
}) {
  const { t } = useTranslation('project');
  const query = useProjectStore((s) => s.useFetchProjectLinks)(projectId);
  const remove = useProjectStore((s) => s.removeProjectLink);
  const userId = useUserStore(userProfileSelectors.userId);
  const canEdit = !!ownerId && userId === ownerId;
  const links = query.data?.data ?? [];
  return (
    <Flexbox horizontal align="center" gap={4} wrap="wrap">
      {query.isLoading && !query.data && <Skeleton height={28} width={120} />}
      {query.error && (
        <AsyncError
          error={query.error}
          retrying={query.isValidating}
          variant="inline"
          onRetry={() => void query.mutate()}
        />
      )}
      {links.map((link) => (
        <Flexbox horizontal align="center" gap={0} key={link.id}>
          <a
            className={styles.link}
            href={link.url}
            rel="noopener noreferrer"
            target="_blank"
            title={link.title || link.url}
          >
            <Icon icon={Link2Icon} size={14} />
            <span>{link.title || link.url}</span>
          </a>
          {canEdit && (
            <DropdownMenu
              items={[
                {
                  key: 'edit',
                  label: t('resources.link.edit'),
                  onClick: () => openProjectLinkModal({ projectId, link }),
                },
                {
                  key: 'remove',
                  label: t('resources.remove'),
                  onClick: async () => {
                    try {
                      const result = await remove(projectId, link.id);
                      if (result.refreshError)
                        toast.error(t('resources.link.removedReadbackError'));
                    } catch {
                      toast.error(t('resources.link.removeError'));
                    }
                  },
                },
              ]}
            >
              <Button
                aria-label={t('resources.link.actions', { title: link.title || link.url })}
                icon={EllipsisIcon}
                size="small"
                type="text"
              />
            </DropdownMenu>
          )}
        </Flexbox>
      ))}
      {canEdit && (
        <DropdownMenu
          items={[
            {
              key: 'link',
              icon: <Icon icon={Link2Icon} size={16} />,
              label: t('resources.link.menu'),
              onClick: () => openProjectLinkModal({ projectId }),
            },
          ]}
        >
          <Button
            aria-label={t('overview.resourcesAdd')}
            icon={links.length ? PlusIcon : Link2Icon}
            size="small"
            type="text"
          >
            {links.length ? null : t('overview.resourcesAdd')}
          </Button>
        </DropdownMenu>
      )}
    </Flexbox>
  );
}
