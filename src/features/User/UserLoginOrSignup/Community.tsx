import { Button } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import UserInfo from '../UserInfo';
import { trackLoginOrSignupClicked } from './trackLoginOrSignupClicked';

const UserLoginOrSignup = memo<{ onClick: () => void }>(({ onClick }) => {
  const { t } = useTranslation('auth');

  const handleClick = () => {
    void trackLoginOrSignupClicked({ spm: 'homepage.login_or_signup.click' });
    onClick();
  };

  return (
    <>
      <UserInfo />
      <div className="flex flex-col py-3 px-4 w-full">
        <Button block type={'primary'} onClick={handleClick}>
          {t('loginOrSignup')}
        </Button>
      </div>
    </>
  );
});

export default UserLoginOrSignup;
