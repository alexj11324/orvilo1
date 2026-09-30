import { t as translate } from 'i18next';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, ModalFooter, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermission } from '@/hooks/usePermission';
import { useGlobalStore } from '@/store/global';
import { useSessionStore } from '@/store/session';

interface CreateGroupContentProps {
  id: string;
}

const CreateGroupContent = memo<CreateGroupContentProps>(({ id }) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const { allowed: canCreate } = usePermission('create_content');

  const toggleExpandSessionGroup = useGlobalStore((s) => s.toggleExpandSessionGroup);
  const [updateSessionGroup, addCustomGroup] = useSessionStore((s) => [
    s.updateSessionGroupId,
    s.addSessionGroup,
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    // Enter fires as fast as the user repeats it — a second pass while
    // `addCustomGroup` is in flight would create a second group and move the
    // session into whichever request settles last.
    if (!canCreate || loading) return;
    if (input.length === 0 || input.length > 20 || input.trim() === '')
      return toast.warning(t('sessionGroup.tooLong'));

    setLoading(true);
    try {
      const groupId = await addCustomGroup(input);
      await updateSessionGroup(id, groupId);
      toggleExpandSessionGroup(groupId, true);
      toast.success(t('sessionGroup.createSuccess'));
      close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col py-4 px-4">
        <Input
          autoFocus
          disabled={!canCreate || loading}
          placeholder={t('sessionGroup.inputPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
        />
      </div>
      <ModalFooter>
        <Button onClick={close}>{t('cancel', { ns: 'common' })}</Button>
        <Button disabled={!canCreate} loading={loading} variant="default" onClick={handleCreate}>
          {t('ok', { defaultValue: 'OK', ns: 'common' })}
        </Button>
      </ModalFooter>
    </>
  );
});

CreateGroupContent.displayName = 'MobileCreateGroupContent';

export const openCreateGroupModal = (id: string) =>
  createModal({
    content: <CreateGroupContent id={id} />,
    footer: null,
    styles: { content: { padding: 0 } },
    title: translate('sessionGroup.createGroup', { ns: 'chat' }),
    width: 400,
  });
