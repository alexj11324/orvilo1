#!/usr/bin/env bash
# Regression test for the try_pg failure status propagation in setup-cloud-dev.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/setup-cloud-dev.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  [[ "$actual" == "$expected" ]] || fail "expected '$expected', got '$actual'"
}

assert_contains() {
  local file="$1"
  local text="$2"
  grep -Fq -- "$text" "$file" || fail "expected '$text' in $file"
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

mkdir -p "$tmp_dir/bin"
cat > "$tmp_dir/bin/psql" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "${PSQL_ARGS_FILE:?}"
exit 23
SH
chmod +x "$tmp_dir/bin/psql"

export PATH="$tmp_dir/bin:$PATH"
export PSQL_ARGS_FILE="$tmp_dir/psql-args"

function_file="$tmp_dir/try_pg.sh"
awk '
  /^try_pg\(\) \{/ { capture = 1 }
  /^# pg_admin SQL/ { exit }
  capture { print }
' "$SCRIPT" > "$function_file"
# shellcheck disable=SC1090
source "$function_file"

set +e
try_pg 'postgresql://user:password@db.example/orvilo_preview' 'SELECT 1' \
  > "$tmp_dir/stdout" 2> "$tmp_dir/stderr"
status=$?
set -e

assert_eq "$status" "23"
assert_contains "$tmp_dir/psql-args" "-v ON_ERROR_STOP=1"
echo "setup-cloud-dev try_pg tests passed"
