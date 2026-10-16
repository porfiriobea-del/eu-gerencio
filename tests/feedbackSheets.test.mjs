import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/relatorio.ts';
import { createHash } from 'node:crypto';

const feedback={ownerId:'owner',category:'suggestion',message:'Melhorar relatórios',storeName:'Private Store',userEmail:'private@test.invalid',rating:5,createdAt:Date.now(),contact:'Contato solicitado'};
const code=(kind,id)=>`${kind}_${createHash('sha256').update(`${kind}:${id}`).digest('hex')}`;
function setup(t,{ack=true,record=feedback,providerStatus=503}={}) {
 const previous={url:process.env.APPS_SCRIPT_URL,secret:process.env.APPS_SCRIPT_SECRET};
 process.env.APPS_SCRIPT_URL='https://script.google.com/macros/s/test/exec';process.env.APPS_SCRIPT_SECRET='test-only-secret';
 t.after(()=>{for(const [key,value] of [['APPS_SCRIPT_URL',previous.url],['APPS_SCRIPT_SECRET',previous.secret]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const exports=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  if(String(url).includes('/rpc/eu_user_id'))return Response.json('owner');
  if(String(url).includes('/eu_feedbacks?'))return Response.json([{id:'fb_test',data:record}]);
  assert.equal(init.headers['Content-Type'],'text/plain');assert.equal(init.headers.Authorization,undefined);
  exports.push(JSON.parse(init.body));return ack?Response.json(typeof ack==='object'?ack:{ok:true}):new Response(providerStatus === 401 ? '<html>Google sign-in</html>' : 'Unavailable',{status:providerStatus,headers:{'Content-Type':providerStatus === 401 ? 'text/html' : 'text/plain'}});
 });return exports;
}
async function invoke(body,authorization='Bearer mock-jwt') {
 const result={status:200};const res={status(value){result.status=value;return this;},json(value){result.body=value;return this;}};
 await handler({method:'POST',body,headers:{authorization}},res);return result;
}
test('feedback is read from Supabase, receives a server-only secret and anonymous identities',async t=>{
 const exports=setup(t);
 assert.equal((await invoke({categoria:'feedback',feedbackId:'fb_test',loja:'Private Store',usuario:'private@test.invalid',secret:'browser-value',mensagem:'untrusted'})).body.success,true);
 const payload=exports[0];assert.equal(payload.secret,'test-only-secret');assert.equal(payload.loja,code('loja','owner'));assert.equal(payload.usuario,code('usuario','owner'));
 assert.equal(payload.categoria,'feedback');assert.equal(payload.tipo,'suggestion');assert.equal(payload.nota,5);assert.equal(payload.mensagem,feedback.message);assert.equal(payload.contato,feedback.contact);
 assert.ok(!JSON.stringify(payload).includes('Private Store'));assert.ok(!JSON.stringify(payload).includes('private@test.invalid'));
});
test('usage only forwards allowed event/value fields and anonymous store/user codes',async t=>{
 const exports=setup(t);
 for(const evento of ['venda','produto_cadastrado','foto_ia','fiado_lancado','compra_registrada','erro_tela']) {
  assert.equal((await invoke({categoria:'uso',evento,valor:10,loja:code('loja','store'),email:'private@test.invalid',telefone:'private'})).body.success,true);
  assert.equal(exports.at(-1).evento,evento);assert.equal(exports.at(-1).valor,10);assert.equal(exports.at(-1).loja,code('loja','store'));
  assert.equal(exports.at(-1).email,undefined);assert.equal(exports.at(-1).telefone,undefined);
 }
});
test('missing configuration, anonymous requests and provider failures quietly skip reporting',async t=>{
 setup(t,{ack:false});
 assert.equal((await invoke({categoria:'uso',evento:'venda'},'')).status,202);
 assert.equal((await invoke({categoria:'uso',evento:'venda'})).status,202);
 process.env.APPS_SCRIPT_SECRET='';
 assert.equal((await invoke({categoria:'uso',evento:'venda'})).status,202);
});
test('another users feedback cannot be forwarded',async t=>{
 const exports=setup(t,{record:{...feedback,ownerId:'other-user'}});
 assert.equal((await invoke({categoria:'feedback',feedbackId:'fb_test'})).status,202);assert.equal(exports.length,0);
});
test('voluntary feedback contact is omitted when absent',async t=>{
 const exports=setup(t,{record:{...feedback,contact:''}});
 await invoke({categoria:'feedback',feedbackId:'fb_test'});assert.equal(exports[0].contato,undefined);
});


test('legacy feedback export accepts the Apps Script ok acknowledgement with the server secret',async t=>{
 const exports=setup(t);
 const {default:legacy}=await import('../api/feedback/export.ts');
 const result={};const res={status(code){result.status=code;return this;},json(body){result.body=body;return this;}};
 await legacy({method:'POST',body:{feedbackId:'fb_test'},headers:{authorization:'Bearer mock-jwt'}},res);
 assert.equal(result.body.success,true);assert.equal(exports[0].secret,'test-only-secret');
});
test('unconfirmed acknowledgements log a bounded redacted response preview and HTTP status',async t=>{
 setup(t,{ack:{ok:false,error:'test-only-secret private@test.invalid Contato solicitado Melhorar relatórios '+ 'x'.repeat(500)}});
 const logs=[];t.mock.method(console,'warn',(_label,data)=>logs.push(data));
 const result=await invoke({categoria:'feedback',feedbackId:'fb_test'});
 assert.equal(result.status,202);assert.equal(logs[0].code,'EXPORT_NOT_CONFIRMED');assert.equal(logs[0].status,200);
 assert.ok(logs[0].responsePreview.length<=320);
 for(const value of ['test-only-secret','private@test.invalid','Contato solicitado','Melhorar relatórios'])assert.ok(!JSON.stringify(logs).includes(value));
 assert.ok(logs[0].responsePreview.includes('[REDACTED]'));
});
test('legacy success acknowledgements remain compatible',async t=>{
 setup(t,{ack:{success:true}});
 assert.equal((await invoke({categoria:'feedback',feedbackId:'fb_test'})).body.success,true);
});

test('Google HTML 401 is diagnosed as deployment access denial, not a sheet formula error',async t=>{
 setup(t,{ack:false,providerStatus:401});
 const logs=[];t.mock.method(console,'warn',(_label,data)=>logs.push(data));
 assert.equal((await invoke({categoria:'uso',evento:'venda'})).status,202);
 assert.equal(logs[0].reason,'APPS_SCRIPT_ACCESS_DENIED');
 assert.equal(logs[0].status,401);
});
test('a JSON secret rejection is distinguished from Google authentication',async t=>{
 setup(t,{ack:{ok:false,code:'INVALID_SECRET'}});
 const logs=[];t.mock.method(console,'warn',(_label,data)=>logs.push(data));
 await invoke({categoria:'uso',evento:'venda'});
 assert.equal(logs[0].reason,'APPS_SCRIPT_SECRET_MISMATCH');
});
