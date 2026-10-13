// Isolated integration-test transport: no Google request or real credential is used.
import assert from 'node:assert/strict';
globalThis.fetch = async (url, options) => {
  assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\//);
  const body = JSON.parse(options.body);
  const image = body.contents[0].parts.find(part => part.inlineData)?.inlineData;
  assert.equal(image.mimeType, 'image/jpeg');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  const marker = Buffer.from(image.data, 'base64').toString();
  if (marker === 'failure') throw new Error('Simulated upstream outage');
  const text = marker === 'invalid-json' ? '{broken' : marker === 'unreadable'
    ? JSON.stringify({ name: '', category: '' })
    : JSON.stringify({ name: ' Café 500g ', category: 'mercearia', stock: 10, estimatedCost: 20 });
  return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });
};
