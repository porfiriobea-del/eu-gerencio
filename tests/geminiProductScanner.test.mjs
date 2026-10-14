import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizeProductFromImage } from '../src/lib/geminiProductScanner.ts';

const image = 'data:image/jpeg;base64,aW1hZ2U=';

test('sends raw Base64 with its MIME type and returns only name/category', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/gemini/recognize-product');
    assert.deepEqual(JSON.parse(options.body), {
      imageBase64: 'aW1hZ2U=', mimeType: 'image/jpeg', availableCategories: ['Bebidas']
    });
    return Response.json({ success: true, product: {
      name: ' Coca-Cola 2L ', category: 'bebidas', stock: 10, suggestedSalePrice: 99
    } });
  });
  assert.deepEqual(await recognizeProductFromImage(image, ['Bebidas']), {
    name: 'Coca-Cola 2L', category: 'Bebidas'
  });
});

test('rejects malformed image data before making a request', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected request'));
  for (const value of ['not-an-image', 'data:image/svg+xml;base64,aW1hZ2U=', 'data:image/jpeg;base64,a']) {
    await assert.rejects(recognizeProductFromImage(value), /imagem.*válida/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('surfaces server failures and rejects incomplete or non-JSON responses', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'IA indisponível' }, { status: 503 }));
  await assert.rejects(recognizeProductFromImage(image), /manualmente/);
  globalThis.fetch = async () => Response.json({ success: true, product: { name: '', category: 'Bebidas' } });
  await assert.rejects(recognizeProductFromImage(image), /dados incompletos/);
  globalThis.fetch = async () => new Response('<html>proxy error</html>', { status: 502 });
  await assert.rejects(recognizeProductFromImage(image), /manualmente/);
});


test('network errors and static deployment HTML produce friendly errors', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(recognizeProductFromImage(image), /Verifique sua conexão/);
  globalThis.fetch = async () => new Response('<html>SPA</html>', { status: 200 });
  await assert.rejects(recognizeProductFromImage(image), /serviço.*não está disponível/);
});


test('quota and HTML platform 500 failures offer manual entry without technical status text', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>FUNCTION_INVOCATION_FAILED</html>', { status: 500 }));
  await assert.rejects(recognizeProductFromImage(image), error => {
    assert.match(error.message, /manualmente/);
    assert.ok(!error.message.includes('500'));
    return true;
  });
  globalThis.fetch = async () => Response.json({ error: 'Quota limit' }, { status: 429 });
  await assert.rejects(recognizeProductFromImage(image), /limite.*manualmente/);
});

test('manual continuation can abort a pending analysis', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const pending = recognizeProductFromImage(image, [], controller.signal);
  controller.abort();
  await assert.rejects(pending, /interrompida.*manualmente/);
});

test('diagnostics correlate HTTP failures without exposing photos, response bodies or credentials', async t => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'MISSING_API_KEY', error: 'provider-secret-must-not-be-logged' }, {
    status: 503, headers: { 'x-request-id': 'request-test-123' }
  }));
  await assert.rejects(recognizeProductFromImage(image), /manualmente/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1].status, 503);
  assert.equal(logs[0][1].requestId, 'request-test-123');
  assert.equal(logs[0][1].code, 'HTTP_ERROR');
  assert.equal(logs[0][1].serverCode, 'MISSING_API_KEY');
  assert.equal(logs[0][1].mimeType, 'image/jpeg');
  assert.ok(!JSON.stringify(logs).includes('provider-secret'));
  assert.ok(!JSON.stringify(logs).includes('aW1hZ2U='));
});

test('manual cancellation is not logged as a Gemini failure', async t => {
  const log = t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const pending = recognizeProductFromImage(image, [], controller.signal);
  controller.abort();
  await assert.rejects(pending, /interrompida/);
  assert.equal(log.mock.callCount(), 0);
});
