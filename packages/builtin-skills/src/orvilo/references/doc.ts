const content = `# orvilo doc - Document Management

Manage documents (text content that can be standalone or in knowledge bases).

## Subcommands

- \`orvilo doc list [-L <limit>] [--file-type <type>] [--source-type <type>]\` - List documents
- \`orvilo doc view <id>\` - View document content
- \`orvilo doc create -t <title> -b <body> [--kb <kbId>] [--parent <folderId>]\` - Create document
- \`orvilo doc batch-create <jsonFile>\` - Batch create documents from JSON file
- \`orvilo doc edit <id> [-t <title>] [-b <body>]\` - Edit document
- \`orvilo doc delete <ids...> [--yes]\` - Delete documents
- \`orvilo doc parse <fileId> [--with-pages]\` - Parse uploaded file into document
- \`orvilo doc link-topic <docId> <topicId>\` - Associate document with topic
- \`orvilo doc topic-docs <topicId> [--type <type>]\` - List documents for a topic

## Tips

- Use \`-F <filePath>\` instead of \`-b\` to read body content from a file
- \`orvilo doc parse\` extracts text from uploaded files (PDF, DOCX, etc.)
`;

export default content;
