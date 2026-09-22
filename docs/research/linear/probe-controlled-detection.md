# Controlled detection on a real Electron CDP snapshot

The `reference` and `candidate` labels below are the **same actual Orvilo snapshot** before and after deliberately mutating a local copy. They do not represent Linear parity. The original captured node is attached in `probe-main-inline-candidate.json`.

Changed only two values in the local copy: main status border-radius `9999px` → `8px`, first start-calendar SVG path `M8 2v4` → `M4 2v12`. The comparator exited 1 with two differences, zero unresolved pairs and zero unreadable fields. This proves the collector and gate detect those actual captured fields. It is not a full product interaction test or same-viewport reference comparison.

# Pairwise parity table

reference: app\://renderer/ws-useragenttes/project/parity-test-project/overview
candidate: app\://renderer/ws-useragenttes/project/parity-test-project/overview
viewport: 1686x986 vs 1686x986

pairs: 3 · differing properties: 2 · unresolved pairs: 0 · unreadable properties: 0

## main status radius from live capture

| property            | reference | candidate |          |
| ------------------- | --------- | --------- | -------- |
| `borderRadius`      | 9999px    | 8px       | **DIFF** |
| `fontSize`          | 13px      | 13px      | ok       |
| `fontWeight`        | 500       | 500       | ok       |
| `padding`           | 3px 6px   | 3px 6px   | ok       |
| `gap`               | 8px       | 8px       | ok       |
| `behavior.isButton` | true      | true      | ok       |

## start date icon path from live capture

| property   | reference | candidate |          |
| ---------- | --------- | --------- | -------- |
| `svg.path` | M8 2v4    | M4 2v12   | **DIFF** |

## calendar SVG count from live capture

| property             | reference | candidate |     |
| -------------------- | --------- | --------- | --- |
| `svg.pathCount`      | 9         | 9         | ok  |
| `svg.viewBox`        | 0 0 24 24 | 0 0 24 24 | ok  |
| `svg.geometry.width` | 16        | 16        | ok  |
