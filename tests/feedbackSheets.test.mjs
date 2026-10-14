import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/feedback/export.ts';

const feedback={ownerId:'owner',category:'suggestion',message:'Melhorar relatórios',storeName:'Loja de teste',userEmail:'owner@test.invalid',rating:5,createdAt:Date.UTC(2026,9,14),contact:'Contato de teste'};
async function invoke(body={feedbackId:'fb_test'},authorization='Bearer mock-jwt') {
 const result={status:200};
 const res={status(value){result.status=value;return this;},json(value){result.body=value;return this;}};
 await handler({method:'POST',body,headers:{authorization}},res);return result;
}
function transport(t,{owner='owner',record=feedback,ack=true}={}) {
 const exports=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  if(String(url).includes('/rpc/eu_user_id')){assert.equal(init.headers.Authorization,'Bearer mock-jwt');return Response.json(owner);}
  if(String(url).includes('/eu_feedbacks?')){assert.ok(String(url).includes('owner_id=eq.owner'));return Response.json(record?[{id:'fb_test',data:record}]:[]);}
  assert.match(String(url),/^https:\/\/script.google.com\/macros\/s\/.+\/exec$/);
  assert.equal(init.headers.Authorization,undefined);
  exports.push(JSON.parse(init.body));
  return ack?Response.json({success:true}):new Response('<html>Not confirmed</html>');
 });return exports;
}
test('feedback export requires authentication before making any network request',async t=>{
 t.mock.method(globalThis,'fetch',()=>assert.fail('No anonymous export'));
 assert.equal((await invoke({},undefined)).status,400);
 assert.equal((await invoke({feedbackId:'fb_test'},'')).status,401);
});
test('feedback export reads the cloud record and exports all five category labels',async t=>{
 const exports=transport(t);
 for(const [category,label] of [['suggestion','Sugestão'],['praise','Elogio'],['bug','Problema'],['question','Dúvida'],['other','Outro']]){
  feedback.category=category;
  assert.equal((await invoke({feedbackId:'fb_test',message:'Untrusted browser content'})).body.success,true);
  assert.equal(exports.at(-1).categoria,label);assert.equal(exports.at(-1).mensagem,'Melhorar relatórios');assert.equal(exports.at(-1).linha.length,8);
 }
});
test('missing or another users feedback cannot be exported',async t=>{
 const exports=transport(t,{record:{...feedback,ownerId:'different-user'}});
 assert.equal((await invoke()).status,404);assert.equal(exports.length,0);
});
test('an HTML response is never announced as a confirmed spreadsheet write',async t=>{
 transport(t,{ack:false});t.mock.method(console,'warn',()=>{});
 assert.equal((await invoke()).status,502);
});
test('spreadsheet cells cannot turn submitted feedback into a formula',async t=>{
 const exports=transport(t,{record:{...feedback,message:'=IMPORTXML("example")'}});
 assert.equal((await invoke()).status,200);
 assert.ok(exports[0].linha[6].startsWith("'="));
});
