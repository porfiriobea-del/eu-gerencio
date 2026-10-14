import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';

test('native compiled ESM serves feedback export and confirms secret/plain-text/ok without a TS loader',async t=>{
  const cwd=new URL('..',import.meta.url);
  const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.server.json'],{cwd,encoding:'utf8'});
  assert.equal(build.status,0,build.stdout+build.stderr);
  const entry=readFileSync(new URL('../build/server/api/feedback/export.js',import.meta.url),'utf8');
  assert.match(entry,/\.\.\/\.\.\/server\/relatorio\.js/);assert.ok(!entry.includes('relatorio.ts'));
  const child=spawn(process.execPath,['--import','./tests/fixtures/mock-reporting.mjs','build/server/server.js'],{
    cwd,env:{...process.env,NODE_ENV:'production',NODE_OPTIONS:'',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',APPS_SCRIPT_SECRET:'mock-only-secret'},stdio:['ignore','pipe','pipe']
  });
  let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server startup timed out')),10000);
    child.stdout.on('data',chunk=>{if(String(chunk).includes('Server listening')){clearTimeout(timer);resolve();}});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}: ${stderr}`));});
  });
  for(const path of ['/api/feedback/export','/api/relatorio']) {
    const response=await fetch(`http://127.0.0.1:3000${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer mock-token'},body:JSON.stringify({categoria:'feedback',feedbackId:'fb_test'})});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{success:true});
  }
  const page=await fetch('http://127.0.0.1:3000/');assert.equal(page.status,200);assert.match(await page.text(),/Eu Gerencio/);
});
