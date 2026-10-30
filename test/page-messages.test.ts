import assert from 'node:assert/strict';
import test from 'node:test';
import { handleWindowMessage } from '../src/content/page-messages.ts';

test('handleWindowMessage securely discards page postMessage to enforce the untrusted boundary', () => {
  let sunk = 0;
  const sink = () => { sunk += 1; };

  handleWindowMessage({ data: { type: 'site.hello' } }, sink);
  assert.equal(sunk, 0, 'sink should not be called with safe-looking messages');

  handleWindowMessage({ data: { type: 'pairing.begin' }, origin: 'https://evil.example' }, sink);
  assert.equal(sunk, 0, 'sink should not be called with malicious origin');

  handleWindowMessage({ source: 'window', data: { __proto__: { polluted: true } } }, sink);
  assert.equal(sunk, 0, 'sink should not be called with prototype pollution payload');
});
