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


test('catalogue API reads PDF and image lists, keeps unknown prices null and handles quota/invalid output', async t => {
  const stop = await startServer(true);
  t.after(stop);
  const postCatalog = async body => {
    const response = await fetch('http://127.0.0.1:3000/api/gemini/recognize-catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  for (const mimeType of ['image/jpeg', 'application/pdf']) {
    const result = await postCatalog({ fileBase64: encode(mimeType === 'application/pdf' ? '%PDF-catalog' : 'catalog'), mimeType, availableCategories: ['Bebidas'] });
    assert.equal(result.status, 200);
    assert.equal(result.body.products.length, 2);
    assert.equal(result.body.products[0].purchaseCost, 60);
    assert.equal(result.body.products[0].category, 'Bebidas');
    assert.equal(result.body.products[0].basePrice, null);
  }
  const half = await postCatalog({fileBase64:encode('catalog-half-cigarette'),mimeType:'image/jpeg',availableCategories:['Cigarros']});
  assert.equal(half.status,200);assert.equal(half.body.products[0].costBasis,'meio_maco');assert.equal(half.body.products[0].purchaseCost,40);
  assert.equal((await postCatalog({ fileBase64: encode('fake-pdf'), mimeType: 'application/pdf' })).status, 400);
  assert.equal((await postCatalog({ fileBase64: 'data:image/jpeg;base64,aW1hZ2U=', mimeType: 'image/jpeg' })).status, 400);
  for (const [marker, expected] of [['catalog-empty', 422], ['catalog-invalid-json', 502], ['catalog-negative', 502], ['catalog-quota', 429]]) {
    const result = await postCatalog({ fileBase64: encode(marker), mimeType: 'image/jpeg' });
    assert.equal(result.status, expected);
    assert.equal(result.body.success, undefined);
  }
});
