import { cn } from 'cn';
import { t as translate } from 'i18next';
import { Link2Icon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
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

const styles = {
  actions: 'mbs-4',
  cancelButton: 'text-foreground',
  field:
    'mbs-4 [&_label]:mbe-1 [&_label]:block [&_label]:text-sm [&_label]:leading-5.5 [&_label]:font-normal',
  formBody: 'p-8',
  labelText: 'text-sm leading-5.5 font-medium text-foreground',
  optionalText: 'text-xs leading-5 font-normal text-muted-foreground',
  input: 'rounded-(--radius-input) text-sm leading-5.5 font-normal',
  popup: 'border border-divider rounded-(--radius-overlay) bg-popover shadow-none',
  primaryButton: 'text-primary-foreground bg-primary',
  title: 'text-base leading-6 font-semibold',
};

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
        <div className="flex flex-row items-center gap-2">
          <Link2Icon size={16} />
          <span className={styles.title}>
            {t(link ? 'resources.link.editHeading' : 'resources.link.addHeading')}
          </span>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-url`}>
            <span className={styles.labelText}>{t('resources.link.url')}</span>
          </label>
          <Input
            autoFocus
            required
            disabled={pending}

            id={`${id}-url`}
            maxLength={8192}
            placeholder="https://…"
            value={url}
            visualSize="normal"
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
            disabled={pending}

            id={`${id}-title`}
            maxLength={255}
            value={title}
            visualSize="normal"
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
        <div className={cn(cn('flex flex-row', styles.actions), 'justify-end gap-4')}>
          <Button disabled={pending} size="lg" variant="outline" onClick={close}>
            {t('resources.link.cancel')}
          </Button>
          <Button
            aria-busy={pending}
            disabled={pending || pending}
            size="lg"
            type="submit"
            variant="default"
          >
            {pending && <Spinner />}
            {t(savedId ? 'resources.link.save' : 'resources.link.add')}
          </Button>
        </div>
      </div>
    </form>
  );
}

export const openProjectLinkModal = (props: ProjectLinkModalProps) =>
  createModal({
    classNames: {
      popup: styles.popup,
      close: 'hidden',
      content: 'overflow-y-auto p-0',
      header: 'hidden',
    },
    content: <ProjectLinkForm {...props} />,
    footer: null,
    title: translate(props.link ? 'resources.link.editHeading' : 'resources.link.addHeading', {
      ns: 'project',
    }),
    width: 640,
  });
