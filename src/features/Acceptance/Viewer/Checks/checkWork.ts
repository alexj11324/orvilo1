/**
 * The repair prompt points the agent at the acceptance record itself, so the
 * reviewer does not have to hand-summarize evidence and feedback.
 *
 * It deliberately names no CLI command. The review-loop CLI
 * (`lh acceptance feedback`, `lh acceptance run …`) was retired with the
 * standalone platform, and a prompt that tells an agent to run a command that
 * no longer exists is worse than one that says nothing: it sends the agent
 * hunting for a tool that will answer `unknown command`. What survives is the
 * in-app acceptance panel the reviewer is already looking at, plus the
 * run-scoped `orvilo-acceptance-evidence` tool for putting evidence back.
 */
export const buildRepairPrompt = (acceptanceId: string) =>
  `Repair the work behind acceptance ${acceptanceId} using its recorded review feedback.

Read the acceptance in the app: every check carries the reviewer's comments, the annotations circled on its evidence, and any attachments. That set — not a summary — is the full feedback to handle this round. Fix the code item by item.

Then put the new evidence back on the SAME acceptance with the \`orvilo-acceptance-evidence\` tool: call \`listCriteria\` to read the criteria recorded for this run, and \`submitEvidence\` against the existing criterion ids. Do not mint new criteria. Keep the final report in the same language the previous rounds used.`;
