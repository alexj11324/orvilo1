import { Button } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import { useTranslation } from 'react-i18next';

import { useGitHubConnection } from './useGitHubConnection';

interface ConnectGitHubButtonProps {
  onConnected: () => void | Promise<void>;
}

/** A hosted GitHub authorization works for both the Web and desktop client. */
const ConnectGitHubButton = ({ onConnected }: ConnectGitHubButtonProps) => {
  const { t } = useTranslation('common');
  const { connect, starting, waiting } = useGitHubConnection(onConnected);

  return (
    <Button loading={starting || waiting} onClick={() => void connect()}>
      {t(
        waiting
          ? 'reviews.connectGitHubWaiting'
          : isDesktop
            ? 'reviews.connectGitHubInBrowser'
            : 'reviews.connectGitHubAction',
      )}
    </Button>
  );
};

export default ConnectGitHubButton;
