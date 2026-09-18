#!/usr/bin/env bash
# Preserve remotely persisted Preview identity keys across resumable setup runs.
load_preview_identity_inventory() {
  local response
  : "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
  : "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is required}"
  response=$(curl -fsS "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_ORG_ID:-}" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}") || return 1
  REMOTE_PREVIEW_IDENTITY_KEYS=$(jq -er '
    .envs | if type == "array" then . else error("missing environment inventory") end
    | [.[] | select((.target | index("preview")) and (.gitBranch == null)) | .key] | join("\n")
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
  payload=$(jq -n --arg key "$key" --arg value "$value" \
    '{key:$key,value:$value,type:"sensitive",target:["preview"]}') || return 1
  # Create-only: a competing setup run cannot be overwritten after inventory.
  curl -fsS -X POST \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?upsert=false&teamId=${VERCEL_ORG_ID:-}" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" -H 'Content-Type: application/json' \
    -d "$payload" > /dev/null || return 1
  REMOTE_PREVIEW_IDENTITY_KEYS="${REMOTE_PREVIEW_IDENTITY_KEYS:-}
$key"
}
