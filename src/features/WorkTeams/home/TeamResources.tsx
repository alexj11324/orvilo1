'use client';

import { cn } from 'cn';
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
import { confirmModal } from '@/components/Modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createDocumentModal } from '@/features/DocumentModal';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { lambdaClient } from '@/libs/trpc/client';

import {
  openExistingDocumentPicker,
  openTeamLinkDialog,
  openTeamSectionDialog,
} from './TeamResourceDialogs';
import { type TeamResource, useTeamResources } from './useTeamResources';

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
      createDocumentModal(result.data.document.id, () => void refresh());
      await refresh().catch(() => undefined);
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
      <div className="flex min-h-8 items-center gap-2" key={resource.id}>
        {resource.kind === 'document' ? (
          <button
            className="cursor-pointer overflow-hidden flex items-center gap-2 min-w-0 py-1 border-0 text-foreground no-underline bg-transparent hover:underline flex-1"

            type="button"
            onClick={() => createDocumentModal(resource.document.id, () => void refresh())}
          >
            <FileTextIcon size={16} />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {resource.document.title || t('teams.resources.untitled')}
            </span>
          </button>
        ) : (
          <a
            className="cursor-pointer overflow-hidden flex items-center gap-2 min-w-0 py-1 border-0 text-foreground no-underline bg-transparent hover:underline flex-1"
            href={resource.url!}
            rel="noopener noreferrer"

            target="_blank"
          >
            <Link2Icon size={16} />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {resource.title || resource.url}
            </span>
          </a>
        )}
        {canWrite &&
          (resource.kind === 'link' ||
            !resource.ownedByTeam ||
            (!documentsOnly && sections.length > 0)) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t('teams.resources.moreActions')}
                className="cursor-pointer grid place-items-center size-8 p-0 border border-solid border-divider rounded-full text-muted-foreground bg-popover hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary focus-visible:outline-offset-2"
              >
                <MoreHorizontalIcon size={16} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-57 p-1 border border-solid border-divider rounded-(--radius-overlay) bg-popover shadow-(--shadow-popover)"
                side="bottom"
                sideOffset={4}
              >
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
                    <div className="h-px my-1 bg-divider" />
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
              </DropdownMenuContent>
            </DropdownMenu>
          )}
      </div>
    ));

  return (
    <section aria-label={documentsOnly ? t('teams.homeTabs.documents') : t('teams.resources')}>
      <div className="flex min-h-8 items-center gap-3 text-xl font-semibold leading-7">
        <span>{documentsOnly ? t('teams.homeTabs.documents') : t('teams.resources')}</span>
        <div className="flex items-center gap-1 ms-auto">
          {(canWrite || canCreateDocument) && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger
                aria-label={t('teams.resources.addResources')}
                className="cursor-pointer grid place-items-center size-8 p-0 border border-solid border-divider rounded-full text-muted-foreground bg-popover hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary focus-visible:outline-offset-2"
                disabled={pending}
              >
                <PlusIcon size={16} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-57 p-1 border border-solid border-divider rounded-(--radius-overlay) bg-popover shadow-(--shadow-popover)"
                side="bottom"
                sideOffset={5}
              >
                {canCreateDocument && (
                  <DropdownMenuItem onClick={() => void createDocument()}>
                    <span className="inline-flex items-center gap-2.5 min-w-47.5 text-sm leading-5.5">
                      <FilePlus2Icon size={16} />
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
                    <span className="inline-flex items-center gap-2.5 min-w-47.5 text-sm leading-5.5">
                      <FileTextIcon size={16} />
                      {t('teams.resources.existingDocuments')}
                    </span>
                  </DropdownMenuItem>
                )}
                {canWrite && !documentsOnly && (
                  <>
                    <div className="h-px my-1 bg-divider" />
                    <DropdownMenuItem
                      onClick={() => openTeamLinkDialog({ onChanged: refresh, teamId })}
                    >
                      <span className="inline-flex items-center gap-2.5 min-w-47.5 text-sm leading-5.5">
                        <Link2Icon size={16} />
                        {t('teams.resources.newLink')}
                      </span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!documentsOnly && canWrite && (
            <button
              aria-label={t('teams.resources.addSection')}
              className="cursor-pointer grid place-items-center size-8 p-0 border border-solid border-divider rounded-full text-muted-foreground bg-popover hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary focus-visible:outline-offset-2"
              type="button"
              onClick={() => openTeamSectionDialog({ onChanged: refresh, teamId })}
            >
              <FolderPlusIcon size={16} />
            </button>
          )}
        </div>
      </div>
      {isLoading && !data ? <SkeletonList aria-label={t('teams.loading')} rows={2} /> : null}
      {error && !data ? (
        <AsyncError error={error} variant="inline" onRetry={() => void refresh()} />
      ) : null}
      {writeError !== undefined && (
        <div className="my-2">
          <AsyncError error={writeError} variant="inline" onRetry={() => void refresh()} />
        </div>
      )}
      {data && visible.length === 0 && (documentsOnly || sections.length === 0) && (
        <div
          className={cn(
            'text-muted-foreground',
            'text-sm font-normal leading-5.5 text-muted-foreground',
          )}
        >
          {t(
            documentsOnly
              ? 'teams.documentsEmpty'
              : canWrite || canCreateDocument
                ? 'teams.resourcesEmpty'
                : 'teams.resourcesEmptyReadOnly',
          )}
        </div>
      )}
      {data &&
        visible.length > 0 &&
        rows(documentsOnly ? visible : visible.filter((item) => !item.sectionId))}
      {!documentsOnly &&
        sections.map((section) => (
          <div className="mbs-4.5" key={section.id}>
            <div className="flex min-h-7.5 items-center text-sm font-medium leading-5.5">
              <span>{section.name}</span>
              <div className="flex items-center gap-1 ms-auto">
                {canCreateDocument && (
                  <button
                    aria-label={t('teams.resources.addToSection', { name: section.name })}
                    className="cursor-pointer grid place-items-center size-8 p-0 border border-solid border-divider rounded-full text-muted-foreground bg-popover hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary focus-visible:outline-offset-2"
                    disabled={pending}
                    type="button"
                    onClick={() => void createDocument(section.id)}
                  >
                    <PlusIcon size={14} />
                  </button>
                )}
                {canWrite && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={t('teams.resources.sectionActions', { name: section.name })}
                      className="cursor-pointer grid place-items-center size-8 p-0 border border-solid border-divider rounded-full text-muted-foreground bg-popover hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary focus-visible:outline-offset-2"
                    >
                      <MoreHorizontalIcon size={14} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-57 p-1 border border-solid border-divider rounded-(--radius-overlay) bg-popover shadow-(--shadow-popover)"
                      side="bottom"
                      sideOffset={4}
                    >
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            {rows(visible.filter((item) => item.sectionId === section.id))}
          </div>
        ))}
    </section>
  );
}
