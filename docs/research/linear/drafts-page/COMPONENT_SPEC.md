# Linear Drafts page: observed contract

Reference: `https://linear.app/bdiverifier/drafts`, inspected 2026-09-22 in the authenticated Brave personal profile, desktop viewport 1729 × 889, light theme, English locale. The account showed two comment drafts. Private draft and issue text is intentionally omitted here.

## Observed

- Primary navigation has Drafts immediately after Agent, with a numeric draft count badge. The active route is `/drafts` under the workspace slug.
- Main panel begins at x=244, y=8 and has a 12px radius and pale background. The `Drafts` heading is at x=263, y=23, 13px, medium weight. An icon button named `Discard all` sits at the top right.
- A `Comments` section appears below the header. Two cards are laid out in a two-column grid: x=263–731 and x=748–1216, top y=99, height 139. Each shows a first-line comment excerpt, abbreviated relative time, `Commenting on an issue`, and a rich-content preview. A whole-card `Edit draft` link opens the issue; a top-right `Discard draft` icon button is separate.
- Cards and text use the reference's Inter Variable family. Card text is roughly 13px. The rich-content preview can contain an issue link chip; preserve rich editor JSON rather than reducing it to plain text.
- `Edit draft` is a read-only navigation; discard controls are destructive and were inventoried, not exercised against reference data.

## Inferred implementation mapping

- Orvilo's comment drafts map to existing task comments. The draft row uses the task's public identifier (for example `PTP-1`) to open `/task/:taskIdentifier?draft=1`; that task's comment composer restores the editor JSON, including attachment nodes, or markdown as fallback.
- A successful comment send removes the draft. Pending autosave must be drained before deletion so an older write cannot recreate it afterward.

## Unobserved

- Empty, loading, error, single-card, mobile and dark states were not observed in this populated reference session. The empty state wording and any confirmation for `Discard all` are unknown. Implement accessible product states using Orvilo conventions without claiming visual parity for them.
- No write action was performed on the reference account, so exact discard transitions and post-send timing remain unverified reference behavior.
