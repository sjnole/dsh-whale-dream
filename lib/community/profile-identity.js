import catalog from '../profile/catalog.json' with { type: 'json' };

const frameIds = new Set(catalog.themes.map(theme => theme.id));
const avatarPathPattern = /^avatars\/[a-z0-9_-]{1,80}\/[a-z0-9_-]{1,96}\.(?:png|jpe?g|webp)$/i;

export function readAvatarPath(value) {
  return typeof value === 'string' && avatarPathPattern.test(value) ? value : '';
}

export function readFrameId(value) {
  return frameIds.has(value) ? value : '';
}

export function withPostFrame(person, savedFrame) {
  return { ...person, frameId: readFrameId(savedFrame) };
}
