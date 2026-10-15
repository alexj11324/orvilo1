# Server editor backend

This entry owns the server's document editor lifecycle. It uses the DOM-free
Lexical engine from `@lobehub/editor` 4.29.2, retained under
`../../vendor/lobehub-editor-4.29.2` with its original license and per-file source
hashes. The twenty upstream modules are unchanged; the authored entry and command
bindings remain outside that vendor directory and receive normal lint checks.

The server imports `@orvilo/editor-runtime/headless` and supplies
`nativeEditorRuntimeCommands` when connecting its kernel to `EditorRuntime`.
These are the command objects registered by this backend, including the actual
per-operation result command. The runtime's default SDK command objects remain
available for the existing browser editor and must not be substituted here.

The owning package tests exercise real edits, missing targets, stable IDs,
proposal acceptance/rejection, history, tables, math and CJK serialization. Server
tests also exercise the real PageAgent runtime through the persistence boundary.
These tests do not verify browser widgets, Electron rendering or complete SDK
removal. The browser editor still requires the SDK peer until its own migration
and product verification are complete.
