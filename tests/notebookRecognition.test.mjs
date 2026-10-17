import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
const folder=await mkdtemp(new URL('../.notebook-api-',import.meta.url).pathname);
await build({entryPoints:[new URL('../api/gemini/recognize-notebook.ts',import.meta.url).pathname],bundle:true,packages:'external',platform:'node',format:'esm',outfile:folder+'/route.mjs',plugins:[{name:'sdk',setup(b){b.onResolve({filter:/^@google\/genai$/},()=>({path:'sdk',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export class GoogleGenAI {models={generateContent:args=>globalThis.__notebookGemini(args)}}'}));}}]});
const {default:handler}=await import(folder+'/route.mjs');
after(async()=>{await rm(folder,{recursive:true,force:true});});
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},end(){return this;}};}
test('notebook route validates image, falls back on quota and returns written total separately',async()=>{
 const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL,fallback=process.env.GEMINI_FALLBACK_MODEL;
 process.env.GEMINI_API_KEY='test';process.env.GEMINI_MODEL='test-primary';process.env.GEMINI_FALLBACK_MODEL='test-fallback';
 const calls=[];globalThis.__notebookGemini=async args=>{calls.push(args);if(calls.length===1)throw {status:429};return {text:JSON.stringify({clients:[{name:'José',lines:[{description:'Leite',amount:5}],readTotal:7}]})};};
 try{
  const bad=response();await handler({method:'POST',body:{mimeType:'image/jpeg',fileBase64:'data:image/jpeg;base64,YWJjZA=='}},bad);assert.equal(bad.statusCode,400);assert.equal(calls.length,0);
  const res=response();await handler({method:'POST',body:{mimeType:'image/jpeg',fileBase64:'YWJjZA=='}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(calls.map(c=>c.model),['test-primary','test-fallback']);assert.equal(res.body.clients[0].readTotal,7);assert.equal(res.body.clients[0].lines[0].amount,5);assert.equal(res.headers['Cache-Control'],'no-store');
 }finally{for(const [k,v]of Object.entries({GEMINI_API_KEY:key,GEMINI_MODEL:model,GEMINI_FALLBACK_MODEL:fallback})){if(v===undefined)delete process.env[k];else process.env[k]=v;}delete globalThis.__notebookGemini;}
});
