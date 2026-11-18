import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, isNewerVersion, parseUpdateManifest, checkForUpdates,
  UPDATE_PRODUCT, UPDATE_FEED_URL, OFFICIAL_DOWNLOAD_URL } from '../src/lib/updateFeed.ts';

test('accepts numeric versions and compares all components, not strings', () => {
  assert.deepEqual(parseVersion('2.10.0'), [2, 10, 0]);
  assert.equal(parseVersion('2.1.0-beta'), null);
  assert.equal(parseVersion('02.1.0'), null);
  assert.equal(parseVersion('9999999.1.0'), null);
  assert.equal(isNewerVersion('0.2.20', '0.2.19'), true);
  assert.equal(isNewerVersion('0.2.9', '0.2.19'), false);
  assert.equal(isNewerVersion('0.2.19', '0.2.19'), false);
  assert.equal(isNewerVersion('1.0.0', '0.99.99'), true);
});

test('accepts only Tauri-Windows edition and official download host', () => {
  const valid = { product: UPDATE_PRODUCT, version: '0.2.20', download_url: OFFICIAL_DOWNLOAD_URL,
    notes: 'Bug fixes' };
  assert.deepEqual(parseUpdateManifest(valid, '0.2.19'), {version:'0.2.20', notes:'Bug fixes'});
  assert.equal(parseUpdateManifest(valid, '0.2.21'), null);
  assert.throws(() => parseUpdateManifest({...valid, product:'snapvere-winui-windows'}, '0.2.19'));
  assert.throws(() => parseUpdateManifest({...valid, download_url:'https://github.com/example'}, '0.2.19'));
  assert.throws(() => parseUpdateManifest({...valid, notes:'x'.repeat(900)}, '0.2.19'));
  assert.throws(() => parseUpdateManifest([], '0.2.19'));
});

test('checks only update.snapvere.com without credentials or redirects', async () => {
  const prior = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, UPDATE_FEED_URL);
      assert.equal(options.method, 'GET');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      assert.equal(options.referrerPolicy, 'no-referrer');
      return new Response(JSON.stringify({product:UPDATE_PRODUCT, version:'0.2.20'}), {
        status: 200, headers:{'content-type':'application/json'}
      });
    };
    assert.deepEqual(await checkForUpdates('0.2.19'), {version:'0.2.20', notes:''});
  } finally {
    globalThis.fetch = prior;
  }
});

test('rejects HTML, failures and oversized response without changing product state', async () => {
  const prior = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html>fake</html>', {
      status:200, headers:{'content-type':'text/html'}
    });
    await assert.rejects(checkForUpdates('0.2.19'), /Unexpected update response/);
    globalThis.fetch = async () => new Response('{}', {
      status:200, headers:{'content-type':'application/json', 'content-length':'20000'}
    });
    await assert.rejects(checkForUpdates('0.2.19'), /too large/);
  } finally {
    globalThis.fetch = prior;
  }
});
