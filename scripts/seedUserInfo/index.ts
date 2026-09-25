/**
 * Seed users.full_name and users.username for a user (by email) so the
 * onboarding agent can render <user_info> with a displayName candidate
 * without going through OAuth.
 *
 * Usage:
 *   bun run workflow:seed-user-info -- <email> [--fullName="..."] [--username="..."]
 *   tsx scripts/seedUserInfo/index.ts <email> [--fullName="..."] [--username="..."]
 *
 * Env:
 *   DATABASE_URL   (required) target Postgres connection string; exits 1 when unset
 *   NODE_ENV       (optional) selects layered .env.[env] / .env.[env].local files
 *
 * Guard rail: explicit-target seed — writes ONLY the single user row matched by
 * the required <email> argument and is idempotent (re-running sets the same
 * values), so no extra confirmation gate (see scripts/README.md → Guard rails).
 *
 * Defaults when flags are omitted:
 *   fullName = "Innei"
 *   username = derived from the email local part
 *
 * Exit behavior: 0 on success; 1 when email is missing, the user is not found,
 * or DATABASE_URL is unset.
 */
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { eq } from 'drizzle-orm';

const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` }));

const parseFlag = (name: string) => {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const main = async () => {
  const email = process.argv[2];

  if (!email || email.startsWith('--')) {
    console.error('❌ Missing email argument.');
    console.error(
      '   Usage: tsx scripts/seedUserInfo/index.ts <email> [--fullName=...] [--username=...]',
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Configure .env first.');
    process.exit(1);
  }

  const fullName = parseFlag('fullName') ?? 'Innei';
  const username = parseFlag('username') ?? email.split('@')[0];

  const { serverDB } = await import('../../packages/database/src/server');
  const { users } = await import('../../packages/database/src/schemas/user');

  const matched = await serverDB
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      username: users.username,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const target = matched[0];

  if (!target) {
    console.error(`❌ No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`🔍 Found user: id=${target.id}, email=${target.email}`);
  console.log('   Before:');
  console.log('     full_name =', target.fullName ?? null);
  console.log('     username  =', target.username ?? null);

  await serverDB.update(users).set({ fullName, username }).where(eq(users.id, target.id));

  console.log('✅ Seed complete.');
  console.log('   After:');
  console.log('     full_name =', fullName);
  console.log('     username  =', username);
  console.log('   Restart dev server (if running) and reload the onboarding page.');

  process.exit(0);
};

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
