import { Alert } from '@lobehub/ui/base-ui';
import { DEFAULT_SECURITY_BLACKLIST, InterventionChecker } from '@orvilo/agent-execution';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface SecurityBlacklistWarningProps {
  args: Record<string, any>;
}

const SecurityBlacklistWarning = memo<SecurityBlacklistWarningProps>(({ args }) => {
  const { t } = useTranslation('tool');

  const securityCheck = useMemo(
    () => InterventionChecker.checkSecurityBlacklist(DEFAULT_SECURITY_BLACKLIST, args),
    [args],
  );

  if (!securityCheck.blocked) return null;

  return (
    <Alert
      showIcon
      title={t('localFiles.securityBlacklist.warning')}
      type="error"
      variant="borderless"
      description={
        <div className="flex flex-col gap-1" style={{ fontSize: 12 }}>
          <div>{securityCheck.reason ? t(securityCheck.reason as any) : undefined}</div>
        </div>
      }
    />
  );
});

SecurityBlacklistWarning.displayName = 'SecurityBlacklistWarning';

export default SecurityBlacklistWarning;
