import assert from 'node:assert/strict';
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith('/rpc/eu_user_id')) return Response.json('test-owner');
  if (String(url).includes('/rest/v1/eu_feedbacks?')) return Response.json([{id:'fb_test',data:{ownerId:'test-owner',category:'suggestion',message:'Teste local',rating:5,createdAt:Date.now()}}]);
  assert.equal(String(url),'https://script.google.com/macros/s/test/exec');
  assert.equal(init.headers['Content-Type'],'text/plain');
  const payload=JSON.parse(init.body);
  assert.equal(payload.secret,process.env.APPS_SCRIPT_SECRET);
  assert.equal(payload.categoria,'feedback');
  assert.equal(payload.mensagem,'Teste local');
  assert.match(payload.loja,/^loja_[a-f0-9]{64}$/);
  assert.match(payload.usuario,/^usuario_[a-f0-9]{64}$/);
  return Response.json({ok:true});
};
