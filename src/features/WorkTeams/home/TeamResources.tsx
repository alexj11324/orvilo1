'use client';

import { Icon } from '@lobehub/ui';
import {
  confirmModal,
  DropdownMenuItem,
  DropdownMenuPopup,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  Text,
} from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  FilePlus2Icon,
  FileTextIcon,
  FolderPlusIcon,
  Link2Icon,
  MoreHorizontalIcon,
  PlusIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { createDocumentModal } from '@/features/DocumentModal';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { lambdaClient } from '@/libs/trpc/client';

import {
  openExistingDocumentPicker,
  openTeamLinkDialog,
  openTeamSectionDialog,
} from './TeamResourceDialogs';
import { type TeamResource, useTeamResources } from './useTeamResources';

const styles = createStaticStyles(({ css }) => ({
  action: css`
    display: inline-flex;
    gap: 10px;
    align-items: center;

    min-width: 190px;

    font-size: 13px;
  `,
  actions: css`
    display: flex;
    gap: 4px;
    align-items: center;
    margin-inline-start: auto;
  `,
  error: css`
    margin-block: 8px;
  `,
  heading: css`
    display: flex;
    gap: 12px;
    align-items: center;

    min-height: 28px;

    font-size: 18px;
    font-weight: 500;
    line-height: 22px;
  `,
  iconButton: css`
    cursor: pointer;

    display: grid;
    place-items: center;

    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 50%;

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorBgElevated};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
  menu: css`
    min-width: 228px;
    padding: 4px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;

    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  menuDivider: css`
    height: 1px;
    margin-block: 4px;
    background: ${cssVar.colorBorderSecondary};
  `,
  muted: css`
    font-size: 15px;
    font-weight: 450;
    line-height: 23px;
    color: ${cssVar.colorTextTertiary};
  `,
  resourceLink: css`
    cursor: pointer;

    overflow: hidden;
    display: flex;
    gap: 9px;
    align-items: center;

    min-width: 0;
    padding-block: 4px;
    border: 0;

    color: ${cssVar.colorText};
    text-decoration: none;

    background: transparent;

    &:hover {
      text-decoration: underline;
    }
  `,
  resourceRow: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 32px;
  `,
  section: css`
    margin-block-start: 18px;
  `,
  sectionHeading: css`
    display: flex;
    align-items: center;

    min-height: 30px;

    font-size: 14px;
    font-weight: 500;
  `,
  text: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

interface TeamResourcesProps {
  documentsOnly?: boolean;
  teamId: string;
}

export default function TeamResources({ documentsOnly = false, teamId }: TeamResourcesProps) {
  const { t } = useTranslation('common');
  const { data, error, isLoading, mutate } = useTeamResources(teamId);
  const [writeError, setWriteError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const createLock = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const refresh = async () => {
    await mutate();
    setWriteError(undefined);
  };
  const resources = data?.data.resources ?? [];
  const sections = data?.data.sections ?? [];
  const canWrite = data?.data.canWrite ?? false;
  const canCreateDocument = data?.data.canCreateDocument ?? false;
  const visible = documentsOnly ? resources.filter((item) => item.kind === 'document') : resources;
  const attachedIds = new Set(
    resources.filter((item) => item.kind === 'document').map((item) => item.documentId!),
  );

  const createDocument = async (sectionId?: string | null) => {
    if (createLock.current) return;
    createLock.current = true;
    const title = t('teams.resources.untitled');
    setPending(true);
    setWriteError(undefined);
    try {
      const result = await lambdaClient.teamResource.createDocument.mutate({
        sectionId,
        teamId,
        title,
      });
      await refresh();
      createDocumentModal(result.data.document.id);
    } catch (failure) {
      setWriteError(failure);
    } finally {
      createLock.current = false;
      setPending(false);
    }
  };
  const remove = (resource: TeamResource) => {
    confirmModal({
      cancelText: t('cancel'),
      content: t('teams.resources.removeConfirm'),
      okText: t('teams.resources.remove'),
      onOk: async () => {
        setWriteError(undefined);
        try {
          if (resource.kind === 'document') {
            if (resource.ownedByTeam) return;
            await lambdaClient.teamResource.detachDocument.mutate({
              resourceId: resource.id,
              teamId,
            });
          } else {
            await lambdaClient.teamResource.removeLink.mutate({ resourceId: resource.id, teamId });
          }
          await refresh();
        } catch (failure) {
          setWriteError(failure);
          throw failure;
        }
      },
      title: t('teams.resources.remove'),
    });
  };
  const moveToSection = async (resource: TeamResource, sectionId: string | null) => {
    const lastPosition = Math.max(
      -1,
      ...resources.filter((item) => item.sectionId === sectionId).map((item) => item.position),
    );
    setWriteError(undefined);
    try {
      await lambdaClient.teamResource.moveResource.mutate({
        position: lastPosition + 1,
        resourceId: resource.id,
        sectionId,
        teamId,
      });
      await refresh();
    } catch (failure) {
      setWriteError(failure);
    }
  };
  const rows = (items: TeamResource[]) =>
    items.map((resource) => (
      <div className={styles.resourceRow} key={resource.id}>
        {resource.kind === 'document' ? (
          <button
            className={styles.resourceLink}
            style={{ flex: 1 }}
            type="button"
            onClick={() => createDocumentModal(resource.document.id)}
          >
            <Icon icon={FileTextIcon} size={16} />
            <span className={styles.text}>
              {resource.document.title || t('teams.resources.untitled')}
            </span>
          </button>
        ) : (
          <a
            className={styles.resourceLink}
            href={resource.url!}
            rel="noopener noreferrer"
            style={{ flex: 1 }}
            target="_blank"
          >
            <Icon icon={Link2Icon} size={16} />
            <span className={styles.text}>{resource.title || resource.url}</span>
          </a>
        )}
        {canWrite &&
          (resource.kind === 'link' ||
            !resource.ownedByTeam ||
            (!documentsOnly && sections.length > 0)) && (
            <DropdownMenuRoot>
              <DropdownMenuTrigger>
                <button
                  aria-label={t('teams.resources.moreActions')}
                  className={styles.iconButton}
                  type="button"
                >
                  <Icon icon={MoreHorizontalIcon} size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuPositioner placement="bottomRight" sideOffset={4}>
                  <DropdownMenuPopup className={styles.menu}>
                    {resource.kind === 'link' && (
                      <DropdownMenuItem
                        onClick={() =>
                          openTeamLinkDialog({ link: resource, onChanged: refresh, teamId })
                        }
                      >
                        {t('teams.resources.editLink')}
                      </DropdownMenuItem>
                    )}
                    {!documentsOnly && sections.length > 0 && (
                      <>
                        <div className={styles.menuDivider} />
                        {resource.sectionId && (
                          <DropdownMenuItem onClick={() => void moveToSection(resource, null)}>
                            {t('teams.resources.moveToMain')}
                          </DropdownMenuItem>
                        )}
                        {sections
                          .filter((section) => section.id !== resource.sectionId)
                          .map((section) => (
                            <DropdownMenuItem
                              key={section.id}
                              onClick={() => void moveToSection(resource, section.id)}
                            >
                              {t('teams.resources.moveToSection', { name: section.name })}
                            </DropdownMenuItem>
                          ))}
                      </>
                    )}
                    {(resource.kind === 'link' ||
                      (resource.kind === 'document' && !resource.ownedByTeam)) && (
                      <DropdownMenuItem onClick={() => remove(resource)}>
                        {t('teams.resources.remove')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuPopup>
                </DropdownMenuPositioner>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
          )}
      </div>
    ));

  return (
    <section aria-label={documentsOnly ? t('teams.homeTabs.documents') : t('teams.resources')}>
      <div className={styles.heading}>
        <span>{documentsOnly ? t('teams.homeTabs.documents') : t('teams.resources')}</span>
        <div className={styles.actions}>
          {(canWrite || canCreateDocument) && (
            <DropdownMenuRoot open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger>
                <button
                  aria-label={t('teams.resources.addResources')}
                  className={styles.iconButton}
                  disabled={pending}
                  type="button"
                >
                  <Icon icon={PlusIcon} size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuPositioner placement="bottomRight" sideOffset={5}>
                  <DropdownMenuPopup className={styles.menu}>
                    {canCreateDocument && (
                      <DropdownMenuItem onClick={() => void createDocument()}>
                        <span className={styles.action}>
                          <Icon icon={FilePlus2Icon} size={16} />
                          {t('teams.resources.newDocument')}
                        </span>
                      </DropdownMenuItem>
                    )}
                    {canWrite && (
                      <DropdownMenuItem
                        onClick={() =>
                          openExistingDocumentPicker({ attachedIds, onChanged: refresh, teamId })
                        }
                      >
                        <span className={styles.action}>
                          <Icon icon={FileTextIcon} size={16} />
                          {t('teams.resources.existingDocuments')}
                        </span>
                      </DropdownMenuItem>
                    )}
                    {canWrite && !documentsOnly && (
                      <>
                        <div className={styles.menuDivider} />
                        <DropdownMenuItem
                          onClick={() => openTeamLinkDialog({ onChanged: refresh, teamId })}
                        >
                          <span className={styles.action}>
                            <Icon icon={Link2Icon} size={16} />
                            {t('teams.resources.newLink')}
                          </span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuPopup>
                </DropdownMenuPositioner>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
          )}
          {!documentsOnly && canWrite && (
            <button
              aria-label={t('teams.resources.addSection')}
              className={styles.iconButton}
              type="button"
              onClick={() => openTeamSectionDialog({ onChanged: refresh, teamId })}
            >
              <Icon icon={FolderPlusIcon} size={16} />
            </button>
          )}
        </div>
      </div>
      {isLoading && !data ? <SkeletonList aria-label={t('teams.loading')} rows={2} /> : null}
      {error && !data ? (
        <AsyncError error={error} variant="inline" onRetry={() => void refresh()} />
      ) : null}
      {writeError !== undefined && (
        <div className={styles.error}>
          <AsyncError error={writeError} variant="inline" onRetry={() => void refresh()} />
        </div>
      )}
      {data && visible.length === 0 && (documentsOnly || sections.length === 0) && (
        <Text className={styles.muted} type="secondary">
          {t(
            documentsOnly
              ? 'teams.documentsEmpty'
              : canWrite || canCreateDocument
                ? 'teams.resourcesEmpty'
                : 'teams.resourcesEmptyReadOnly',
          )}
        </Text>
      )}
      {data &&
        visible.length > 0 &&
        rows(documentsOnly ? visible : visible.filter((item) => !item.sectionId))}
      {!documentsOnly &&
        sections.map((section) => (
          <div className={styles.section} key={section.id}>
            <div className={styles.sectionHeading}>
              <span>{section.name}</span>
              <div className={styles.actions}>
                {canCreateDocument && (
                  <button
                    aria-label={t('teams.resources.addToSection', { name: section.name })}
                    className={styles.iconButton}
                    disabled={pending}
                    type="button"
                    onClick={() => void createDocument(section.id)}
                  >
                    <Icon icon={PlusIcon} size={14} />
                  </button>
                )}
                {canWrite && (
                  <DropdownMenuRoot>
                    <DropdownMenuTrigger>
                      <button
                        aria-label={t('teams.resources.sectionActions', { name: section.name })}
                        className={styles.iconButton}
                        type="button"
                      >
                        <Icon icon={MoreHorizontalIcon} size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuPositioner placement="bottomRight" sideOffset={4}>
                        <DropdownMenuPopup className={styles.menu}>
                          <DropdownMenuItem
                            onClick={() =>
                              openTeamLinkDialog({
                                onChanged: refresh,
                                sectionId: section.id,
                                teamId,
                              })
                            }
                          >
                            {t('teams.resources.newLink')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              openExistingDocumentPicker({
                                attachedIds,
                                onChanged: refresh,
                                sectionId: section.id,
                                teamId,
                              })
                            }
                          >
                            {t('teams.resources.existingDocuments')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              openTeamSectionDialog({
                                name: section.name,
                                onChanged: refresh,
                                sectionId: section.id,
                                teamId,
                              })
                            }
                          >
                            {t('teams.resources.renameSection')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              confirmModal({
                                cancelText: t('cancel'),
                                content: t('teams.resources.deleteSectionConfirm'),
                                okText: t('teams.resources.deleteSection'),
                                onOk: async () => {
                                  try {
                                    await lambdaClient.teamResource.deleteSection.mutate({
                                      sectionId: section.id,
                                      teamId,
                                    });
                                    await refresh();
                                  } catch (failure) {
                                    setWriteError(failure);
                                    throw failure;
                                  }
                                },
                                title: t('teams.resources.deleteSection'),
                              })
                            }
                          >
                            {t('teams.resources.deleteSection')}
                          </DropdownMenuItem>
                        </DropdownMenuPopup>
                      </DropdownMenuPositioner>
                    </DropdownMenuPortal>
                  </DropdownMenuRoot>
                )}
              </div>
            </div>
            {rows(visible.filter((item) => item.sectionId === section.id))}
          </div>
        ))}
    </section>
  );
}
