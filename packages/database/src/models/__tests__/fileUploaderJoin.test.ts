import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { files, users } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { FileModel } from '../file';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'file-uploader-user';
const fileId = 'file-uploader-file';

const seedAvatarlessUploader = async () => {
  await serverDB.insert(users).values({
    // avatar null: the nested `uploader: { avatar, ... }` select nulled the
    // whole object when its first column was null (drizzle-orm 0.45.2), so a
    // live upload read as "no uploader" — same failure as listMembersWithProfiles.
    avatar: null,
    email: 'uploader@example.com',
    fullName: 'Fixture Uploader',
    id: userId,
    username: 'fixtureuploader',
  });
  await serverDB.insert(files).values({
    fileType: 'text/plain',
    id: fileId,
    name: 'fixture.txt',
    size: 10,
    url: 'https://example.com/fixture.txt',
    userId,
  });
};

beforeEach(seedAvatarlessUploader);

afterEach(async () => {
  await serverDB.delete(files).where(eq(files.id, fileId));
  await serverDB.delete(users).where(eq(users.id, userId));
});

describe('FileModel.query uploader join', () => {
  it('returns the uploader profile when the uploader has no avatar', async () => {
    const model = new FileModel(serverDB, userId);
    const rows = await model.query();

    const row = rows.find((r) => r.id === fileId);
    expect(row).toBeDefined();
    expect(row?.uploader).not.toBeNull();
    expect(row?.uploader?.fullName).toBe('Fixture Uploader');
  });
});
