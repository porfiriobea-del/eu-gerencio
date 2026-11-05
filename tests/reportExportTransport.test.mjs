import test from 'node:test';
import assert from 'node:assert/strict';
import {googleReportRequest,ReportExportError,exportErrorText,logExportError} from '../src/lib/reportExportFeedback.ts';
for(const [status,code] of [[401,'GOOGLE_AUTH'],[403,'GOOGLE_AUTH'],[429,'GOOGLE_QUOTA'],[500,'GOOGLE_FAILURE']])test(`Google HTTP ${status} has a distinct actionable export error`,async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('private provider response',{status}));
 await assert.rejects(()=>googleReportRequest('https://example.invalid',{},'write','https://docs.google.com/spreadsheets/d/partial/edit'),e=>e.code===code&&e.status===status&&e.stage==='write'&&e.partialUrl.includes('partial'));
});
test('request deadline aborts the real transport instead of allowing it to continue in the background',async t=>{
 let signal;t.mock.method(globalThis,'fetch',(_url,init)=>new Promise((resolve,reject)=>{signal=init.signal;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));}));
 await assert.rejects(()=>googleReportRequest('https://example.invalid',{},'charts',undefined,5),e=>e.code==='EXPORT_TIMEOUT'&&e.stage==='charts');assert.equal(signal.aborted,true);
});
test('network failure is reported without leaking the request or provider details',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('private token');});
 let error;try{await googleReportRequest('https://example.invalid',{},'create');}catch(e){error=e;}
 assert.equal(error.code,'EXPORT_NETWORK');assert.ok(!error.message.includes('private'));
 const logs=[];t.mock.method(console,'warn',(...args)=>logs.push(args));logExportError('sheets',error);
 assert.ok(!JSON.stringify(logs).includes('private'));assert.equal(exportErrorText(error,k=>k),'report.exportNetwork');
 assert.equal(exportErrorText(new Error('unknown'),k=>k),'report.exportFailed');
});
