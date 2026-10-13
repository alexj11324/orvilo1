/** The person must see every orchestration criterion and budget before approving. */
export const buildAcpToolApprovalQuestion = (
  identifier: string,
  apiName: string,
  args: unknown,
): string => {
  const preview = JSON.stringify(args);
  const shown =
    identifier !== 'orvilo-orchestration-workflow' && preview.length > 2000
      ? `${preview.slice(0, 2000)}…`
      : preview;
  return `Allow tool "${identifier}.${apiName}" to run?\n\n${shown}`;
};
