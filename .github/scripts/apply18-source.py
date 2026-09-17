from pathlib import Path
r=Path.cwd()
def rep(path,old,new):
    p=r/path;s=p.read_text();assert s.count(old)==1,(path,s.count(old),old[:80]);p.write_text(s.replace(old,new))
for file,job in [('preview-smoke.yml','smoke'),('preview-e2e.yml','e2e')]:
    p=r/'.github/workflows'/file;s=p.read_text()
    s=s.replace('group: preview-validation-${{ inputs.base_url }}','group: preview-validation-${{ github.repository }}')
    s=s.replace('# suites for this deployment without cancelling either one.', '# suites across deployments, because the shared fallback database is mutable.')
    s=s.replace(f'  {job}:\n',f'  {job}:\n    if: github.actor == github.repository_owner && github.triggering_actor == github.repository_owner\n',1)
    s=s.replace("          printf 'deployment-ref=%s\\n' \"$GITHUB_REF_NAME\" >> \"$GITHUB_OUTPUT\"",'''          deployment_ref=$(jq -er '.ref | select(type == "string" and length > 0)' <<< "$deployment")
          if [[ "$deployment_ref" == *$'\\n'* || "$deployment_ref" == *$'\\r'* ]]; then
            echo "deployment ref contains an invalid newline" >&2
            exit 1
          fi
          printf 'deployment-ref=%s\\n' "$deployment_ref" >> "$GITHUB_OUTPUT"''')
    p.write_text(s)
rep('.github/workflows/preview-db.yml','      github.actor == github.repository_owner','      github.actor == github.repository_owner &&\n      github.triggering_actor == github.repository_owner')
rep('.github/workflows/preview-db.yml','    steps:\n      - name: Validate exact-head CI', '''    steps:
      - name: Checkout preflight helpers
        uses: actions/checkout@v6
        with:
          persist-credentials: false
          ref: ${{ github.sha }}

      - name: Validate exact-head CI''')
(r/'scripts/ci/resolvePreviewMigration.mjs').write_text('''import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const resolvePreviewMigration = ({ adminUrl, appUrl, ca, tlsHost }) => {
  if (!adminUrl || !appUrl || !ca?.trim()) {
    throw new Error('Preview migration requires admin URL, application URL and pinned CA');
  }
  const admin = new URL(adminUrl);
  const app = new URL(appUrl);
  if (![admin, app].every(url => ['postgres:', 'postgresql:'].includes(url.protocol))) {
    throw new Error('Preview migration requires PostgreSQL URLs');
  }
  if (tlsHost) admin.hostname = tlsHost;
  if (admin.hostname !== app.hostname || (admin.port || '5432') !== (app.port || '5432')) {
    throw new Error('Preview admin and application URLs must address the same database server');
  }
  const database = decodeURIComponent(app.pathname.slice(1));
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database) || ['postgres', 'template0', 'template1'].includes(database)) {
    throw new Error('Preview application database must not be a maintenance database');
  }
  admin.pathname = app.pathname;
  // The migration DB factory supplies the pinned CA separately. Do not weaken
  // certificate verification with a connection-string compatibility fallback.
  admin.searchParams.delete('uselibpqcompat');
  admin.searchParams.set('sslmode', 'verify-full');
  return admin.href;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(resolvePreviewMigration({
      adminUrl: process.env.PREVIEW_DB_ADMIN_URL,
      appUrl: process.env.PREVIEW_APP_DATABASE_URL,
      ca: process.env.PREVIEW_DATABASE_SSL_CA,
      tlsHost: process.env.PREVIEW_DB_TLS_HOST,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid Preview migration configuration');
    process.exitCode = 1;
  }
}
''')
p=r/'.github/workflows/db-migrate.yml';s=p.read_text().replace('  migrate:\n','  migrate:\n    if: github.actor == github.repository_owner && github.triggering_actor == github.repository_owner\n',1)
s=s.replace('          PREVIEW_DATABASE_URL: ${{ secrets.PREVIEW_DB_ADMIN_URL }}', '          PREVIEW_DB_ADMIN_URL: ${{ secrets.PREVIEW_DB_ADMIN_URL }}\n          PREVIEW_APP_DATABASE_URL: ${{ secrets.PREVIEW_DATABASE_URL }}')
s=s.replace('selected_url="$PREVIEW_DATABASE_URL"', 'selected_url=$(node scripts/ci/resolvePreviewMigration.mjs)')
a=s.index('          if [[ "$TARGET" == "preview" && -n "$PREVIEW_DB_TLS_HOST" ]]')
b=s.index('          echo "::add-mask::$selected_url"',a)
s=s[:a]+s[b:]
s=s.replace('# DATABASE_SSL_CA 对 preview/production 可选配置。','# PREVIEW_DATABASE_URL 指定应用库；Preview 必须配置 PREVIEW_DATABASE_SSL_CA。')
p.write_text(s)
(r/'scripts/ci/previewIdentitySecrets.sh').write_text('''#!/usr/bin/env bash
# Preserve remotely persisted Preview identity keys across resumable setup runs.
load_preview_identity_inventory() {
  local response
  : "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
  : "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is required}"
  response=$(curl -fsS "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_ORG_ID:-}" \\
    -H "Authorization: Bearer ${VERCEL_TOKEN}") || return 1
  REMOTE_PREVIEW_IDENTITY_KEYS=$(jq -er '
    .envs | if type == "array" then . else error("missing environment inventory") end
    | [.[] | select((.target | index("preview")) and (.gitBranch == null)) | .key] | join("\\n")
  ' <<< "$response") || return 1
  REMOTE_GITHUB_IDENTITY_KEYS=$(gh secret list --json name --jq '.[].name') || return 1
}

preview_identity_exists() {
  grep -qx "$1" <<< "${REMOTE_PREVIEW_IDENTITY_KEYS:-}" || {
    [[ "$1" == KEY_VAULTS_SECRET ]] &&
      grep -qx PREVIEW_KEY_VAULTS_SECRET <<< "${REMOTE_GITHUB_IDENTITY_KEYS:-}"
  }
}

resolve_preview_identity_secret() {
  local key="$1" output="$2" value
  value=$(_existing "$key" || true)
  if preview_identity_exists "$key"; then
    if [[ -z "$value" ]]; then
      warn "$key 已在远端存在；请提供原值，不会自动生成或覆盖。"
      ask_secret "$key" "粘贴现有 $key（留空终止）："
      value="${!key}"
    fi
  elif [[ -z "$value" ]]; then
    if [[ "$key" == JWKS_KEY ]]; then
      if ! value=$(node scripts/generate-oidc-jwk.mjs 2>/dev/null); then
        warn "JWKS 生成失败；请提供有效的现有值或安装依赖后重试。"
        ask_secret "$key" "JWKS_KEY（留空终止）："
        value="${!key}"
      fi
    else
      value=$(gen_secret) || return 1
    fi
  fi
  [[ -n "$value" ]] || { warn "$key 原值缺失，停止设置以免轮换现有密钥。"; return 1; }
  printf -v "$output" '%s' "$value"
}

publish_preview_identity_secret() {
  local key="$1" value="$2" payload
  if grep -qx "$key" <<< "${REMOTE_PREVIEW_IDENTITY_KEYS:-}"; then
    note "保留远端 Preview $key，不进行 upsert。"
    return 0
  fi
  payload=$(jq -n --arg key "$key" --arg value "$value" \\
    '{key:$key,value:$value,type:"sensitive",target:["preview"]}') || return 1
  # Create-only: a competing setup run cannot be overwritten after inventory.
  curl -fsS -X POST \\
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?upsert=false&teamId=${VERCEL_ORG_ID:-}" \\
    -H "Authorization: Bearer ${VERCEL_TOKEN}" -H 'Content-Type: application/json' \\
    -d "$payload" > /dev/null || return 1
  REMOTE_PREVIEW_IDENTITY_KEYS="${REMOTE_PREVIEW_IDENTITY_KEYS:-}
$key"
}
''')
p=r/'scripts/setup-cloud-dev.sh';s=p.read_text()
s=s.replace('gen_secret() { openssl rand -base64 32; }', '''gen_secret() { openssl rand -base64 32; }

# shellcheck source=ci/previewIdentitySecrets.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ci/previewIdentitySecrets.sh"''')
s=s.replace('ask_secret VERCEL_TOKEN "粘贴 Vercel token："','''ask_secret VERCEL_TOKEN "粘贴 Vercel token："
load_preview_identity_inventory || { warn "无法读取远端密钥清单，停止以免覆盖已有配置。"; exit 1; }
resolve_preview_identity_secret KEY_VAULTS_SECRET PREVIEW_KEY_VAULTS_SECRET
resolve_preview_identity_secret AUTH_SECRET PREVIEW_AUTH_SECRET
resolve_preview_identity_secret JWKS_KEY PREVIEW_JWKS_KEY''')
s=s.replace('PREVIEW_KEY_VAULTS_SECRET=$(_existing KEY_VAULTS_SECRET || true)\n[[ -n "$PREVIEW_KEY_VAULTS_SECRET" ]] || PREVIEW_KEY_VAULTS_SECRET=$(gen_secret)\n','')
a=s.index('PREVIEW_AUTH_SECRET=$(_existing AUTH_SECRET || true)',s.index('# ── Stage 6'))
b=s.index('printf ',a)
s=s[:a]+s[b:]
for key in ('AUTH_SECRET','KEY_VAULTS_SECRET','JWKS_KEY'):
    s=s.replace(f'vercel_env {key} "$PREVIEW_{key}" preview',f'publish_preview_identity_secret {key} "$PREVIEW_{key}"')
s=s.replace('set_secret PREVIEW_KEY_VAULTS_SECRET "$PREVIEW_KEY_VAULTS_SECRET"','''if grep -qx PREVIEW_KEY_VAULTS_SECRET <<< "$REMOTE_GITHUB_IDENTITY_KEYS"; then
  note "保留现有 GitHub PREVIEW_KEY_VAULTS_SECRET；轮换需单独操作。"
else
  set_secret PREVIEW_KEY_VAULTS_SECRET "$PREVIEW_KEY_VAULTS_SECRET"
fi''')
s=s.replace('say "Vercel 会自动构建出 Preview URL；部署成功后 preview-smoke 会跑 @smoke。"', 'say "通过已配置的 Preview 发布流程取得不可变 URL 后，由仓库所有者手动运行 Preview Smoke/E2E。"')
s=s.replace('write_env AUTH_SECRET "$PREVIEW_AUTH_SECRET"','write_env AUTH_SECRET "$PREVIEW_AUTH_SECRET"\n  write_env JWKS_KEY "$PREVIEW_JWKS_KEY"')
p.write_text(s)
p=r/'scripts/previewDatabaseWorkflow.test.ts';s=p.read_text().replace('  name?: string;','  uses?: string;\n  name?: string;',1)
s=s.replace("    expect(gateIndex).toBeGreaterThanOrEqual(0);",'''    const checkoutIndex = provisionWorkflow.jobs.provision.steps.findIndex(
      step => step.name === 'Checkout preflight helpers' && step.uses?.startsWith('actions/checkout@'),
    );
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(checkoutIndex).toBeLessThan(gateIndex);''')
p.write_text(s)
p=r/'scripts/previewValidationWorkflow.test.ts';s=p.read_text().replace('  jobs: Record<string, { steps: WorkflowStep[] }>;','  concurrency: { group: string };\n  jobs: Record<string, { if?: string; steps: WorkflowStep[] }>;')
s=s.replace("  it('passes the validated deployment ref",'''  it('requires an explicit repository-owner trust decision before injecting secrets', () => {
    expect(workflow.jobs[jobName].if).toContain('github.actor == github.repository_owner');
    expect(workflow.jobs[jobName].if).toContain('github.triggering_actor == github.repository_owner');
    expect(workflow.concurrency.group).toBe('preview-validation-${{ github.repository }}');
  });

  it('passes the validated deployment ref''')
p.write_text(s)
