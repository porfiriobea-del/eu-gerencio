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

// Match Vercel's ESM runtime without tsx's helpful extension resolution.
test('compiled API entry loads in native Node without a TypeScript loader', async () => {
  const { transform } = await import('esbuild');
  const { mkdtemp, writeFile, rm, mkdir } = await import('node:fs/promises');
  const { spawnSync } = await import('node:child_process');
  const cache = new URL('../node_modules/.cache/', import.meta.url);
  await mkdir(cache, { recursive: true });
  const dir = await mkdtemp(new URL('gemini-runtime-', cache));
  try {
    const source = readFileSync(new URL('../api/gemini/recognize-product.ts', import.meta.url), 'utf8');
    const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'node24' });
    const entry = `${dir}/entry.mjs`;
    await writeFile(entry, compiled.code);
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `const module = await import(${JSON.stringify(entry)}); if (typeof module.default !== 'function') process.exit(2);`], {
      env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
