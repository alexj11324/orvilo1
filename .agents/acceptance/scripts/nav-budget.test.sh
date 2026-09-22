#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/nav-budget.cjs"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local value="$1"
  local expected="$2"
  [[ "$value" == *"$expected"* ]] || fail "expected '$expected' in '$value'"
}

assert_lacks() {
  local value="$1"
  local unexpected="$2"
  [[ "$value" != *"$unexpected"* ]] || fail "did not expect '$unexpected' in '$value'"
}

# A row whose right edge is shared with its siblings is filling the panel: its width is a
# consequence of the panel being 280 wide, so it cannot show a deficit. This is the bug the
# first version shipped — it compared that width against 244, measured one quantity twice,
# and reported the difference as a shortage. The check could never fail.
cat > "$TEST_TMP/stretched.json" <<'JSON'
{
  "meta": { "url": "app://renderer/ws/project/p/overview" },
  "elements": [
    { "i": 0, "tag": "SPAN", "box": { "x": 10, "y": 0, "w": 28, "h": 28 }, "visible": true, "ownText": "AG", "style": {} },
    { "i": 1, "tag": "DIV", "box": { "x": 44, "y": 40, "w": 228, "h": 20 }, "visible": true, "ownText": "Inbox", "style": { "textOverflow": "ellipsis" } },
    { "i": 2, "tag": "DIV", "box": { "x": 44, "y": 64, "w": 228, "h": 20 }, "visible": true, "ownText": "My issues", "style": { "textOverflow": "ellipsis" } },
    { "i": 3, "tag": "DIV", "box": { "x": 44, "y": 88, "w": 228, "h": 20 }, "visible": true, "ownText": "Reviews", "style": { "textOverflow": "ellipsis" } },
    { "i": 4, "tag": "DIV", "box": { "x": 44, "y": 112, "w": 228, "h": 20 }, "visible": true, "ownText": "Teams", "style": { "textOverflow": "ellipsis" } },
    { "i": 5, "tag": "DIV", "box": { "x": 46, "y": 8, "w": 166, "h": 22 }, "visible": true, "ownText": "Agent Testing User's workspace", "style": { "textOverflow": "ellipsis" } }
  ]
}
JSON

out="$(node "$SCRIPT" "$TEST_TMP/stretched.json" 280 244)"
assert_contains "$out" "STRETCHED (no verdict)"
assert_contains "$out" "4 stretched, 2 width-independent"
# The regression: the old script summed the stretched rows into a shortage verdict.
assert_lacks "$out" "TRUNCATES"
# The one row whose width does not track the panel is the one that gets judged — and it fits.
assert_contains "$out" "right= 212 w= 166 fits"
assert_contains "$out" "target 244 -> FITS"

# A width-independent row that genuinely overruns must still be reported as overrunning.
cat > "$TEST_TMP/overrun.json" <<'JSON'
{
  "meta": { "url": "app://renderer/ws/project/p/overview" },
  "elements": [
    { "i": 0, "tag": "DIV", "box": { "x": 46, "y": 8, "w": 210, "h": 22 }, "visible": true, "ownText": "A workspace name that is far too long", "style": { "textOverflow": "ellipsis" } }
  ]
}
JSON

over="$(node "$SCRIPT" "$TEST_TMP/overrun.json" 280 244)"
assert_contains "$over" "EXCEEDS"
assert_contains "$over" "target 244 -> EXCEEDS"

# The tool must state the limit of its own evidence rather than let a reader assume the
# snapshot settled it: whether a stretched row ellipsizes needs the text's natural advance
# width, which no snapshot records.
assert_contains "$out" "NOT ANSWERABLE from a snapshot"
assert_contains "$out" "measureText"

# A snapshot with nothing visible in the nav column is a wrong-snapshot error, not a pass.
cat > "$TEST_TMP/empty.json" <<'JSON'
{ "meta": { "url": "app://renderer/ws/project/p/overview" }, "elements": [] }
JSON

if node "$SCRIPT" "$TEST_TMP/empty.json" > /dev/null 2>&1; then
  fail "accepted a snapshot with nothing in the nav column"
fi

if node "$SCRIPT" > /dev/null 2>&1; then
  fail "accepted a missing snapshot argument"
fi

echo "nav-budget tests passed"
