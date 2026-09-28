# Human issue cursors

The work item board shows live cursors from human collaborators. A cursor is
attached to a visible issue card by its task ID and its position within the
card, so a different board layout can still place it on the same issue.
Private card subtrees do not publish an issue anchor. Agent activity bubbles
are not rendered on this board.

## Personal visibility

**Settings → Appearance → Collaboration → Show My Work Item Cursor** controls
whether teammates see your cursor and presence. It is on by default. Turning
it off keeps your room connection open to receive teammates' updates, but
stops your browser from sending presence. The server signs the preference into
new room tickets, and the gateway also suppresses presence from existing
sockets and tickets issued before the change. The settings save reconnects
active rooms to obtain a fresh ticket.

The gateway receives a signed internal visibility command for each change.
Each reveal uses a new visibility generation stored in the user's preference:
only tickets with that generation can publish presence. This permits an
immediate reveal without reactivating an older ticket. A failed save restores
the previous setting or leaves the user concealed.

The visibility rule is held in the gateway process. A deployment with multiple
gateway instances must deliver the command to every instance, or share the
rule; the current repository does not define that topology. A gateway restart
also loses the in-memory rule, so a still-valid old ticket can publish until
its 120-second expiry. Confirm the gateway deployment model before relying on
the switch as a strict cross-restart privacy boundary.
