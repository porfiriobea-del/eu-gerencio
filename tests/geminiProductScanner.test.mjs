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
  await assert.rejects(recognizeProductFromImage(image), /IA indisponível/);
  globalThis.fetch = async () => Response.json({ success: true, product: { name: '', category: 'Bebidas' } });
  await assert.rejects(recognizeProductFromImage(image), /dados incompletos/);
  globalThis.fetch = async () => new Response('<html>proxy error</html>', { status: 502 });
  await assert.rejects(recognizeProductFromImage(image), /status 502/);
});
