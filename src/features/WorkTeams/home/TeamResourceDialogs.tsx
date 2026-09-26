'use client';

import { Button, createModal, useModalContext } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { t as translate } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { lambdaClient } from '@/libs/trpc/client';

import { isPublicDocument } from './teamResourcePicker';
import type { TeamResource } from './useTeamResources';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-block-start: 20px;
  `,
  body: css`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 5px;

    label {
      font-size: 13px;
      font-weight: 500;
    }

    input {
      height: 34px;
      padding-inline: 10px;
      border: 1px solid ${cssVar.colorBorder};
      border-radius: 7px;

      color: ${cssVar.colorText};

      background: ${cssVar.colorBgContainer};
      outline-color: ${cssVar.colorPrimary};
    }
  `,
  picker: css`
    overflow: auto;
    max-height: 330px;
  `,
  pickerRow: css`
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    min-height: 38px;
    padding-inline: 8px;
    border: 0;
    border-radius: 6px;

    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface DialogOptions {
  onChanged: () => Promise<unknown>;
  sectionId?: string | null;
  teamId: string;
}

const ErrorLine = ({ error }: { error: unknown }) =>
  error ? <AsyncError error={error} variant="inline" /> : null;

function LinkForm({
  link,
  onChanged,
  sectionId,
  teamId,
}: DialogOptions & { link?: Extract<TeamResource, { kind: 'link' }> }) {
  const { t } = useTranslation('common');
  const { close } = useModalContext();
  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error(t('teams.resources.invalidUrl'));
      setPending(true);
      setError(undefined);
      if (link) {
        await lambdaClient.teamResource.updateLink.mutate({
          resourceId: link.id,
          teamId,
          title: title.trim(),
          url: parsed.href,
        });
      } else {
        await lambdaClient.teamResource.createLink.mutate({
          sectionId,
          teamId,
          title: title.trim() || undefined,
          url: parsed.href,
        });
      }
      await onChanged();
      close();
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };
  return (
    <form className={styles.body} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="team-resource-url">{t('teams.resources.url')}</label>
        <input
          autoFocus
          required
          id="team-resource-url"
          maxLength={8192}
          placeholder="https://"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="team-resource-title">{t('teams.resources.titleOptional')}</label>
        <input
          id="team-resource-title"
          maxLength={255}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <ErrorLine error={error} />
      <div className={styles.actions}>
        <Button disabled={pending} onClick={close}>
          {t('cancel')}
        </Button>
        <Button disabled={pending} htmlType="submit" loading={pending} type="primary">
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

function SectionForm({
  name: initialName,
  onChanged,
  sectionId,
  teamId,
}: DialogOptions & { name?: string }) {
  const { t } = useTranslation('common');
  const { close } = useModalContext();
  const [name, setName] = useState(initialName ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <form
      className={styles.body}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || !name.trim()) return;
        setPending(true);
        setError(undefined);
        try {
          if (sectionId) {
            await lambdaClient.teamResource.renameSection.mutate({
              name: name.trim(),
              sectionId,
              teamId,
            });
          } else {
            await lambdaClient.teamResource.createSection.mutate({ name: name.trim(), teamId });
          }
          await onChanged();
          close();
        } catch (failure) {
          setError(failure);
        } finally {
          setPending(false);
        }
      }}
    >
      <div className={styles.field}>
        <label htmlFor="team-resource-section-name">{t('teams.resources.sectionName')}</label>
        <input
          autoFocus
          required
          id="team-resource-section-name"
          maxLength={255}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <ErrorLine error={error} />
      <div className={styles.actions}>
        <Button disabled={pending} onClick={close}>
          {t('cancel')}
        </Button>
        <Button disabled={pending} htmlType="submit" loading={pending} type="primary">
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

function ExistingDocumentPicker({
  attachedIds,
  onChanged,
  sectionId,
  teamId,
}: DialogOptions & { attachedIds: Set<string> }) {
  const { t } = useTranslation('common');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof lambdaClient.document.queryDocuments.query>>['items']
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await lambdaClient.document.queryDocuments.query({
        current: nextPage,
        excludeTeamDocuments: true,
        pageSize: 100,
      });
      setItems((previous) => (nextPage === 0 ? result.items : [...previous, ...result.items]));
      setTotal(result.total);
      setPage(nextPage);
    } catch (failure) {
      setError(failure);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(0);
  }, [load]);
  const eligible = items.filter(isPublicDocument);
  return (
    <div className={styles.body}>
      <ErrorLine error={error} />
      <div className={styles.picker}>
        {eligible.map((document) => (
          <button
            className={styles.pickerRow}
            disabled={pendingId === document.id || attachedIds.has(document.id)}
            key={document.id}
            type="button"
            onClick={async () => {
              setPendingId(document.id);
              setError(undefined);
              try {
                await lambdaClient.teamResource.attachDocument.mutate({
                  documentId: document.id,
                  sectionId,
                  teamId,
                });
                await onChanged();
                attachedIds.add(document.id);
              } catch (failure) {
                setError(failure);
              } finally {
                setPendingId(null);
              }
            }}
          >
            <span>{document.title || document.filename || t('teams.resources.untitled')}</span>
            <span>
              {attachedIds.has(document.id)
                ? t('teams.resources.attached')
                : t('teams.resources.attach')}
            </span>
          </button>
        ))}
        {!loading && items.length === 0 && !error && t('teams.resources.noDocuments')}
        {!loading &&
          items.length > 0 &&
          eligible.length === 0 &&
          t('teams.resources.noPublicDocuments')}
      </div>
      {loading && <span>{t('teams.loading')}</span>}
      {items.length < total && (
        <Button disabled={loading} onClick={() => void load(page + 1)}>
          {t('teams.resources.loadMore')}
        </Button>
      )}
    </div>
  );
}

export const openTeamLinkDialog = (
  options: DialogOptions & { link?: Extract<TeamResource, { kind: 'link' }> },
) =>
  createModal({
    content: <LinkForm {...options} />,
    footer: null,
    title: translate(options.link ? 'teams.resources.editLink' : 'teams.resources.newLink', {
      ns: 'common',
    }),
    width: 440,
  });

export const openTeamSectionDialog = (options: DialogOptions & { name?: string }) =>
  createModal({
    content: <SectionForm {...options} />,
    footer: null,
    title: translate(
      options.sectionId ? 'teams.resources.renameSection' : 'teams.resources.addSection',
      { ns: 'common' },
    ),
    width: 400,
  });

export const openExistingDocumentPicker = (options: DialogOptions & { attachedIds: Set<string> }) =>
  createModal({
    content: <ExistingDocumentPicker {...options} />,
    footer: null,
    title: translate('teams.resources.existingDocuments', { ns: 'common' }),
    width: 480,
  });
