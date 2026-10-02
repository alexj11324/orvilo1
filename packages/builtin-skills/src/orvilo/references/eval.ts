const content = `# orvilo eval - Evaluation Workflow Management

Manage external evaluation workflows for testing agent quality.

## Subcommands

- \`orvilo eval run get --run-id <id>\` - Get run information
- \`orvilo eval run set-status --run-id <id> --status <completed|external>\` - Set run status
- \`orvilo eval dataset get --dataset-id <id>\` - Get dataset information
- \`orvilo eval run-topics list --run-id <id> [--only-external]\` - List topics in a run
- \`orvilo eval threads list --topic-id <id>\` - List threads by topic
- \`orvilo eval messages list --topic-id <id> [--thread-id <id>]\` - List messages
- \`orvilo eval test-cases count --dataset-id <id>\` - Count test cases
- \`orvilo eval run-topic report-result --run-id <id> --topic-id <id> --score <n>\` - Report result

## Tips

- Evaluation runs test agent responses against datasets
- Use \`report-result\` to submit scores for individual topics
`;

export default content;
