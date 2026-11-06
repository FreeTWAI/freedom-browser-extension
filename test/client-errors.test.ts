import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryKeyStore } from '../src/device-key.ts';
import { createPairingClient } from '../src/pairing-client.ts';
import { createMemorySessionStore } from '../src/session-store.ts';
import { createClock } from './support/clock.ts';
import { createFakePlatform } from './support/fake-platform.ts';
import { stagingProfile } from './support/profiles.ts';

test('disconnect when already disconnected does nothing but clear device keys', async () => {
  const clock = createClock();
  const platform = createFakePlatform({ clock, origin: stagingProfile.origin, clientId: stagingProfile.clientId, environment: stagingProfile.environment });
  const keys = createMemoryKeyStore();
  const store = createMemorySessionStore();
  const client = await createPairingClient({ profile: stagingProfile, fetchImpl: platform.fetchImpl, clock, keys, store });

  await client.disconnect();
  const view = client.view();
  assert.equal(view.phase, 'disconnected');
  assert.equal(await keys.load(), null);
});
