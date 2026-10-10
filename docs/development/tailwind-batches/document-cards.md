# Document creation cards

The creation streaming and result cards now use Tailwind utility strings instead
of direct antd-style imports. Sidebar border, card background, primary icon and
foreground title use the existing semantic bridge. The existing 16px card
geometry is preserved; this batch does not introduce a new radius token or
change the design contract. The result expand button retains its exact existing
shadow through `--ant-box-shadow`, pending the shared theme migration.

Copy, edit, portal expansion, empty-content loading, scrolling and markdown
rendering are unchanged. Shared Markdown, streaming content and loader components
still have their own dependency migration work. Removing the two imports here
does not imply that all transitive antd dependencies have been removed.

Scoped check, normal hooks and independent review are recorded on the PR. No
source-string tests are added for this style conversion. 未做真机验证；visual
parity and Electron acceptance are not claimed.
