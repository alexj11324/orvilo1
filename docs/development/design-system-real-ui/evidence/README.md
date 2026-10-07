# Real desktop DESIGN verification

This follow-up applies existing DESIGN roles to actual Agent, Project, API Key and custom MCP creation surfaces. Normal fields/actions use 36px, cards use 8px, command menus and modals use 12px, and cancel/test actions use a secondary outline. Dense property selectors, argument helper actions and the existing compact Settings ModelPicker retain their roles.

All images below are original native screenshots of the standard Orvilo Electron app connected to the existing cloud account. They show normal product routes, not the earlier assembled component fixture. Source stages, image SHA-256 values, environment and interaction scope are recorded in [provenance.json](provenance.json).

## Normal cloud pages

Product commit: `fab614c49bef72be67cb66f98248d4be304bf1d0`. The 11 reviewed file hashes matched the captured final candidate before and after normal commit hooks. Baseline is the original source for each surface at `54505515edd8e710344ed753d078f02dd356bf25`. Both sides use the same signed-in account, abx workspace, zh-CN and 1200×800 logical Electron window (2400×1600 original JPEG). Normal pages use deployed backend `27f398621e48c7c7b7fdd10847152b345374153b`, independently verified through [deployment 37686628169](https://github.com/alexj11324/orvilo1/actions/runs/37686628169) and its running image digest. The local renderer revision and deployed backend revision are distinct.

| Actual product surface                                            | Before                                        | After                                       |
| ----------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| API Key list: card 14→8px; create 32→36px                         | ![Before](before/apikey-page-light-zh.jpg)    | ![After](after/apikey-page-light-zh.jpg)    |
| API Key creation: full-access and permissions cards 10→8px        | ![Before](before/apikey-create-light-zh.jpg)  | ![After](after/apikey-create-light-zh.jpg)  |
| Projects: ordinary new-project entry 28→36px                      | ![Before](before/projects-empty-light-zh.jpg) | ![After](after/projects-empty-light-zh.jpg) |
| Project creation: modal 21→12px; submit pill 28px→normal 36px/8px | ![Before](before/create-project-light-zh.jpg) | ![After](after/create-project-light-zh.jpg) |
| MCP HTTP: type cards 12→8px; fields 32→36px; secondary cancel     | ![Before](before/mcp-http-light-zh.jpg)       | ![After](after/mcp-http-light-zh.jpg)       |
| MCP STDIO: normal command/argument fields                         | ![Before](before/mcp-stdio-light-zh.jpg)      | ![After](after/mcp-stdio-light-zh.jpg)      |
| MCP JSON import: normal 36px actions, secondary cancel            | ![Before](before/mcp-import-light-zh.jpg)     | ![After](after/mcp-import-light-zh.jpg)     |

The light MCP HTTP/STDIO/import screenshots were captured after the main style change and before the later environment/header-card and command-menu radius follow-ups. Those later controls are outside the compared visible viewports. The provenance records this source stage explicitly. Final source is covered by the following environment/menu screenshots and by all four dark screenshots.

| Final control follow-up                                                                     | Actual native evidence                                          |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Command suggestions use 12px overlay radius; keyboard Down opens and Escape closes          | ![Command suggestions](after/mcp-command-menu-light-zh.jpg)     |
| Environment editor uses 8px card radius; two empty argument rows retain compact helpers     | ![Environment card](after/mcp-env-card-light-zh.jpg)            |
| Blank API Key auth fields, description and avatar are normal 36px; test action is secondary | ![Blank auth fields](after/mcp-bearer-light-zh.jpg)             |
| Expanded project identifiers scroll while the creation action remains reachable             | ![Expanded project](after/create-project-expanded-light-zh.jpg) |

## Dark verification

These final-source captures show the same normal routes with an unsaved form. Native chrome, selected MCP type, labels, focus and footer controls remain visible. Automatic appearance was restored after verification.

| Project creation                                  | API Key creation                                 |
| ------------------------------------------------- | ------------------------------------------------ |
| ![Dark project](after/create-project-dark-zh.jpg) | ![Dark API Key](after/apikey-create-dark-zh.jpg) |

| MCP HTTP                                 | MCP STDIO lower form                       |
| ---------------------------------------- | ------------------------------------------ |
| ![Dark HTTP](after/mcp-http-dark-zh.jpg) | ![Dark STDIO](after/mcp-stdio-dark-zh.jpg) |

API Key form keyboard Tab reaches the name field. Project creation is disabled with an empty name, and its expanded identifiers remain accessible by scrolling. HTTP/STDIO selection, blank API Key auth, JSON import open/cancel, command suggestions and empty dynamic argument rows were exercised. Long MCP forms use a scroll viewport: the top HTTP/import images can show part of the next field at its lower edge. The lower-form screenshots and scrolling checks cover the remaining controls; the fixed footer stays visible. All unsaved forms were closed. No key, project or connector was created, and no connection test or installation was run.

Independent Light review found no introduced P0/P1/P2. Scoped lint and standard commit hooks passed; two Hook warnings are in existing unchanged code. These changes only apply style roles, so no stylesheet-string mirror tests were added. Full Typecheck is remote CI only.

## Earlier first-Agent phase

Product commit `ce737c937445592c084e21bf91b145d8567482ec` applies normal 36px creation fields/actions, an 8px advanced-settings card and secondary 12px explanation text. Rescan stays 28px and the three Settings ModelPicker consumers keep their compact default. Baseline is merged `a8da6ed8fda846ad4fc05432902caaf358c53511`. The five files were temporarily restored from that baseline with an empty product diff, captured, and restored exactly. Its backend commit was not verified at that earlier capture and remains labelled accordingly.

| Actual first-Agent setup  | Before                                     | After                                    |
| ------------------------- | ------------------------------------------ | ---------------------------------------- |
| Orvilo AI, light          | ![Before](before/first-agent-light-zh.jpg) | ![After](after/first-agent-light-zh.jpg) |
| Local Codex preview, dark | ![Before](before/create-codex-dark-zh.jpg) | ![After](after/create-codex-dark-zh.jpg) |

The dark images corroborate the five ordinary fields changing 32→36px at scale 2. Keyboard navigation, Agent/model menus and expanded-form scrolling were checked. The initial capture did not submit an Agent. After the later deployment made ordinary pages accessible, no further private-Agent creation was needed for this style verification.

![Expanded first-Agent form](after/first-agent-expanded-light-zh.jpg)

## Verification boundary

The abx project and API Key lists are genuinely empty. Existing populated board/detail cards, task-round popovers, generated API Key success, MCP installation/connection results and official dependency views were not reached or changed. OAuth fields use the same ordinary input role but their authorization flow was not exercised. This evidence proves the displayed creation surfaces and interactions; it does not certify every frontend page, custom palettes, backend behavior changes, or a complete Agent/key/project/connector creation transaction.
