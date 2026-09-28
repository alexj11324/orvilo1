# Reviews behavior inventory

All reference actions below were read-only and performed in a dedicated Brave tab.

## Tabs and list

| Control      | Observed result                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `For you`    | `/reviews`; populated groups `Ready to merge` and `Created by you`; 17 visible queue entries in this account state; empty detail reported 43 reviews.               |
| `Created`    | `/reviews/created`; populated `Open` group; empty detail reported 135 reviews.                                                                                      |
| Review row   | Navigates to `/review/:slug`; list stays mounted and the row gains a selected fill; detail title and content load on the right.                                     |
| Group header | Exposes button semantics and a disclosure glyph. Collapse was inventoried but not exercised because the bounded slice does not implement Linear grouping semantics. |

## Header menus

`Add filter` opens a 221×508 menu under the header. Visible entries were: Advanced filter; Status; Author; Reviewers; GitHub team reviewers; Content; Repository owner; Repository name; Opened date; Updated date; Merged date; Closed date; Quick to review; Missing issue.

`Display options` opens an anchored panel with these controls:

- Grouping: Focus
- Ordering: Importance
- Closed reviews: Past day
- Show drafts
- Show GitHub team reviews
- Badge count: All
- Display properties: Repository, ID, Author, Opened at, GitHub team, Status details, Quick to review, SLA

The Orvilo queue contract currently accepts only `tab` and `cursor`. These controls therefore remain an explicit service/product gap rather than being reproduced as client-only state.

## Selected detail

The observed Overview state retained the master list and exposed:

- pull-request title and additions/deletions in the header;
- pull-request actions, repository actions, Copy URL and full-window review;
- Overview and Diff tabs;
- state, reviewers, checks, branch status and linked-issue entry;
- description and activity;
- comment/reaction/thread actions;
- diff file controls and reviewed checkboxes below the Overview scroll.

No submit, merge, resolve, comment, reaction, issue-link or reviewer mutation was exercised on the reference.

The selected pull-request actions menu contained: Open in GitHub, Favorite, Copy submenu, Link issue submenu, Select reviewers submenu, Convert to draft, Merge pull request, and Close pull request. The repository/PR identity menu contained: Open in GitHub, Copy GitHub URL, Copy branch name, Copy pull request number submenu, Copy review URL, and Copy title as link. Menus were dismissed without choosing an item.

Selecting `Diff` changed the URL to `/review/:slug/changes` while preserving the master list and selected row. The detail switched to a file review surface with Files and Commits controls, per-file additions/deletions, Reviewed checkboxes, display options, expandable unchanged-line ranges and file action menus.

## Responsive states

At 768 px and 390 px the reference rendered a full-width list with no dead detail column. The selected-detail transition was observed as route-backed; exact mobile toolbar geometry remains a gap because the extension CDP viewport override was reset during the client route transition.

## Hover and scrolling

Rows have an 8 px radius and a light hover/selected fill. The list and detail scroll independently. Group headings use sticky positioning inside the list scroll owner. No time-driven animation or scroll-driven tab switch was observed.
