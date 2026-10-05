import { DEFAULT_SECURITY_BLACKLIST, InterventionChecker } from '@orvilo/agent-execution';
import { CircleAlert } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
    <Alert className="border-transparent bg-transparent" variant="destructive">
      <CircleAlert />
      <AlertTitle>{t('localFiles.securityBlacklist.warning')}</AlertTitle>
      <AlertDescription>
        {
          <div className="flex flex-col gap-1" style={{ fontSize: 12 }}>
            <div>{securityCheck.reason ? t(securityCheck.reason as any) : undefined}</div>
          </div>
        }
      </AlertDescription>
    </Alert>
  );
});

SecurityBlacklistWarning.displayName = 'SecurityBlacklistWarning';

export default SecurityBlacklistWarning;
