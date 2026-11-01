import assert from 'node:assert/strict';
import test from 'node:test';

test('content script connects to site-session and handles site.bound', async () => {
  const messages: any[] = [];
  let onMessageListener: ((msg: any) => void) | undefined;

  (globalThis as any).chrome = {
    runtime: {
      connect(info: any) {
        assert.equal(info.name, 'site-session');
        return {
          postMessage(msg: any) {
            messages.push(msg);
          },
          onMessage: {
            addListener(listener: any) {
              onMessageListener = listener;
            }
          }
        };
      }
    }
  };

  let windowMessageListener: any;
  (globalThis as any).window = {
    addEventListener(type: string, listener: any) {
      if (type === 'message') {
        windowMessageListener = listener;
      }
    }
  };

  await import('../src/content/index.ts');

  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], { type: 'site.hello' });
  assert.ok(windowMessageListener);
  assert.ok(onMessageListener);

  // Test valid and invalid site.bound messages
  onMessageListener!(null);
  onMessageListener!(123);
  onMessageListener!({});
  onMessageListener!({ type: 'other' });
  onMessageListener!({ type: 'site.bound', epoch: 'not-a-number' });
  onMessageListener!({ type: 'site.bound', epoch: 42 });

  // Test window message
  windowMessageListener!({ data: 'test' });
});
