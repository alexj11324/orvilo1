# Project properties and activity

Targets: src/features/Projects (excluding backend policy retirement) and project icon owners.
Reference: measured status trigger/menu from an authenticated isolated Linear session and user candidate screenshots; private reference captures are not published.
Interaction: click property to open chooser, hover/focus paint only. Read JSON measured states before editing.
Status trigger: 28px high, padding3px6px, border0, radius9999, transparent default, muted theme hover. Project status uses16px hexagonal glyph family; Issue uses circular14px. Reuse existing ProjectStatusIcon and ProjectActiveStatusIcon first, don't replace Project status model with Issue enums.
Priority/lead/members/labels must use canonical existing Issue property-trigger/picker components when contracts fit; preserve source callbacks and accessible name/selected member avatar. No static outlined Select/Combobox inputs as property displays. Pills hug content; choices/search remain in popover, never disabled wrapper-shrink or stretch to full rail.
Remove Overview OrchestrationPolicyCard (do not relocate). Root handles backing policy retirement. Don't edit backend/services/store policy owners without coordination.
Comment/update composer is dedicated project activity, no chat prompt frame. Put mode switch in activity toolbar outside editor. Feed rows normal body14px, line-height consistent tokens, 12/16px gaps; timestamp secondary12px. Expanded update content retains current project semantics and persistence.
Default/hover/open/focus, dark/light and narrow supported; no clipping or glyph disappearance. No current-selection summaries added.
Regression checks for functional pickers/save/draft preservation; no stylesheet source-mirror tests. Scoped lint/tests; root owns runtime proof.
