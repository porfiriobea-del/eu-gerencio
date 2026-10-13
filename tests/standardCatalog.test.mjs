import test from 'node:test';
import assert from 'node:assert/strict';
import { getStandardCatalog, selectMissingCatalog, catalogKey, toSupabaseCatalogRows } from '../src/lib/standardCatalog.ts';
import { executeCatalogImport } from '../src/lib/catalogImport.ts';
import { getCigaretteFormats } from '../src/lib/productUnits.ts';

const catalog = getStandardCatalog('2026-10-13');

test('standard catalogue has more than 100 distinct products with zero initial stock', () => {
  assert.ok(catalog.length > 100, `Only ${catalog.length} products`);
  assert.equal(new Set(catalog.map(product => catalogKey(product.name))).size, catalog.length);
  for (const product of catalog) {
    assert.equal(product.stock, 0);
    assert.equal(product.initialStock, 0);
    assert.equal(product.initialStockDate, '2026-10-13');
    assert.ok(Number.isFinite(product.unitCost) && product.unitCost >= 0);
    assert.ok(product.basePrice > 0);
    assert.ok(!('suggestedQty' in product) && !('description' in product));
  }
  for (const term of ['Marlboro', 'Chesterfield', 'Seda', 'Isqueiro', 'Coca-Cola']) assert.ok(catalog.some(product => product.name.includes(term)));
});

test('cigarette cost and stock metadata are normalized once to carteiras; all four formats are enabled', () => {
  const cigarettes = catalog.filter(product => product.type === 'cigarro');
  assert.ok(cigarettes.length > 2);
  for (const product of cigarettes) {
    assert.equal(product.stockUnit, 'carteira');
    assert.equal(product.unitsPerPackage, 10);
    assert.equal(getCigaretteFormats(product).length, 4);
  }
  const marlboro = cigarettes.find(product => product.name === 'Cigarro Marlboro Red Box');
  assert.equal(marlboro.unitCost, 10.5);
});

test('existing product names are preserved with accent/case/spacing insensitive deduplication', () => {
  const existing = catalog.map(product => ({ name: ` ${product.name.toUpperCase()} ` }));
  assert.equal(selectMissingCatalog(catalog, existing).length, 0);
  assert.equal(selectMissingCatalog(catalog, existing.slice(1)).length, 1);
});

test('Supabase payload retains all four prices and separates catalog keys by owner', () => {
  const product = catalog.find(product => product.type === 'cigarro');
  const [row] = toSupabaseCatalogRows([product], 'store-a');
  assert.equal(row.catalog_owner_id, 'store-a');
  assert.equal(row.estoque_atual, 0);
  assert.equal(row.preco_custo, product.unitCost);
  assert.equal(row.preco_venda, product.priceCart);
  for (const key of ['pricePack', 'priceCart', 'priceHalfCart', 'priceUnit']) assert.equal(row.catalog_data[key], product[key]);
  assert.throws(() => toSupabaseCatalogRows([product], ''));
});

test('bulk import waits for both databases and returns only confirmed Stock additions', async () => {
  const calls = [];
  const count = await executeCatalogImport('owner', {
    readExisting: async () => { calls.push('read'); return catalog.slice(0, 2); },
    insertSupabase: async rows => { calls.push('supabase'); assert.equal(rows.length, catalog.length - 2); },
    insertStock: async rows => { calls.push('stock'); assert.equal(rows.length, catalog.length - 2); return rows.length - 1; }
  });
  assert.deepEqual(calls, ['read', 'supabase', 'stock']);
  assert.equal(count, catalog.length - 3);
});

test('failed Supabase confirmation prevents Stock writes and reports no success', async () => {
  await assert.rejects(executeCatalogImport('owner', {
    readExisting: async () => [],
    insertSupabase: async () => { throw new Error('Denied'); },
    insertStock: async () => assert.fail('Stock must not be written')
  }), /Denied/);
});

test('reimport of a complete catalogue performs no writes', async () => {
  assert.equal(await executeCatalogImport('owner', {
    readExisting: async () => catalog,
    insertSupabase: async () => assert.fail('No duplicated Supabase writes'),
    insertStock: async () => assert.fail('No duplicated Stock writes')
  }), 0);
});
