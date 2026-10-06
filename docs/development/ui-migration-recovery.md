# UI migration recovery

The migration to composable UI components must preserve each caller's existing controls and layout. This recovery addresses the photographed conversation and topic-menu regressions.

- Menus size to their content, with a 192px default minimum and the platform's available-width cap. Explicit widths and multiline descriptions remain supported.
- Shorthand CodeBlock restores language and copy controls. Explicit children own the chrome; copy-only children preserve intentionally hidden language labels. Embedded tool code uses ghost framing inside its enclosing card.
- Edited-file previews use semantic diff rows and dual line numbers; their copy control keeps the original patch, including file headers and addition/removal markers. Metadata-only patches retain readable text.
- Accordion actions sit beside the trigger. Callers that allow independent sections explicitly set multiple. Labelled dividers use two lines around their label.
- Conversation paragraph spacing and process-to-result spacing are restored. The syntax-theme preview uses the same highlighter as conversation Markdown and receives the selected theme.

## Verification

Renderer source revision: `599b11e5bc00a575ef9cc99548c8e48d0563d1d3`. The authenticated Electron fixture displayed the existing twelve-call conversation. Its empty-argument resource result has one outer frame and one divider; Copy changed to Copied, and the independent expand action kept the workflow open. Long Chinese topic actions remain on one line. Native windows were checked at approximately 1000px and 1290px in dark and light appearance.

![Long Chinese topic menu in Electron](./ui-migration-evidence/599b11e5b/native-topic-menu-dark.png)

![Tool result in a narrow light Electron window](./ui-migration-evidence/599b11e5b/native-tool-narrow-light.png)

Forty focused rendered regressions pass (CodeBlock, workflow actions, edited-file previews, empty arguments). The owning package checks add 31 tests, and the sidebar menu adapter adds five. The new CodeBlock test exercises actual clipboard output and rendered opt-outs; it is retained to satisfy the repository's bug-regression requirement despite the component-test advisory. Remote Typecheck and full E2E status are separate CI gates.
