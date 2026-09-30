import { FolderX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import GuideActions from '../GuideActions';
import GuideShell from '../GuideShell';
import type { HeterogeneousAgentGuideStateProps } from '../types';

const WorkingDirectoryState = ({ error, onRetry, variant }: HeterogeneousAgentGuideStateProps) => {
  const { t } = useTranslation('chat');

  return (
    <GuideShell
      icon={<FolderX size={24} />}
      title={t('workingDirectoryGuide.title')}
      variant={variant}
      actions={
        <GuideActions
          retryPrimary
          retryLabel={t('workingDirectoryGuide.actions.retry')}
          onRetry={onRetry}
        />
      }
      headerDescription={
        <div className="text-muted-foreground">{t('workingDirectoryGuide.desc')}</div>
      }
    >
      {error?.workingDirectory && (
        <div className="font-mono rounded bg-muted px-1">{error.workingDirectory}</div>
      )}
      <div className="text-muted-foreground" style={{ fontSize: 12 }}>
        {t('workingDirectoryGuide.hint')}
      </div>
    </GuideShell>
  );
};

export default WorkingDirectoryState;
