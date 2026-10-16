import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
let dir, module;
before(async()=>{
 dir=await mkdtemp(new URL('../node_modules/screen-errors-',import.meta.url));
 globalThis.__screenReports=[];
 await build({stdin:{contents:"export * from './src/lib/screenErrorReporting'; export * from './src/components/ErrorBoundary';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,platform:'node',packages:'external',format:'esm',jsx:'automatic',outfile:`${dir}/screen.mjs`,plugins:[{name:'business',setup(b){
  b.onResolve({filter:/\/(api|usageReporting)$/},args=>({path:args.path.split('/').at(-1),namespace:'screen'}));
  b.onLoad({filter:/.*/,namespace:'screen'},args=>({contents:args.path==='api'?"export const getEffectiveOwnerId=()=> 'anonymous-store-source';":"export const reportUsage=(...args)=>{ if(globalThis.__screenFail) throw new Error('network');globalThis.__screenReports.push(args);};"}));
 }}]});
 module=await import(pathToFileURL(`${dir}/screen.mjs`).href);
});
after(async()=>{await rm(dir,{recursive:true,force:true});delete globalThis.__screenReports;delete globalThis.__screenFail;});
const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
test('boundary and global handlers share deduplication; error reports do not contain exception or product text',async t=>{
 t.mock.method(console,'error',()=>{});
 const error=new Error('private product and customer data');
 const boundary=new module.ErrorBoundary({children:null});
 boundary.componentDidCatch(error,{componentStack:'private component'});
 module.reportScreenError(error);
 assert.equal(globalThis.__screenReports.length,0);
 await flush();
 assert.deepEqual(globalThis.__screenReports,[['erro_tela','anonymous-store-source']]);
 assert.ok(!JSON.stringify(globalThis.__screenReports).includes('private'));
 globalThis.__screenFail=true;
 assert.doesNotThrow(()=>module.reportScreenError(new Error('another failure')));
 await flush();delete globalThis.__screenFail;
});
test('recovery screen uses the exact reload instruction, including for network failures',()=>{
 const boundary=new module.ErrorBoundary({children:null});
 for(const message of ['network offline','removeChild failed']){
  boundary.state={hasError:true,error:new Error(message)};
  const html=renderToStaticMarkup(boundary.render());
  assert.ok(html.includes('Recarregue a página para continuar normalmente.'));
  assert.ok(!html.includes('salvos localmente'));assert.ok(!html.includes('seus dados estão seguros'));
 }
});
