import assert from 'node:assert/strict';
import test from 'node:test';
import { startRuntime } from '../src/background/runtime.ts';
import { createMemoryKeyStore } from '../src/device-key.ts';
import { createChromeSessionStore } from '../src/session-store.ts';
import type { ExtensionSnapshot, MessageSender } from '../src/messages.ts';
import { createClock } from './support/clock.ts';
import { createFakeChrome } from './support/fake-chrome.ts';
import { createFakePlatform } from './support/fake-platform.ts';
import { stagingProfile } from './support/profiles.ts';

const runtimeId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function panel(epoch: number): MessageSender {
  return { id: runtimeId, url: `chrome-extension://${runtimeId}/index.html` };
}

test('openVerification and removeSite and disconnect', async () => {
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
  assert.equal(began.ok, true);

  const opened = await fake.send({ type: 'pairing.openVerification', epoch: began.snapshot.epoch }, panel(began.snapshot.epoch)) as { ok: boolean; snapshot: ExtensionSnapshot };
  assert.equal(opened.ok, true);

  platform.approve(began.snapshot.userCode ?? '');
  await runtime.pump();
  clock.advance(5000);
  await runtime.pump();
  const connected = await runtime.snapshot();
  assert.equal(connected.phase, 'connected');

  fake.grantOrigin('https://a.example');
  await fake.send({ type: 'site.start', epoch: connected.epoch, origin: 'https://a.example', tabId: 7 }, panel(connected.epoch));

  const removed = await fake.send({ type: 'site.removePermission', epoch: connected.epoch, origin: 'https://a.example' }, panel(connected.epoch)) as { ok: boolean; snapshot: ExtensionSnapshot };
  assert.equal(removed.ok, true);

  const disconnected = await fake.send({ type: 'pairing.disconnect', epoch: connected.epoch }, panel(connected.epoch)) as { ok: boolean; snapshot: ExtensionSnapshot };
  assert.equal(disconnected.ok, true);

  runtime.stop();
});
