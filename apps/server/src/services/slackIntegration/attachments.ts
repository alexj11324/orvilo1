import { isRecord } from '@orvilo/utils/object';

import { slackApi, SlackProviderError } from './oauth';

/** Resolve file IDs through the installation; never fetch event-supplied URLs. */
export async function downloadSlackAttachments(token: string, ids: string[]) {
  const files = [];
  for (const id of ids) {
    const result = await slackApi('files.info', token, { file: id });
    const file = isRecord(result.file) ? result.file : undefined;
    if (!file || file.id !== id || typeof file.url_private_download !== 'string')
      throw new SlackProviderError('slack_file_unavailable');
    const url = new URL(file.url_private_download);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'files.slack.com' ||
      url.username ||
      url.password ||
      url.port
    )
      throw new SlackProviderError('slack_file_url_invalid');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
    });
    if (!response.ok) throw new SlackProviderError('slack_file_download_failed');
    const buffer = Buffer.from(await response.arrayBuffer());
    files.push({
      buffer,
      name: typeof file.name === 'string' ? file.name : id,
      mimeType: typeof file.mimetype === 'string' ? file.mimetype : undefined,
      size: buffer.length,
    });
  }
  return files;
}
