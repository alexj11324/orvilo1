import { Flexbox, Icon, Input } from '@lobehub/ui';
import { Button, createModal, useModalContext } from '@lobehub/ui/base-ui';
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
      <Flexbox gap={20}>
        <Flexbox gap={6}>
          <label htmlFor={`${id}-url`}>{t('resources.link.url')}</label>
          <Input
            autoFocus
            required
            disabled={pending}
            id={`${id}-url`}
            maxLength={8192}
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </Flexbox>
        <Flexbox gap={6}>
          <label htmlFor={`${id}-title`}>{t('resources.link.title')}</label>
          <Input
            disabled={pending}
            id={`${id}-title`}
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Flexbox>
        {!!error && (
          <AsyncError
            error={error}
            title={t(readbackFailed ? 'resources.link.readbackError' : 'resources.link.saveError')}
            variant="inline"
          />
        )}
        <Flexbox horizontal gap={16} justify="flex-end">
          <Button disabled={pending} onClick={close}>
            {t('resources.link.cancel')}
          </Button>
          <Button
            disabled={pending || !url.trim()}
            htmlType="submit"
            loading={pending}
            type="primary"
          >
            {t(savedId ? 'resources.link.save' : 'resources.link.add')}
          </Button>
        </Flexbox>
      </Flexbox>
    </form>
  );
}

export const openProjectLinkModal = (props: ProjectLinkModalProps) =>
  createModal({
    closable: false,
    content: <ProjectLinkForm {...props} />,
    footer: null,
    title: (
      <Flexbox horizontal align="center" gap={8}>
        <Icon icon={Link2Icon} size={16} />
        {translate(props.link ? 'resources.link.editHeading' : 'resources.link.addHeading', {
          ns: 'project',
        })}
      </Flexbox>
    ),
    width: 540,
  });
