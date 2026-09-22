import { Flexbox, Icon, Input } from '@lobehub/ui';
import { Button, createModal, useModalContext } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { t as translate } from 'i18next';
import { Link2Icon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { useProjectStore } from '@/store/project';

interface ProjectLinkValue {
  id: string;
  title: string;
  url: string;
}

interface ProjectLinkModalProps {
  link?: ProjectLinkValue;
  projectId: string;
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  actions: css`
    margin-block-start: 16px;

    button {
      height: 32px;
      padding-block: 0;
      padding-inline: 12px;
      border-color: transparent;
      border-radius: 9999px;

      font-size: 13px;
      font-weight: 500;
      line-height: normal;
    }
  `,
  cancelButton: css`
    color: ${cssVar.colorText};
    background: ${cssVar.colorBgElevated};
    box-shadow: 0 0 0 1px ${cssVar.colorBorderSecondary};

    &:hover:not(:disabled) {
      border-color: transparent;
      background: ${cssVar.colorFillTertiary};
    }
  `,
  field: css`
    margin-block-start: 16px;

    label {
      display: block;

      margin-block-end: 4px;

      font-size: 16px;
      font-weight: 400;
      line-height: 24px;
    }
  `,
  formBody: css`
    padding: 32px;
  `,
  labelText: css`
    font-size: 13px;
    font-weight: 500;
    line-height: normal;
    color: ${cssVar.colorText};
  `,
  optionalText: css`
    font-size: 12px;
    font-weight: 450;
    line-height: normal;
    color: ${cssVar.colorTextSecondary};
  `,
  input: css`
    height: 32px;
    padding-block: 6px;
    padding-inline: 12px;
    border-radius: 8px;

    font-size: 13px;
    font-weight: 400;
    line-height: normal;
  `,
  popup: css`
    flex-direction: column;
    justify-content: flex-start;

    &::before,
    &::after {
      content: '';
      min-height: 0;
    }

    &::before {
      flex: 1 1 0;
    }

    &::after {
      flex: 2 1 0;
    }

    > div {
      flex: 0 0 auto;

      border: 1px solid ${cssVar.colorBorderSecondary};
      border-radius: 12px;

      background: ${cssVar.colorBgElevated};
      box-shadow: none;
    }
  `,
  primaryButton: css`
    color: lch(100% 5 286.91deg);
    background: lch(53% 52.26 286.91deg);

    &:hover:not(:disabled) {
      border-color: transparent;
      color: lch(100% 5 286.91deg);
      background: lch(49% 52.26 286.91deg);
    }
  `,
  title: css`
    font-size: 15px;
    font-weight: 600;
    line-height: 23px;
  `,
}));

export function ProjectLinkForm({ link, projectId }: ProjectLinkModalProps) {
  const { t } = useTranslation('project');
  const { close, setCanDismissByClickOutside } = useModalContext();
  const id = useId();
  const save = useProjectStore((s) => s.saveProjectLink);
  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [savedId, setSavedId] = useState(link?.id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [readbackFailed, setReadbackFailed] = useState(false);
  const lock = useRef(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        try {
          const parsed = new URL(url.trim());
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
            throw new Error('Invalid link');
        } catch {
          setError(new Error(t('resources.link.invalidUrl')));
          setReadbackFailed(false);
          return;
        }
        lock.current = true;
        setPending(true);
        setCanDismissByClickOutside(false);
        setError(undefined);
        setReadbackFailed(false);
        try {
          const result = await save(projectId, { linkId: savedId, title, url });
          setSavedId(result.data.id);
          if (result.refreshError) {
            setReadbackFailed(true);
            setError(result.refreshError);
          } else close();
        } catch (failure) {
          setError(failure);
        } finally {
          lock.current = false;
          setPending(false);
          setCanDismissByClickOutside(true);
        }
      }}
    >
      <div className={styles.formBody}>
        <Flexbox horizontal align="center" gap={8}>
          <Icon icon={Link2Icon} size={16} />
          <span className={styles.title}>
            {t(link ? 'resources.link.editHeading' : 'resources.link.addHeading')}
          </span>
        </Flexbox>
        <div className={styles.field}>
          <label htmlFor={`${id}-url`}>
            <span className={styles.labelText}>{t('resources.link.url')}</span>
          </label>
          <Input
            autoFocus
            required
            className={styles.input}
            disabled={pending}
            id={`${id}-url`}
            maxLength={8192}
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-title`}>
            <span className={styles.labelText}>{t('resources.link.titleLabel')}</span>{' '}
            <span className={styles.optionalText}>{t('resources.link.optional')}</span>
          </label>
          <Input
            aria-label={t('resources.link.title')}
            className={styles.input}
            disabled={pending}
            id={`${id}-title`}
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        {!!error && (
          <AsyncError
            error={error}
            title={t(readbackFailed ? 'resources.link.readbackError' : 'resources.link.saveError')}
            variant="inline"
          />
        )}
        <Flexbox horizontal className={styles.actions} gap={16} justify="flex-end">
          <Button className={styles.cancelButton} disabled={pending} onClick={close}>
            {t('resources.link.cancel')}
          </Button>
          <Button
            className={styles.primaryButton}
            disabled={pending}
            htmlType="submit"
            loading={pending}
            type="primary"
          >
            {t(savedId ? 'resources.link.save' : 'resources.link.add')}
          </Button>
        </Flexbox>
      </div>
    </form>
  );
}

export const openProjectLinkModal = (props: ProjectLinkModalProps) =>
  createModal({
    classNames: { popup: styles.popup },
    content: <ProjectLinkForm {...props} />,
    footer: null,
    styles: {
      backdrop: { background: 'lch(0 0 0 / 0.25)', opacity: 0.95 },
      close: { display: 'none' },
      content: { overflow: 'hidden auto', padding: 0 },
      header: { display: 'none' },
    },
    title: translate(props.link ? 'resources.link.editHeading' : 'resources.link.addHeading', {
      ns: 'project',
    }),
    width: 540,
  });
