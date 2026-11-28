import assert from 'node:assert/strict';
import test from 'node:test';
import { createAttachmentReferences } from '../../lib/attachment-references.js';

const sourceName = 'whale-dream-attachment-number';
const imageId = '11111111-2222-4333-8444-555555555555';
const otherImageId = '22222222-3333-4444-8555-666666666666';

function fixture(t) {
  const bindings = new Map();
  const sources = new Map();
  const uploads = new Map();
  const sent = [];
  const notices = [];
  const conversation = {
    input: { for: input => input },
    resolveDraftAttachments: ids => ids.flatMap(id => uploads.has(id) ? [uploads.get(id)] : []),
    async sendSession(session, text, ids) {
      sent.push({ session, text, ids });
      return { kind: 'success' };
    },
  };
  const services = {
    conversation,
    sessions: { binding: id => bindings.get(id) },
    inputTriggers: {
      registerSource(source) {
        sources.set(source.name, source);
        return () => sources.delete(source.name);
      },
    },
  };
  let references;
  function reloadPlugin() {
    references?.dispose();
    references = createAttachmentReferences({ get: name => services[name] });
    return references;
  }
  reloadPlugin();
  t.after(() => references.dispose());

  function addImage(id, name = 'image.png') {
    uploads.set(id, { id, kind: 'image', file: { name } });
    return { name, kind: 'image', draftAttachmentId: id };
  }

  function addSession(sessionId, attachmentIds = []) {
    const state = { attachmentIds };
    const session = { sessionId };
    const composer = { closest: () => ({ dataset: { conversationSession: sessionId } }) };
    const input = {
      state: { getSnapshot: () => state },
      actions: { captureInsertion: () => ({ start: 0, end: 0 }) },
      insertReference(chip) { input.chip = chip; return true; },
      notify(level, message) { notices.push({ sessionId, level, message }); },
    };
    bindings.set(sessionId, { ctx: input, session });
    return { state, composer, input, session };
  }

  function insertImage(target, image) {
    const [entry] = references.trackComposer(target.composer, [image]);
    assert.ok(references.insert(target.composer, entry.key));
    assert.equal(target.input.chip.source, sourceName);
    return target.input.chip;
  }

  async function submit(target, chip, ids = target.state.attachmentIds) {
    const text = await sources.get(sourceName).codec.serialize(chip.ref);
    return conversation.sendSession(target.session, text, ids);
  }

  return { addImage, addSession, insertImage, submit, reloadPlugin, uploads, sent, notices };
}

test('a workspace switch preserves the exact draft image referenced by a chip', async t => {
  const f = fixture(t);
  const image = f.addImage(imageId);
  const source = f.addSession('workspace-a', [imageId]);
  const chip = f.insertImage(source, image);
  const target = f.addSession('workspace-b', [imageId]);
  source.state.attachmentIds = [];
  target.input.chip = chip;

  // The host can submit the carried draft before the new attachment rail renders.
  assert.deepEqual(await f.submit(target, chip), { kind: 'success' });
  assert.equal(f.sent[0].session, target.session);
  assert.deepEqual(f.sent[0].ids, [imageId]);
  const packet = JSON.parse(f.sent[0].text.match(/⟦WD-A1:(.+)⟧$/u)[1]);
  assert.deepEqual(packet.items.map(({ kind, name, slot }) => ({ kind, name, slot })), [
    { kind: 'image', name: 'image.png', slot: 0 },
  ]);
  assert.ok(f.sent[0].text.startsWith(`⟦图1·WD-${packet.batch}-1⟧`));
});

test('two same-named images preserve the reference to the exact native send slot', async t => {
  const f = fixture(t);
  const image = f.addImage(imageId);
  f.addImage(otherImageId);
  const source = f.addSession('workspace-a', [imageId]);
  const chip = f.insertImage(source, image);
  const target = f.addSession('workspace-b', [otherImageId, imageId]);
  source.state.attachmentIds = [];

  assert.deepEqual(await f.submit(target, chip), { kind: 'success' });
  assert.deepEqual(f.sent[0].ids, [otherImageId, imageId]);
  const packet = JSON.parse(f.sent[0].text.match(/⟦WD-A1:(.+)⟧$/u)[1]);
  const linkedNumber = Number(f.sent[0].text.match(/^⟦图(\d+)·WD-/u)[1]);
  assert.equal(packet.items.find(item => item.number === linkedNumber).slot, 1);
});

test('plugin reloading preserves an image reference while the host retains its draft', async t => {
  const f = fixture(t);
  const image = f.addImage(imageId);
  const session = f.addSession('session', [imageId]);
  const chip = f.insertImage(session, image);
  const reloaded = f.reloadPlugin();

  const [entry] = reloaded.trackComposer(session.composer, [image]);
  assert.equal(entry.key, chip.ref);
  assert.deepEqual(await f.submit(session, chip), { kind: 'success' });
  assert.deepEqual(f.sent[0].ids, [imageId]);
});

test('a stale image reference cannot silently bind to a different image with the same filename', async t => {
  const f = fixture(t);
  const image = f.addImage(imageId);
  const session = f.addSession('session', [imageId]);
  const chip = f.insertImage(session, image);
  f.addImage(otherImageId);

  assert.deepEqual(await f.submit(session, chip, [otherImageId]), { kind: 'error' });
  assert.deepEqual(f.sent, []);
  assert.equal(f.notices.at(-1).level, 'error');
});

test('an image missing from the native draft registry blocks submission', async t => {
  const f = fixture(t);
  const image = f.addImage(imageId);
  const session = f.addSession('session', [imageId]);
  const chip = f.insertImage(session, image);
  f.uploads.delete(imageId);

  assert.deepEqual(await f.submit(session, chip), { kind: 'error' });
  assert.deepEqual(f.sent, []);
  assert.equal(f.notices.at(-1).level, 'error');
});
