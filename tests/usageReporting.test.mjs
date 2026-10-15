import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
let dir, reporting;
const auth = { currentUser: { uid: 'user-id', getIdToken: async () => 'test-token' } };
const waitFor = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('Background report did not settle'); };
before(async () => {
 globalThis.__usageAuth = auth;
 dir = await mkdtemp(new URL('../node_modules/usage-test-', import.meta.url));
 await build({ entryPoints: [new URL('../src/lib/usageReporting.ts', import.meta.url).pathname], bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: `${dir}/usage.mjs`, plugins: [{ name: 'auth', setup(builder) {
  builder.onResolve({ filter: /\/firebase$/ }, () => ({ path: 'auth', namespace: 'test-auth' }));
  builder.onLoad({ filter: /.*/, namespace: 'test-auth' }, () => ({ contents: 'export const auth=globalThis.__usageAuth;', loader: 'js' }));
 } }] });
 reporting = await import(pathToFileURL(`${dir}/usage.mjs`));
});
afterEach(() => { auth.currentUser = { uid: 'user-id', getIdToken: async () => 'test-token' }; });
after(async () => { await rm(dir, { recursive: true, force: true }); delete globalThis.__usageAuth; });

test('all five usage events use relatorio with anonymous identities and never block the caller', async t => {
 const requests = [], releases = [];
 t.mock.method(globalThis, 'fetch', async (url, options) => {
  requests.push({ url, options, body: JSON.parse(options.body) });
  await new Promise(resolve => releases.push(resolve));
  return Response.json({ success: true });
 });
 const events = ['venda', 'produto_cadastrado', 'foto_ia', 'fiado_lancado', 'compra_registrada'];
 for (const event of events) assert.equal(reporting.reportUsage(event, 'store-id', event === 'venda' || event === 'compra_registrada' ? 42.5 : 0), undefined);
 assert.equal(requests.length, 0);
 await waitFor(() => requests.length === 2);
 // Only two requests can be outstanding; the other three remain queued.
 await new Promise(resolve => setTimeout(resolve, 10));
 assert.equal(requests.length, 2);
 let completed = 0;
 while (completed < events.length) {
  await waitFor(() => releases.length > 0);
  releases.shift()(); completed++;
 }
 await waitFor(() => requests.length === 5);
 for (let index = 0; index < events.length; index++) {
  const { url, options, body } = requests.find(request => request.body.evento === events[index]);
  assert.equal(url, '/api/relatorio'); assert.equal(options.method, 'POST');
  assert.equal(body.categoria, 'uso'); assert.equal(body.evento, events[index]);
  assert.equal(body.loja, `loja_${createHash('sha256').update('loja:store-id').digest('hex')}`);
  assert.equal(body.usuario, `usuario_${createHash('sha256').update('usuario:user-id').digest('hex')}`);
  assert.equal(body.valor, events[index] === 'venda' || events[index] === 'compra_registrada' ? 42.5 : 0);
  assert.equal(body.secret, undefined);
 }
 await new Promise(resolve => setTimeout(resolve, 10));
});

test('network failure is swallowed and does not prevent subsequent usage sends', async t => {
 let calls = 0;
 t.mock.method(globalThis, 'fetch', async () => { calls++; if (calls === 1) throw new Error('Offline'); return Response.json({ success: true }); });
 assert.doesNotThrow(() => reporting.reportUsage('venda', 'store-id', 10));
 reporting.reportUsage('compra_registrada', 'store-id', 20);
 await waitFor(() => calls === 2);
 await new Promise(resolve => setTimeout(resolve, 10));
});

test('pending events are discarded after account switch and unauthenticated events are ignored', async t => {
 let calls = 0;
 t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ success: true }); });
 reporting.reportUsage('foto_ia', 'store-id');
 auth.currentUser = { uid: 'other-user', getIdToken: async () => 'other-token' };
 await new Promise(resolve => setTimeout(resolve, 10));
 assert.equal(calls, 0);
 auth.currentUser = null;
 reporting.reportUsage('venda', 'store-id', 1);
 await new Promise(resolve => setTimeout(resolve, 10));
 assert.equal(calls, 0);
});
