import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCloud } from '../src/lib/cloudTransport.ts';

test('cloud transport bounds a stalled request and preserves authentication headers',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(globalThis,'fetch',(_input,init)=>{
    assert.equal(init.headers.Authorization,'Bearer test-only-token');
    return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  });
  const pending=fetchCloud('https://cloud.test.invalid',{headers:{Authorization:'Bearer test-only-token'}});
  const rejected=assert.rejects(pending,/Aborted/);t.mock.timers.tick(20000);await rejected;
});
test('external cancellation also terminates the cloud request',async t=>{
  t.mock.method(globalThis,'fetch',(_input,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})));
  const controller=new AbortController();const pending=fetchCloud('https://cloud.test.invalid',{signal:controller.signal});
  controller.abort();await assert.rejects(pending,/Aborted/);
});
