import assert from 'node:assert/strict';
import test from 'node:test';
import { readAvatarPath, readFrameId, withPostFrame } from '../../lib/community/profile-identity.js';

test('post frame keeps the captured theme and does not inherit a later theme', () => {
  const author = { uid: 'author', frameId: readFrameId('orca') };
  const saved = withPostFrame(author, 'humpback');
  assert.equal(saved.frameId, 'humpback');
  assert.equal(author.frameId, 'orca');
  assert.equal(withPostFrame(author, null).frameId, '');
  assert.equal(withPostFrame(author, '../../theme').frameId, '');
});

test('community avatar references accept only bucket avatar paths', () => {
  assert.equal(readAvatarPath('avatars/author/image-abcd.png'), 'avatars/author/image-abcd.png');
  for (const invalid of ['https://example.com/photo.jpg', 'posts/author/image.png', 'avatars/../image.png', 'avatars/user/image.svg']) {
    assert.equal(readAvatarPath(invalid), '');
  }
});
