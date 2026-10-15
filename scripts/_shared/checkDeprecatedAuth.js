/**
 * Shared utility to check for deprecated authentication environment variables.
 * Used by both dockerPrebuild.mts (build time) and startServer.js (Docker runtime).
 *
 * IMPORTANT: Keep this file as CommonJS (.js) for compatibility with startServer.js
 */

const AUTH_DOC_URL = 'https://orvilo.aspectlylabs.com/docs/self-hosting/auth';

/**
 * Deprecated environment variable checks configuration
 * @type {Array<{
 *   name: string;
 *   getVars: () => string[];
 *   message: string;
 *   docUrl?: string;
 *   formatVar?: (envVar: string) => string;
 *   severity?: 'error' | 'warning';
 * }>}
 */
const DEPRECATED_CHECKS = [
  {
    docUrl: AUTH_DOC_URL,
    getVars: () =>
      Object.keys(process.env).filter(
        (key) => key.startsWith('NEXT_AUTH') || key.startsWith('NEXTAUTH'),
      ),
    message: 'NextAuth has been removed from Orvilo. Configure the Clerk accounts portal instead.',
    name: 'NextAuth',
  },
  {
    docUrl: AUTH_DOC_URL,
    // The v1 in-app Clerk integration is gone; sign-in lives on the accounts
    // portal. CLERK_SECRET_KEY is NOT deprecated — it backs the Clerk session
    // exchange (POST /api/auth/clerk).
    getVars: () =>
      ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_WEBHOOK_SECRET'].filter(
        (key) => process.env[key],
      ),
    message:
      'The in-app Clerk integration has been removed from Orvilo. Sign-in runs on the accounts portal; configure the server-side Clerk session exchange using the current authentication reference.',
    name: 'Clerk',
  },
  {
    formatVar: (envVar) => {
      const mapping = {
        ENABLE_MAGIC_LINK: 'AUTH_ENABLE_MAGIC_LINK',
        NEXT_PUBLIC_AUTH_EMAIL_VERIFICATION: 'AUTH_EMAIL_VERIFICATION',
        NEXT_PUBLIC_ENABLE_MAGIC_LINK: 'AUTH_ENABLE_MAGIC_LINK',
      };
      return `${envVar} → Please use ${mapping[envVar]} instead`;
    },
    getVars: () =>
      [
        'ENABLE_MAGIC_LINK',
        'NEXT_PUBLIC_AUTH_EMAIL_VERIFICATION',
        'NEXT_PUBLIC_ENABLE_MAGIC_LINK',
      ].filter((key) => process.env[key]),
    message: 'Please update to the new environment variable names.',
    name: 'Deprecated Auth',
  },
  {
    getVars: () => (process.env['NEXT_PUBLIC_SERVICE_MODE'] ? ['NEXT_PUBLIC_SERVICE_MODE'] : []),
    message:
      'Orvilo 2.0 no longer supports client-side database mode. This environment variable is now obsolete and can be removed.',
    name: 'Service Mode',
  },
  {
    getVars: () => (process.env['ACCESS_CODE'] ? ['ACCESS_CODE'] : []),
    message:
      'ACCESS_CODE is no longer supported in Orvilo 2.0. Configure the Clerk accounts portal instead.',
    name: 'Access Code',
  },
  {
    getVars: () =>
      process.env['NEXT_PUBLIC_ENABLE_BETTER_AUTH'] ? ['NEXT_PUBLIC_ENABLE_BETTER_AUTH'] : [],
    message:
      'Better Auth has been removed. Remove NEXT_PUBLIC_ENABLE_BETTER_AUTH and configure the Clerk accounts portal.',
    name: 'Better Auth Flag',
  },
  {
    getVars: () => ['NEXT_PUBLIC_AUTH_URL', 'AUTH_URL'].filter((key) => process.env[key]),
    message:
      'AUTH_URL is no longer needed. Configure APP_URL for the app and AUTH_ACCOUNTS_URL for the Clerk accounts portal.',
    name: 'Auth URL',
  },
  {
    formatVar: () => 'OIDC_JWKS_KEY → Please use JWKS_KEY instead',
    getVars: () => (process.env['OIDC_JWKS_KEY'] ? ['OIDC_JWKS_KEY'] : []),
    message: 'OIDC_JWKS_KEY has been renamed to JWKS_KEY.',
    name: 'OIDC JWKS',
  },
  {
    formatVar: () => 'APP_URL should not end with a trailing slash',
    getVars: () => (process.env['APP_URL']?.endsWith('/') ? ['APP_URL'] : []),
    message:
      'APP_URL ends with a trailing slash which causes double slashes in redirect URLs (e.g., https://example.com//). Please remove the trailing slash.',
    name: 'APP_URL Trailing Slash',
  },
  {
    docUrl: AUTH_DOC_URL,
    getVars: () =>
      Object.keys(process.env).filter(
        (key) =>
          process.env[key] &&
          ([
            'AUTH_SECRET',
            'AUTH_SSO_PROVIDERS',
            'AUTH_ALLOWED_EMAILS',
            'AUTH_ADDITIONAL_TRUSTED_ORIGINS',
            'AUTH_TRUSTED_ORIGINS',
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'GITHUB_CLIENT_ID',
            'GITHUB_CLIENT_SECRET',
            'COGNITO_CLIENT_ID',
            'COGNITO_CLIENT_SECRET',
            'COGNITO_DOMAIN',
            'COGNITO_REGION',
            'COGNITO_USERPOOL_ID',
            'MICROSOFT_CLIENT_ID',
            'MICROSOFT_CLIENT_SECRET',
            'ZITADEL_CLIENT_ID',
            'ZITADEL_CLIENT_SECRET',
            'ZITADEL_ISSUER',
            'AZURE_AD_CLIENT_ID',
            'AZURE_AD_CLIENT_SECRET',
            'AZURE_AD_TENANT_ID',
          ].includes(key) ||
            /^AUTH_(?:AUTH0|AUTHELIA|AUTHENTIK|AZURE_AD|CASDOOR|CLOUDFLARE_ZERO_TRUST|COGNITO|GENERIC_OIDC|GITHUB|GOOGLE|KEYCLOAK|LOGTO|MICROSOFT|OKTA|ZITADEL)_/.test(
              key,
            )),
      ),
    message:
      'Better Auth settings are ignored. Configure sign-in providers and registration restrictions in Clerk, and connect the accounts portal using AUTH_ACCOUNTS_URL, CLERK_SECRET_KEY and CLERK_ISSUER. These settings do not configure GitHub App or Linear integrations.',
    name: 'Retired Better Auth configuration',
    severity: 'warning',
  },
  {
    docUrl: AUTH_DOC_URL,
    getVars: () => {
      const hasEmailService =
        process.env['SMTP_HOST'] || process.env['EMAIL_SERVICE_PROVIDER'] === 'resend';
      const hasEmailVerification = process.env['AUTH_EMAIL_VERIFICATION'] === '1';
      if (hasEmailService && !hasEmailVerification) {
        return ['AUTH_EMAIL_VERIFICATION'];
      }
      return [];
    },
    message:
      'Email service is configured but email verification is disabled. Consider setting AUTH_EMAIL_VERIFICATION=1 to verify user email ownership during registration.',
    name: 'Email Verification',
    severity: 'warning',
  },
];

/**
 * Print a single deprecation block (error or warning)
 */
function printIssueBlock(name, vars, message, docUrl, formatVar, severity = 'error') {
  const isWarning = severity === 'warning';
  const icon = isWarning ? '⚠️' : '❌';
  const log = isWarning ? console.warn : console.error;

  log(`\n${icon} ${name}`);
  log('─'.repeat(50));
  log(
    isWarning
      ? 'Authentication configuration notice:'
      : 'Detected deprecated environment variables:',
  );
  for (const envVar of vars) {
    log(`  • ${formatVar ? formatVar(envVar) : envVar}`);
  }
  log(`\n${message}`);
  if (docUrl) {
    log(`📖 Documentation: ${docUrl}`);
  }
}

/**
 * Check for deprecated authentication environment variables and exit if found
 * @param {object} options
 * @param {string} [options.action='redeploy'] - Action hint in error message ('redeploy' or 'restart')
 */
function checkDeprecatedAuth(options = {}) {
  const { action = 'redeploy' } = options;

  const errors = [];
  const warnings = [];

  for (const check of DEPRECATED_CHECKS) {
    const foundVars = check.getVars();
    if (foundVars.length > 0) {
      const issue = { ...check, foundVars };
      if (check.severity === 'warning') {
        warnings.push(issue);
      } else {
        errors.push(issue);
      }
    }
  }

  // Print warnings (non-blocking)
  if (warnings.length > 0) {
    console.warn('\n' + '═'.repeat(70));
    console.warn(`⚠️  WARNING: Found ${warnings.length} authentication configuration notice(s)`);
    console.warn('═'.repeat(70));

    for (const issue of warnings) {
      printIssueBlock(
        issue.name,
        issue.foundVars,
        issue.message,
        issue.docUrl,
        issue.formatVar,
        'warning',
      );
    }

    console.warn('\n' + '═'.repeat(70));
    console.warn('These are recommendations. Your application will still run.');
    console.warn('═'.repeat(70) + '\n');
  }

  // Print errors and exit (blocking)
  if (errors.length > 0) {
    console.error('\n' + '═'.repeat(70));
    console.error(`❌ ERROR: Found ${errors.length} deprecated environment variable issue(s)!`);
    console.error('═'.repeat(70));

    for (const issue of errors) {
      printIssueBlock(
        issue.name,
        issue.foundVars,
        issue.message,
        issue.docUrl,
        issue.formatVar,
        'error',
      );
    }

    console.error('\n' + '═'.repeat(70));
    console.error(`Please update your environment variables and ${action}.`);
    console.error('═'.repeat(70) + '\n');
    process.exit(1);
  }
}

module.exports = { checkDeprecatedAuth };
