# Freedom Browser Extension

<!-- freedom-repository-guide:start -->
## 在自由工坊的位置

[自由工坊](https://freetwai.com) 讓會員先完成定位、選擇公會並領取 Repo 技能書，再以供貨、商店、開源作品、行銷與小隊共同完成成果。

這個目錄是 Chrome 擴充功能「自由工坊」的原始碼。會員用它把瀏覽器連到自由工坊。連線憑證只留在這次瀏覽器工作階段。

本 repo 的維護者負責這個擴充功能；公會職稱與自填 GitHub slug 不授予寫入權。

程式入口：[src/](src/)、[scripts/build.mjs](scripts/build.mjs)、[test/](test/)、[docs/architecture.md](docs/architecture.md)。協作先讀 [CONTRIBUTING.md](CONTRIBUTING.md)，讓 Agent 讀 [AGENTS.md](AGENTS.md)；從[本倉 Issues](https://github.com/FreeTWAI/freedom-browser-extension/issues)認領、[查看既有 PR](https://github.com/FreeTWAI/freedom-browser-extension/pulls)避免重工。

從模板建立的 repo 不等於 GitHub fork，不繼承原 repo ID。中央會員與公會仍經 freedom-platform API，不複製中央資料庫。跨 repo 的協定由[中央平台](https://github.com/FreeTWAI/freedom-platform)維護。
<!-- freedom-repository-guide:end -->

A Manifest V3 Chrome extension that pairs a browser to Freedom Workshop. Access and refresh tokens stay in `chrome.storage.session`. The device key is a nonextractable P-256 key in IndexedDB. The extension does not store provider keys, customer data, or payment data.

Licensing is undecided (`NOASSERTION`). This repository does not grant reuse rights. There is no Chrome Web Store listing and no GitHub Pages site.

## Build

Node.js 24. The default build is the staging profile.

```sh
npm test
npm run typecheck
npm run build
npm run build:production
```

| Command | Profile | Platform origin | Environment |
| --- | --- | --- | --- |
| `npm run build` | staging | `https://staging.freetwai.com` | `staging-next` |
| `npm run build:production` | production | `https://freetwai.com` | `next` |
| `npm run build:e2e` | e2e, tests only | `http://127.0.0.1:4391` | `local` |

`client_id` is the placeholder `freedom-browser-extension` until the platform registers an extension client. Staging and production reject any other origin at runtime. Output is `dist/<profile>/` and is not committed.

`npm run test:browser` loads the e2e build in local Chromium against a loopback fake. It is not part of `npm test`.

Rollup is pinned to 4.63.6 because 4.64.0's tree-shaking made the panel build take minutes, and the pin can be removed once a later Rollup builds the panel in seconds.

## What this version does

- Device-authorization pairing, DPoP proofs, and bootstrap status for `runtime_kind: extension`.
- A Traditional Chinese side panel: 未連接, 等待你在自由工坊確認, 已連接, 已撤銷, 已過期, 需要重新連接.
- Per-site host grants from a side-panel click.
- `extension_byok` without a Native Host. `extension_cli` shows 缺少 when no host answers.

It does not run models, act on page DOM, ship a Native Host, or publish a store listing. See [docs/architecture.md](docs/architecture.md).

## Identity

This repository was created from `FreeTWAI-AI/freedom-project-template` at `9bc7cee3f98d21da3156e5a67bfa63dc63a4615e`. It is not a fork. The initialization checklist is [docs/initialize-project.md](docs/initialize-project.md). `freedom.project.yaml` is this extension's manifest. Do not point issues or pull requests at the template repository.

## Developer Usage

The background service worker uses the `PairingClient`, `Router`, and `SessionStore` to manage pairing state and route messages between extension pages, content scripts, and the platform.

### SessionStore

The `SessionStore` saves pairing tokens in Chrome's session storage, ensuring they are cleared when the browser is closed. It refuses to write tokens to `local` or `sync` storage to maintain the trust boundary.

```typescript
import { createChromeSessionStore } from './session-store.ts';

const store = createChromeSessionStore(chrome.storage.session);
```

### PairingClient

The `PairingClient` implements the device authorization flow. It manages the `device_code` lifecycle, performs cryptographic DPoP signing via `DeviceKeyStore`, and handles token refresh.

```typescript
import { createPairingClient } from './pairing-client.ts';
import { createChromeSessionStore } from './session-store.ts';
import { createIndexedDbKeyStore } from './device-key.ts';
import { profiles } from './profile.ts';

// Obtain dependencies
const profile = profiles['staging'];
const store = createChromeSessionStore(chrome.storage.session);
const keys = createIndexedDbKeyStore();

// Initialize the client
const pairing = await createPairingClient({
  profile,
  fetchImpl: globalThis.fetch.bind(globalThis),
  clock: Date,
  keys,
  store
});

// Start a pairing session
const view = await pairing.begin();
console.log(view.userCode, view.verificationUri);
```

### Router

The `Router` validates incoming `chrome.runtime` messages, rejecting unrecognized commands and malformed JSON schemas.

```typescript
import { createRouter } from './messages.ts';

const router = createRouter({
  runtimeId: chrome.runtime.id,
  platformOrigin: 'https://staging.freetwai.com',
  pairingEpoch: () => pairing.view().epoch,
  snapshot: async () => buildSnapshot(),
  // ... implement required methods for other actions ...
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.handle(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});
```

## API Reference

### PairingClient

*   `begin()`: Starts device authorization and returns the user code and verification URI.
*   `poll()`: Polls the token endpoint while in the `waiting` phase.
*   `refresh()`: Rotates the access token using the refresh handle.
*   `readStatus()`: Validates the current connection and nonce against the platform.
*   `disconnect()`: Wipes local tokens and session state.
*   `view()`: Returns the synchronous `PublicView` of the pairing state.
*   `verificationUri()`: Returns the URI the user should visit, if waiting.

### SessionStore

*   `read()`: Reads the persisted pairing from storage. Returns `null` if empty.
*   `write(value)`: Writes a pairing record to storage. Throws if the underlying storage area is not session-bound and tokens are present.
*   `clear()`: Wipes the storage area.

### Router

*   `handle(message, sender)`: Validates the `message` structure and origin before dispatching to the configured `RouterDeps`. Returns a `RouteResult` with either success `snapshot` or `error` details.
