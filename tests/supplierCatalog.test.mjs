import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSupplierDraft, buildSupplierProducts } from '../src/lib/supplierCatalog.ts';
import { recognizeCatalog, prepareCatalogFile } from '../src/lib/geminiCatalogScanner.ts';
import { executeCatalogImport, catalogDocumentId } from '../src/lib/catalogImport.ts';

const source = { name: 'Suco do Fornecedor 1L', category: 'Bebidas', type: 'comum', purchaseCost: 60, costBasis: 'embalagem', unitsPerPackage: 12, purchaseForm: 'fardo', basePrice: 8 };

test('supplier costs use explicit package measures; missing prices are never invented', () => {
  const draft = parseSupplierDraft(source);
  assert.equal(draft.priceCart, '');
  const [product] = buildSupplierProducts([draft]);
  assert.equal(product.unitCost, 5);
  assert.equal(product.basePrice, 8);
  assert.equal(product.stock, 0);
  assert.equal(product.unitsPerPackage, 12);
  const missing = parseSupplierDraft({ ...source, basePrice: null });
  assert.equal(missing.basePrice, '');
  assert.throws(() => buildSupplierProducts([missing]), /preço de venda/);
  assert.throws(() => buildSupplierProducts([parseSupplierDraft({ ...source, costBasis: null })]), /medida/);
  assert.throws(() => buildSupplierProducts([parseSupplierDraft({ ...source, unitsPerPackage: null })]), /unidades por embalagem/);
});

test('cigarette supplier prices preserve optional formats and convert cost to carteiras', () => {
  const source = { name: 'Cigarro Fornecedor', category: 'Cigarros', type: 'cigarro', purchaseCost: 80, costBasis: 'maco', priceCart: 12, priceUnit: null, basePrice: null };
  const [product] = buildSupplierProducts([parseSupplierDraft(source)]);
  assert.equal(product.unitCost, 8);
  assert.equal(product.stockUnit, 'carteira');
  assert.equal(product.unitsPerPackage, 10);
  assert.equal(product.priceCart, 12);
  assert.equal(product.pricePack, 0);
  assert.equal(product.priceHalfCart, 0);
  assert.equal(product.priceUnit, 0);
  assert.equal(buildSupplierProducts([parseSupplierDraft({ ...source, purchaseCost: 0.4, costBasis: 'unidade' })])[0].unitCost, 8);
  assert.equal(buildSupplierProducts([parseSupplierDraft({ ...source, purchaseCost: 8, costBasis: 'carteira' })])[0].unitCost, 8);
});

test('supplier review rejects invalid money and ignores deselected or duplicate names', () => {
  const draft = parseSupplierDraft(source);
  assert.throws(() => parseSupplierDraft({ ...source, purchaseCost: -1 }), /inválidos/);
  assert.throws(() => buildSupplierProducts([{ ...draft, basePrice: -1 }]), /preços/);
  assert.equal(buildSupplierProducts([draft, { ...draft, name: draft.name.toUpperCase() }]).length, 1);
  assert.equal(buildSupplierProducts([draft], [source.name.toUpperCase()]).length, 0);
  assert.equal(buildSupplierProducts([draft, { ...draft, selected: false, name: '' }]).length, 1);
});

test('custom imports contain only reviewed supplier items, never the standard catalogue', async () => {
  const products = buildSupplierProducts([parseSupplierDraft(source)]);
  assert.equal(await executeCatalogImport('owner', {
    readExisting: async () => [],
    insertProducts: async rows => { assert.deepEqual(rows, products); return rows.length; }
  }, products), 1);
});

test('catalogue scanner sends raw image/PDF Base64 and parses multiple products', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/gemini/recognize-catalog');
    const body = JSON.parse(options.body);
    assert.ok(!body.fileBase64.startsWith('data:'));
    assert.ok(['image/jpeg', 'application/pdf'].includes(body.mimeType));
    return Response.json({ success: true, products: [source, { ...source, name: 'Segundo produto', purchaseCost: null }], truncated: true });
  });
  for (const data of ['data:image/jpeg;base64,aW1hZ2U=', `data:application/pdf;base64,${Buffer.from('%PDF-example').toString('base64')}`]) {
    const result = await recognizeCatalog(data, ['Bebidas']);
    assert.equal(result.products.length, 2);
    assert.equal(result.products[1].purchaseCost, '');
    assert.equal(result.truncated, true);
  }
});

test('catalogue scanner rejects invalid data and offers manual input after service failures', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(recognizeCatalog('data:image/jpeg;base64,aW1hZ2U=', []), /conexão.*manualmente/);
  await assert.rejects(recognizeCatalog('data:image/svg+xml;base64,aW1hZ2U=', []), /inválido/);
  globalThis.fetch = async () => Response.json({ error: 'Quota' }, { status: 429 });
  await assert.rejects(recognizeCatalog('data:image/jpeg;base64,aW1hZ2U=', []), /limite.*manualmente/);
  globalThis.fetch = async () => new Response('failure', { status: 500 });
  await assert.rejects(recognizeCatalog('data:image/jpeg;base64,aW1hZ2U=', []), /preencha manualmente/);
});

test('PDF preparation validates actual content and size before FileReader/upload', async () => {
  await assert.rejects(prepareCatalogFile(new File(['fake'], 'catalog.pdf', { type: 'application/pdf' })), /PDF válido/);
  await assert.rejects(prepareCatalogFile(new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'catalog.pdf', { type: 'application/pdf' })), /até 3 MB/);
  await assert.rejects(prepareCatalogFile(new File(['fake'], 'catalog.txt', { type: 'text/plain' })), /Escolha uma foto/);
});


test('catalogue document IDs remain stable, owner-scoped and valid for long names', async () => {
  const id = await catalogDocumentId('owner'.repeat(25), 'Produto '.repeat(12));
  assert.ok(id.length <= 128);
  assert.match(id, /^[a-zA-Z0-9_\-]+$/);
  assert.equal(id, await catalogDocumentId('owner'.repeat(25), 'PRODUTO '.repeat(12)));
  assert.notEqual(id, await catalogDocumentId('other-owner', 'Produto '.repeat(12)));
});


test('catalog scanner explains the 3 MB limit even for a non-JSON platform 413', async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('Payload too large',{status:413}));
  await assert.rejects(recognizeCatalog('data:image/jpeg;base64,aW1hZ2U=',[]),/limite.*3 MB/);
});

test('catalog photos are resized and progressively compressed before upload',async t=>{
  const previous=new Map(['FileReader','Image','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
  const qualities=[];const sizes=[];
  const canvas={width:0,height:0,getContext:()=>({drawImage(){sizes.push([canvas.width,canvas.height]);}}),toDataURL(type,quality){assert.equal(type,'image/jpeg');qualities.push(quality);return 'data:image/jpeg;base64,'+(qualities.length<3?'AAAA'.repeat(1024*1024+1):'aW1hZ2U=');}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas}});
  Object.defineProperty(globalThis,'FileReader',{configurable:true,value:class {result='data:image/png;base64,aW1hZ2U=';readAsDataURL(){queueMicrotask(()=>this.onload());}}});
  Object.defineProperty(globalThis,'Image',{configurable:true,value:class {width=4000;height=3000;set src(value){queueMicrotask(()=>this.onload());}}});
  const result=await prepareCatalogFile(new File(['image'],'catalog.png',{type:'image/png'}));
  assert.equal(result,'data:image/jpeg;base64,aW1hZ2U=');assert.deepEqual(qualities,[0.9,0.8,0.7]);assert.deepEqual(sizes,[[1600,1200]]);
});

test('catalog scanner exposes safe metadata for model failures without logging file contents',async t=>{
  const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args[1]));
  t.mock.method(globalThis,'fetch',async()=>Response.json({code:'MODEL_UNAVAILABLE',providerStatus:404},{status:502,headers:{'x-request-id':'test-request'}}));
  await assert.rejects(recognizeCatalog('data:image/jpeg;base64,aW1hZ2U=',[]),/serviço de leitura está indisponível/);
  assert.deepEqual(logs[0],{code:'MODEL_UNAVAILABLE',status:502,providerStatus:404,requestId:'test-request',mimeType:'image/jpeg',base64Length:8});
  assert.ok(!JSON.stringify(logs).includes('aW1hZ2U='));
});
