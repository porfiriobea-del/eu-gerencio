import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function startServer(withKey) {
  const child = spawn(process.execPath, [
    '--import', 'tsx', '--import', './tests/fixtures/mock-gemini.mjs', 'server.ts'
  ], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'production', GEMINI_API_KEY: withKey ? 'test-only-not-a-credential' : '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 10000);
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('Server listening')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
  });
  return async () => { child.kill(); await once(child, 'exit'); };
}

async function post(body) {
  const response = await fetch('http://127.0.0.1:3000/api/gemini/recognize-product', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const encode = value => Buffer.from(value).toString('base64');

test('API validates image input, forwards Base64 and handles Gemini responses', async t => {
  const stop = await startServer(true);
  t.after(stop);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ imageBase64: 'invalid!' })).status, 400);
  assert.equal((await post({ imageBase64: encode('image'), mimeType: 'image/svg+xml' })).status, 400);
  assert.equal((await post({ imageBase64: encode('image'), availableCategories: [123] })).status, 400);
  for (const imageBase64 of [encode('image'), `data:image/jpeg;base64,${encode('image')}`]) {
    assert.deepEqual(await post({ imageBase64, availableCategories: ['Mercearia'] }), {
      status: 200, body: { success: true, product: { name: 'Café 500g', category: 'Mercearia' } }
    });
  }
  assert.equal((await post({ imageBase64: encode('invalid-json') })).status, 502);
  assert.equal((await post({ imageBase64: encode('unreadable') })).status, 422);
  const failure = await post({ imageBase64: encode('failure') });
  assert.equal(failure.status, 502);
  assert.equal(failure.body.success, undefined);
  const quota = await post({ imageBase64: encode('quota') });
  assert.equal(quota.status, 429);
  assert.equal(quota.body.code, 'QUOTA_EXCEEDED');
  const denied = await post({ imageBase64: encode('denied') });
  assert.equal(denied.status, 503);
  assert.match(denied.body.error, /manualmente/);
});

test('missing Gemini key permits startup but returns an explicit service error', async t => {
  const stop = await startServer(false);
  t.after(stop);
  assert.equal((await post({ imageBase64: encode('image') })).status, 503);
});
