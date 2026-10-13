import test from 'node:test';
import assert from 'node:assert/strict';
import { getPackageUnits, getCigaretteFormats, calculateStockUpdates, normalizeCigaretteStock, isValidStockQuantity } from '../src/lib/productUnits.ts';

test('cigarette package always contains 10 carteiras, including legacy metadata', () => {
  assert.equal(getPackageUnits({ type: 'cigarro', unitsPerPackage: 1 }), 10);
  assert.equal(getPackageUnits({ type: 'cigarro', unitsPerPackage: 20 }), 10);
  assert.equal(getPackageUnits({ type: 'comum', unitsPerPackage: 6 }), 6);
});

test('independent format prices do not alter physical stock conversions', () => {
  const formats = getCigaretteFormats({ basePrice: 1, priceUnit: 0.75, priceHalfCart: 6, priceCart: 11, pricePack: 100 });
  assert.deepEqual(formats.map(f => [f.units, f.price]), [[10, 100], [1, 11], [0.5, 6], [0.05, 0.75]]);
  for (const format of formats) {
    assert.deepEqual(calculateStockUpdates([{ product: { id: 'c' }, quantity: 1, stockDeduction: format.units }], [{ id: 'c', stock: 10 }]), [{ id: 'c', newStock: 10 - format.units }]);
  }
});

test('mixed-format quantities aggregate per product using the latest balance', () => {
  const lines = [
    { product: { id: 'c' }, quantity: 2, stockDeduction: 1 },
    { product: { id: 'c' }, quantity: 1, stockDeduction: 0.5 },
    { product: { id: 'c' }, quantity: 3, stockDeduction: 0.05 }
  ];
  assert.deepEqual(calculateStockUpdates(lines, [{ id: 'c', stock: 10 }]), [{ id: 'c', newStock: 7.35 }]);
  assert.throws(() => calculateStockUpdates(lines, [{ id: 'c', stock: 2.6, name: 'Cigarros' }]), /Estoque insuficiente/);
});

test('rejects fractional or negative sale quantities and removed products', () => {
  for (const quantity of [-1, 0, 1.5]) {
    assert.throws(() => calculateStockUpdates([{ product: { id: 'c' }, quantity, stockDeduction: 1 }], [{ id: 'c', stock: 10 }]), /inválido/);
  }
  assert.throws(() => calculateStockUpdates([{ product: { id: 'c' }, quantity: 1, stockDeduction: 1 }], []), /Estoque insuficiente/);
});


test('twenty loose cigarette sales exhaust exactly one carteira without rounding drift', () => {
  let stock = 1;
  for (let i = 0; i < 20; i++) {
    stock = calculateStockUpdates([{ product: { id: 'c' }, quantity: 1, stockDeduction: 0.05 }], [{ id: 'c', stock }])[0].newStock;
  }
  assert.equal(stock, 0);
  assert.throws(() => calculateStockUpdates([{ product: { id: 'c' }, quantity: 1, stockDeduction: 0.05 }], [{ id: 'c', stock }]), /insuficiente/);
  assert.equal(isValidStockQuantity(0.03), false);
});

test('legacy stock and cost conversion is idempotent and preserves independent sale prices', () => {
  const legacy = { type: 'cigarro', stock: 200, initialStock: 210, safetyStock: 40, maxStock: 400, dailyAverageSales: 20, unitCost: 0.45, basePrice: 0.75, priceCart: 13, pricePack: 130, unitsPerPackage: 200 };
  const converted = normalizeCigaretteStock(legacy);
  assert.equal(converted.stock, 10);
  assert.equal(converted.initialStock, 10.5);
  assert.equal(converted.safetyStock, 2);
  assert.equal(converted.maxStock, 20);
  assert.equal(converted.dailyAverageSales, 1);
  assert.equal(converted.unitCost, 9);
  assert.equal(converted.stockUnit, 'carteira');
  assert.equal(converted.priceCart, 13);
  assert.equal(converted.basePrice, 0.75);
  assert.deepEqual(normalizeCigaretteStock(converted), converted);
});
