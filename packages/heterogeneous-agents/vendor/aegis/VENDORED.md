# Vendored Aegis method pack

- **Source**: <https://github.com/GanyuanRan/Aegis>
- **Pinned commit**: `aef06c242414fc05bb50589ef41d2309017d4a12` (tag `v2.12.0`)
- **License**: MIT (`LICENSE`, vendored alongside; copyright Jesse Vincent 2025, Ganyuan Ran 2025-2026)
- **Scope**: only `skills/` + `LICENSE` are vendored. Host manifests
  (`.claude-plugin/`, `.codex-plugin/`, `.opencode/`, …), hooks, scripts and
  docs stay upstream — Orvilo installs the pack through its own materializer
  (`src/aegis/index.ts`), not through Aegis's per-host installers.

## Updating

1. Check out the desired upstream commit in a clone of
   `github.com/GanyuanRan/Aegis`.

2. Replace `vendor/aegis/skills` and `vendor/aegis/LICENSE` with the new
   revision; update the pinned commit above.

3. Regenerate the embedded manifest:

   ```bash
   node scripts/vendor-aegis.mjs
   ```

4. Run `bun run check` once: repo markdown lint (remark) normalizes the
   vendored `*.md` in place, so the checked-in tree carries repo formatting
   rather than byte-exact upstream bytes — content is unchanged. Then
   regenerate the manifest once more so `files.generated.ts` embeds the
   same linted bytes as the vendor tree.

5. Commit the vendor tree and the regenerated
   `src/aegis/files.generated.ts` together.

`files.generated.ts` is checked in (not a build artifact) so the published
`lh` bundle — which ships `dist` only — embeds the pack as data with no
file-system dependency at runtime.
