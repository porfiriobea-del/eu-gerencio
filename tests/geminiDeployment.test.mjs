import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/gemini/recognize-product.ts';
import { recognizeProduct } from '../server/geminiRecognition.ts';

test('Vercel uses the shared Gemini handler and SPA routing excludes API paths', () => {
  assert.equal(handler, recognizeProduct);
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrite = new RegExp(`^${config.rewrites[0].source}$`);
  assert.equal(rewrite.test('/api/gemini/recognize-product'), false);
  assert.equal(rewrite.test('/estoque'), true);
});

test('serverless handler rejects unsupported methods with JSON', async () => {
  const result = {};
  const response = {
    setHeader(name, value) { result[name] = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; }
  };
  await handler({ method: 'GET' }, response);
  assert.equal(result.status, 405);
  assert.equal(result.Allow, 'POST');
  assert.match(result.body.error, /POST/);
});
