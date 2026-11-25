// Snapvere by Brendigo
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, isNewerVersion, parseUpdateManifest, checkForUpdates,
  UPDATE_PRODUCT, UPDATE_FEED_URL, OFFICIAL_DOWNLOAD_URL, canCheckWindowsUpdates } from '../src/lib/updateFeed.ts';

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
  assert.equal(OFFICIAL_DOWNLOAD_URL, 'https://snapvere.com/download/tauri/');
  const valid = { product: UPDATE_PRODUCT, version: '0.2.20', download_url: OFFICIAL_DOWNLOAD_URL,
    notes: 'Bug fixes' };
  assert.deepEqual(parseUpdateManifest(valid, '0.2.19'), {version:'0.2.20', notes:'Bug fixes'});
  assert.equal(parseUpdateManifest(valid, '0.2.21'), null);
  assert.throws(() => parseUpdateManifest({...valid, product:'snapvere-winui-windows'}, '0.2.19'));
  assert.throws(() => parseUpdateManifest({...valid, download_url:'https://github.com/example'}, '0.2.19'));
  assert.throws(() => parseUpdateManifest({...valid, download_url:'https://snapvere.com/download/'}, '0.2.19'));
  assert.throws(() => parseUpdateManifest({...valid, download_url:'https://snapvere.com/files/Snapvere-Setup.exe'}, '0.2.19'));
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
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(12_000));
        controller.close();
      },
    }), {status: 200, headers:{'content-type':'application/json'}});
    await assert.rejects(checkForUpdates('0.2.19'), /too large/);
  } finally {
    globalThis.fetch = prior;
  }
});

test('dismissed update banner stays closed for the same version and returns on a new release', async () => {
  const { shouldShowReleaseNotice } = await import('../src/lib/updateFeed.ts');
  assert.equal(shouldShowReleaseNotice(null, null), false);
  assert.equal(shouldShowReleaseNotice({version:'0.2.25', notes:''}, null), true);
  assert.equal(shouldShowReleaseNotice({version:'0.2.25', notes:''}, '0.2.25'), false);
  assert.equal(shouldShowReleaseNotice({version:'0.2.26', notes:''}, '0.2.25'), true);
});

test("update feed is offline until the user explicitly opts in", async () => {
  const { autoUpdateChecksEnabled } = await import('../src/lib/updateFeed.ts');
  assert.equal(autoUpdateChecksEnabled(null), false);
  assert.equal(autoUpdateChecksEnabled('true'), true);
  assert.equal(autoUpdateChecksEnabled('false'), false);
  assert.equal(autoUpdateChecksEnabled('old-preference'), false);
  assert.equal(autoUpdateChecksEnabled('TRUE'), false);
  assert.equal(autoUpdateChecksEnabled(''), false);
});

test('native update channel rejects Linux and unknown OS before any Windows feed request', () => {
  assert.equal(canCheckWindowsUpdates('windows'), true);
  for (const platform of ['linux', 'macos', '', null]) {
    assert.equal(canCheckWindowsUpdates(platform), false, String(platform));
  }
});

test('rejects misleading media types and malformed content lengths', async () => {
  const prior = globalThis.fetch;
  try {
    const body = JSON.stringify({product:UPDATE_PRODUCT, version:'0.2.35'});
    for (const type of ['application/json-patch+json', 'application/json+xml', 'application/json, text/html']) {
      globalThis.fetch = async () => new Response(body, {headers:{'content-type':type}});
      await assert.rejects(checkForUpdates('0.2.34'), /Unexpected update response/);
    }
    for (const length of ['-1', '1e2', '0x20', '1.5', '']) {
      globalThis.fetch = async () => new Response(body, {
        headers:{'content-type':'application/json', 'content-length':length}
      });
      await assert.rejects(checkForUpdates('0.2.34'), /Invalid update content length/);
    }
    globalThis.fetch = async () => new Response(body, {
      headers:{'content-type':'Application/JSON; charset=utf-8'}
    });
    assert.deepEqual(await checkForUpdates('0.2.34'), {version:'0.2.35', notes:''});
  } finally {
    globalThis.fetch = prior;
  }
});

test('accepts bounded fragmented JSON at the byte limit and rejects overflow', async () => {
  const prior = globalThis.fetch;
  try {
    const json = JSON.stringify({product:UPDATE_PRODUCT, version:'0.2.35'});
    const payload = new TextEncoder().encode(json.padEnd(8192, ' '));
    for (const overflow of [false, true]) {
      globalThis.fetch = async () => new Response(new ReadableStream({
        start(controller) {
          for (let offset = 0; offset < payload.length; offset += 17) {
            controller.enqueue(new Uint8Array(0));
            controller.enqueue(payload.subarray(offset, offset + 17));
          }
          if (overflow) controller.enqueue(new Uint8Array([32]));
          controller.close();
        },
      }), {headers:{'content-type':'application/json'}});
      if (overflow) await assert.rejects(checkForUpdates('0.2.34'), /too large/);
      else assert.deepEqual(await checkForUpdates('0.2.34'), {version:'0.2.35', notes:''});
    }
  } finally {
    globalThis.fetch = prior;
  }
});

test('version validation rejects extra characters and bounds the input', () => {
  for (const value of ['1.2.3\n', '1.2.3\r', '1.2.3 ', '1.'.repeat(1000)]) {
    assert.equal(parseVersion(value), null);
  }
  assert.deepEqual(parseVersion('999999.999999.999999'), [999999, 999999, 999999]);
});
