// Isolated integration-test transport: no Google request or real credential is used.
import assert from 'node:assert/strict';
globalThis.fetch = async (url, options) => {
  assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\//);
  const body = JSON.parse(options.body);
  const prompt = body.contents[0].parts.find(part => part.text)?.text;
  if (prompt.includes('purchaseCost')) {
    const file = body.contents[0].parts.find(part => part.inlineData)?.inlineData;
    assert.ok(!file.data.startsWith('data:'));
    assert.ok(['application/pdf', 'image/jpeg'].includes(file.mimeType));
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    const marker = Buffer.from(file.data, 'base64').toString();
    if (marker.includes('catalog-quota')) return Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Simulated quota' } }, { status: 429 });
    const item = { name: 'Suco Uva 1L', category: 'bebidas', type: 'comum', purchaseCost: 60, costBasis: 'embalagem', purchaseForm: 'fardo', unitsPerPackage: 12, basePrice: null, pricePack: null, priceCart: null, priceHalfCart: null, priceUnit: null };
    const text = marker.includes('catalog-invalid-json') ? '{broken' : marker.includes('catalog-negative') ? JSON.stringify({ products: [{ ...item, purchaseCost: -1 }] }) : JSON.stringify({ products: marker.includes('catalog-empty') ? [] : [item, { ...item, name: 'Suco Laranja 1L' }], truncated: false });
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });
  }
  for (const evidence of ['MARCA', 'RÓTULO', 'INGREDIENTES', 'EAN']) assert.ok(prompt.includes(evidence));
  const image = body.contents[0].parts.find(part => part.inlineData)?.inlineData;
  assert.ok(!image.data.startsWith('data:'));
  assert.equal(image.mimeType, 'image/jpeg');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  const marker = Buffer.from(image.data, 'base64').toString();
  if (marker === 'quota') return Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Simulated quota limit' } }, { status: 429 });
  if (marker === 'denied') return Response.json({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Simulated permission failure' } }, { status: 403 });
  if (marker === 'failure') throw new Error('Simulated upstream outage');
  const text = marker === 'invalid-json' ? '{broken' : marker === 'unreadable'
    ? JSON.stringify({ name: '', category: '' })
    : JSON.stringify({ name: ' Café 500g ', category: 'mercearia', stock: 10, estimatedCost: 20 });
  return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });
};
