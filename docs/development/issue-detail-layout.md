# Issue detail layout

The routed issue page (`/task/[tid]`) no longer redefines the main/rail breakpoint. The `task-detail` container query in `taskDetailLayoutStyles` is the only switch between the single column and the main column plus 232px properties rail. The page only sets a 24px gutter and caps the content width at 1120px, centered.
