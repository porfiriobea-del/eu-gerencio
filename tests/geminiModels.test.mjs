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
async function invoke(name, override = {}) {
  const result = { status: 200 };
  const res = { setHeader() {}, status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } };
  await handlers[name]({ method: 'POST', body: { imageBase64: 'aW1hZ2U=', fileBase64: 'aW1hZ2U=', mimeType: 'image/jpeg', availableCategories: ['Bebidas'], ...override } }, res);
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
      const expected = scenario === 'quota' ? ['gemini-3.5-flash', 'gemini-3.1-flash-lite'] : scenario === 'custom-fallback' ? ['custom-model', 'gemini-3.1-flash-lite'] : scenario === 'both-unavailable' ? ['gemini-3.5-flash', 'gemini-3.1-flash-lite'] : scenario === 'fallback-is-primary' ? ['gemini-3.1-flash-lite'] : ['gemini-3.5-flash'];
      assert.deepEqual(calls.map(call => call.model), expected);
      if (calls.length === 2) {
        assert.deepEqual(calls[0].contents, calls[1].contents);
        assert.deepEqual(calls[0].config.responseJsonSchema, calls[1].config.responseJsonSchema);
        assert.equal(calls[0].config.responseMimeType, calls[1].config.responseMimeType);
      }
    });
  }
}


test('catalog failures log safe diagnostics and distinguish provider size errors from malformed output', async t => {
  const key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';
  t.after(()=>{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;delete globalThis.__generateModel;});
  const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args[1]));
  globalThis.__generateModel=async()=>{throw {status:413};};
  const size=await invoke('catalog');
  assert.equal(size.status,413);assert.equal(size.body.code,'FILE_TOO_LARGE');assert.match(size.body.error,/3 MB/);
  assert.equal(logs[0].providerStatus,413);assert.equal(logs[0].mimeType,'image/jpeg');assert.equal(logs[0].fileBytes,5);
  assert.ok(logs[0].requestId);assert.ok(!JSON.stringify(logs).includes('aW1hZ2U='));assert.ok(!JSON.stringify(logs).includes('mock-only'));
  globalThis.__generateModel=async()=>({text:'{invalid'});
  const invalid=await invoke('catalog');assert.equal(invalid.status,502);assert.equal(invalid.body.code,'INVALID_JSON_RESPONSE');
  assert.equal(logs.at(-1).stage,'response-parsing');
  globalThis.__generateModel=()=>assert.fail('Oversized files must not reach the provider');
  const oversized=await invoke('catalog',{fileBase64:'AAAA'.repeat(1024*1024+1)});
  assert.equal(oversized.status,413);assert.equal(oversized.body.maxFileBytes,3*1024*1024);
  assert.equal(logs.at(-1).stage,'file-validation');
});

test('catalog token truncation is actionable rather than an invalid JSON 502',async t=>{
  const key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';
  t.after(()=>{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;delete globalThis.__generateModel;});
  t.mock.method(console,'error',()=>{});
  globalThis.__generateModel=async args=>{assert.equal(args.config.maxOutputTokens,16384);return {text:'{"products":[',candidates:[{finishReason:'MAX_TOKENS'}]};};
  const result=await invoke('catalog');
  assert.equal(result.status,422);assert.equal(result.body.code,'INCOMPLETE_CATALOG');assert.match(result.body.error,/menos páginas/);
});

for (const scenario of ['schema-rejected','fallback-schema-rejected','always-rejected','invalid-json-after-retry']) {
 test(`catalog JSON mode recovery: ${scenario}`,async t=>{
  const key=process.env.GEMINI_API_KEY; const model=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY='mock-only';process.env.GEMINI_MODEL='gemini-3.5-flash';
  t.after(()=>{for(const [name,value] of [['GEMINI_API_KEY',key],['GEMINI_MODEL',model]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}delete globalThis.__generateModel;});
  const calls=[],logs=[];t.mock.method(console,'error',(_label,data)=>logs.push(data));
  globalThis.__generateModel=async args=>{
   calls.push(args);
   if (args.config.responseJsonSchema) assert.equal(args.config.responseMimeType,'application/json');
   if(scenario==='fallback-schema-rejected'&&calls.length===1)throw {status:404};
   if(args.config.responseJsonSchema||scenario==='always-rejected')throw {status:400};
   return {text:scenario==='invalid-json-after-retry'?'{bad':JSON.stringify(catalog)};
  };
  const result=await invoke('catalog');
  assert.equal(result.status,scenario==='always-rejected'?503:scenario==='invalid-json-after-retry'?502:200);
  assert.equal(calls.length,scenario==='always-rejected'?4:scenario==='fallback-schema-rejected'?3:2);
  assert.ok(!calls.at(-1).config.responseJsonSchema);
  assert.deepEqual(calls[0].contents,calls.at(-1).contents);
  assert.equal(logs.filter(log=>log.code==='JSON_MODE_RETRY').length,1);
  if(scenario==='always-rejected')assert.equal(result.body.code,'REQUEST_REJECTED');
  if(scenario==='invalid-json-after-retry')assert.equal(result.body.code,'INVALID_JSON_RESPONSE');
  if(scenario==='fallback-schema-rejected')assert.equal(calls.at(-1).model,'gemini-3.1-flash-lite');
 });
}

for (const name of ['product','catalog']) {
 for (const scenario of ['overload-fallback','all-overloaded','quota-fallback']) {
  test(`${name}: ${scenario} automatically recovers or returns a temporary service status`,async t=>{
   const saved={key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL};
   process.env.GEMINI_API_KEY='mock-only';process.env.GEMINI_MODEL='gemini-3.5-flash';
   t.after(()=>{for(const [key,value] of [['GEMINI_API_KEY',saved.key],['GEMINI_MODEL',saved.model]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}delete globalThis.__generateModel;});
   const calls=[];t.mock.method(console,'error',()=>{});t.mock.method(console,'warn',()=>{});
   globalThis.__generateModel=async args=>{
    calls.push(args);
    if(scenario==='all-overloaded'||args.model==='gemini-3.5-flash')throw {status:scenario==='quota-fallback'?429:503};
    return {text:JSON.stringify(name==='product'?product:catalog)};
   };
   const result=await invoke(name);
   assert.equal(result.status,scenario==='all-overloaded'?503:200);
   assert.deepEqual(calls.map(call=>call.model),name==='catalog'&&scenario!=='quota-fallback'?['gemini-3.5-flash','gemini-3.5-flash','gemini-3.1-flash-lite']:['gemini-3.5-flash','gemini-3.1-flash-lite']);
   if(scenario==='all-overloaded')assert.equal(result.body.code,'PROVIDER_UNAVAILABLE');
   for(const call of calls)assert.ok(call.config.httpOptions.timeout <= (call.model === 'gemini-3.1-flash-lite' ? 30000 : 20000));
  });
 }
}


for (const scenario of ['json-mode-rejected', 'token-limit-rejected', 'primary-model-rejected', 'all-configurations-rejected']) {
 test(`catalogue recovers from incompatible provider options: ${scenario}`, async t => {
  const key=process.env.GEMINI_API_KEY, model=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY='mock-only';process.env.GEMINI_MODEL='gemini-3.5-flash';
  t.after(()=>{for(const [name,value] of [['GEMINI_API_KEY',key],['GEMINI_MODEL',model]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}delete globalThis.__generateModel;});
  const calls=[], logs=[];
  t.mock.method(console,'error',(_label,details)=>logs.push(details));
  globalThis.__generateModel=async args=>{
   calls.push(args);
   assert.equal(args.contents[0].parts[1].inlineData.data,'aW1hZ2U=');
   const rejected=scenario==='all-configurations-rejected'||scenario==='primary-model-rejected'&&args.model==='gemini-3.5-flash'||scenario==='json-mode-rejected'&&args.config.responseMimeType||scenario==='token-limit-rejected'&&args.config.maxOutputTokens;
   if(rejected)throw Object.assign(new Error('responseMimeType unsupported; private-document-text; secret-key-value'),{status:400});
   return {text:JSON.stringify(catalog)};
  };
  const result=await invoke('catalog');
  assert.equal(result.status,scenario==='all-configurations-rejected'?503:200);
  assert.equal(calls.length,['primary-model-rejected','all-configurations-rejected'].includes(scenario)?4:3);
  assert.equal(calls.at(-1).config.responseMimeType,undefined);
  assert.equal(calls.at(-1).config.responseJsonSchema,undefined);
  assert.equal(calls.at(-1).config.maxOutputTokens,undefined);
  assert.ok(calls.every(call=>call.config.httpOptions.timeout <= (call.model === 'gemini-3.1-flash-lite' ? 30000 : 20000)));
  assert.ok(!JSON.stringify(logs).includes('private-document-text'));
  assert.ok(!JSON.stringify(logs).includes('secret-key-value'));
  if(scenario==='all-configurations-rejected'){
   assert.equal(result.body.code,'REQUEST_REJECTED');
   assert.equal(result.body.providerReason,'CONFIGURATION_REJECTED');
   assert.match(result.body.error,/tentativas automáticas/);
  }
  if(scenario==='primary-model-rejected')assert.equal(calls.at(-1).model,'gemini-3.1-flash-lite');
 });
}


for (const failure of [Object.assign(new Error('request cancelled'), {status:499}), Object.assign(new Error('deadline exceeded'),{status:504}), Object.assign(new Error('request aborted'),{name:'AbortError'}), new Error('request timed out')]) {
 test(`catalogue switches model on timeout or cancellation: ${failure.status || failure.name}`,async t=>{
  const key=process.env.GEMINI_API_KEY, model=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY='mock-only';process.env.GEMINI_MODEL='gemini-3.5-flash';
  t.after(()=>{for(const [name,value] of [['GEMINI_API_KEY',key],['GEMINI_MODEL',model]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}delete globalThis.__generateModel;});
  const calls=[];t.mock.method(console,'error',()=>{});
  globalThis.__generateModel=async args=>{calls.push(args);if(calls.length===1)throw failure;return {text:JSON.stringify(catalog)};};
  const result=await invoke('catalog');
  assert.equal(result.status,200);assert.equal(result.body.products[0].name,'Suco');
  assert.deepEqual(calls.map(call=>call.model),['gemini-3.5-flash','gemini-3.1-flash-lite']);
  assert.equal(calls[0].config.httpOptions.timeout,20000);
  assert.ok(calls[1].config.httpOptions.timeout>20000&&calls[1].config.httpOptions.timeout<=30000);
  calls.length=0;
  globalThis.__generateModel=async args=>{calls.push(args);throw failure;};
  const unavailable=await invoke('catalog');
  assert.equal(unavailable.status,504);assert.equal(unavailable.body.code,'TIMEOUT');assert.equal(calls.length,2);
 });
}
