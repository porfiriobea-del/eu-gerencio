import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
let dir;
const handlers = {};
before(async () => {
  const cache = new URL('../node_modules/.cache/', import.meta.url);
  await mkdir(cache, { recursive: true });
  dir = await mkdtemp(new URL('gemini-models-', cache));
  for (const name of ['product', 'catalog']) {
    const outfile = `${dir}/${name}.mjs`;
    await build({ entryPoints: [new URL(`../api/gemini/recognize-${name}.ts`, import.meta.url).pathname], outfile, bundle: true, platform: 'node', format: 'esm', plugins: [{ name: 'mock-provider', setup(b) {
      b.onResolve({ filter: /^@google\/genai$/ }, () => ({ path: 'mock', namespace: 'provider' }));
      b.onLoad({ filter: /.*/, namespace: 'provider' }, () => ({ contents: 'export class GoogleGenAI { models = {generateContent: args => globalThis.__generateModel(args)}; }' }));
    } }] });
    handlers[name] = (await import(pathToFileURL(outfile).href)).default;
  }
});
after(async () => { await rm(dir, { recursive: true, force: true }); });
const product = { name: 'Suco', category: 'Bebidas' };
const catalog = { products: [{ ...product, type: 'comum' }], truncated: false };
async function invoke(name) {
  const result = { status: 200 };
  const res = { setHeader() {}, status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } };
  await handlers[name]({ method: 'POST', body: { imageBase64: 'aW1hZ2U=', fileBase64: 'aW1hZ2U=', mimeType: 'image/jpeg', availableCategories: ['Bebidas'] } }, res);
  return result;
}
for (const name of ['product', 'catalog']) {
  for (const scenario of ['default', 'custom-fallback', 'both-unavailable', 'quota', 'fallback-is-primary']) {
    test(`${name}: model selection ${scenario}`, async t => {
      const saved = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL };
      t.after(() => {
        for (const [key, value] of [['GEMINI_API_KEY', saved.key], ['GEMINI_MODEL', saved.model]]) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        delete globalThis.__generateModel;
      });
      process.env.GEMINI_API_KEY = 'mock-only';
      process.env.GEMINI_MODEL = scenario === 'custom-fallback' ? ' custom-model ' : scenario === 'fallback-is-primary' ? 'gemini-3.1-flash-lite' : ' ';
      const calls = [];
      t.mock.method(console, 'warn', () => {});
      t.mock.method(console, 'error', () => {});
      globalThis.__generateModel = async args => {
        calls.push(args);
        if (scenario === 'quota') throw { status: 429 };
        if (scenario === 'both-unavailable' || scenario === 'fallback-is-primary' || scenario === 'custom-fallback' && calls.length === 1) throw { status: 404 };
        return { text: JSON.stringify(name === 'product' ? product : catalog) };
      };
      const result = await invoke(name);
      assert.equal(result.status, scenario === 'quota' ? 429 : ['both-unavailable', 'fallback-is-primary'].includes(scenario) ? 502 : 200);
      const expected = scenario === 'custom-fallback' ? ['custom-model', 'gemini-3.1-flash-lite'] : scenario === 'both-unavailable' ? ['gemini-3.5-flash', 'gemini-3.1-flash-lite'] : scenario === 'fallback-is-primary' ? ['gemini-3.1-flash-lite'] : ['gemini-3.5-flash'];
      assert.deepEqual(calls.map(call => call.model), expected);
      if (calls.length === 2) {
        assert.deepEqual(calls[0].contents, calls[1].contents);
        assert.deepEqual(calls[0].config, calls[1].config);
      }
    });
  }
}
