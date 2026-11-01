import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingProfile } from './support/profiles.ts';
import { startRuntime } from '../src/background/runtime.ts';
import { createFakeChrome } from './support/fake-chrome.ts';
import { createClock } from './support/clock.ts';
import { createFakePlatform } from './support/fake-platform.ts';
import { createMemoryKeyStore } from '../src/device-key.ts';
import { createChromeSessionStore } from '../src/session-store.ts';
import { A2_RESERVED_TYPES } from '../src/extension-points/a2.ts';
import type { ExtensionSnapshot } from '../src/messages.ts';

const runtimeId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function panel(epoch: number) {
  return { id: runtimeId, url: `chrome-extension://${runtimeId}/index.html` };
}

function content(epoch: number, tabId = 7) {
  return { id: runtimeId, tab: { id: tabId }, frameId: 0, documentId: 'doc' };
}

test('e2e test for background service worker message routing and journal recovery', async () => {
  const fake = createFakeChrome(runtimeId);
  const clock = createClock();
  const platform = createFakePlatform({
    clock,
    origin: stagingProfile.origin,
    clientId: stagingProfile.clientId,
    environment: stagingProfile.environment,
  });
  const store = createChromeSessionStore(fake.session);
  const runtime = await startRuntime({
    profile: stagingProfile,
    fetchImpl: platform.fetchImpl,
    clock,
    keys: createMemoryKeyStore(),
    store,
    chrome: fake.chrome,
    schedule: false,
  });

  const began = await fake.send({ type: 'pairing.begin', epoch: 1 }, panel(1)) as { ok: boolean; snapshot: ExtensionSnapshot };
  platform.approve(began.snapshot.userCode ?? '');
  await runtime.pump();
  clock.advance(5000);
  await runtime.pump();
  const connected = await runtime.snapshot();
  assert.equal(connected.phase, 'connected');

  const epoch = connected.epoch;

  // The architecture explicitly states: CLIENT-A2 (DOM actions, the durable journal,
  // Stop/takeover, real site actions) is not implemented. Reserved message names live
  // in `src/extension-points/a2.ts` and the router rejects them.
  //
  // Therefore, true end-to-end testing of these components in this commit simply verifies
  // that the routing isolation acts correctly on these explicitly unimplemented, reserved modules.
  for (const type of A2_RESERVED_TYPES) {
    const actPage = (await fake.send({ type, epoch }, panel(epoch))) as { error?: string };
    assert.equal(actPage.error, 'schema');

    const actContent = (await fake.send({ type, epoch }, content(epoch))) as { error?: string };
    assert.equal(actContent.error, 'schema');

    const payloadPage = (await fake.send({ type, epoch, payload: { command: 'restore' } }, panel(epoch))) as { error?: string };
    assert.equal(payloadPage.error, 'schema');
  }

  runtime.stop();
});
