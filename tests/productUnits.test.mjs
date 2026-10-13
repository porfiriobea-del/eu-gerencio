import test from 'node:test';
import assert from 'node:assert/strict';
import { getPackageUnits, getCigaretteFormats, calculateStockUpdates } from '../src/lib/productUnits.ts';

test('cigarette package always contains 200 individual units, including legacy metadata', () => {
  assert.equal(getPackageUnits({ type: 'cigarro', unitsPerPackage: 1 }), 200);
  assert.equal(getPackageUnits({ type: 'cigarro', unitsPerPackage: 20 }), 200);
  assert.equal(getPackageUnits({ type: 'comum', unitsPerPackage: 6 }), 6);
});

test('independent format prices do not alter physical stock conversions', () => {
  const formats = getCigaretteFormats({ basePrice: 1, priceUnit: 0.75, priceHalfCart: 6, priceCart: 11, pricePack: 100 });
  assert.deepEqual(formats.map(f => [f.units, f.price]), [[200, 100], [20, 11], [10, 6], [1, 0.75]]);
  for (const format of formats) {
    assert.deepEqual(calculateStockUpdates([{ product: { id: 'c' }, quantity: 1, stockDeduction: format.units }], [{ id: 'c', stock: 200 }]), [{ id: 'c', newStock: 200 - format.units }]);
  }
});

test('mixed-format quantities aggregate per product using the latest balance', () => {
  const lines = [
    { product: { id: 'c' }, quantity: 2, stockDeduction: 20 },
    { product: { id: 'c' }, quantity: 1, stockDeduction: 10 },
    { product: { id: 'c' }, quantity: 3, stockDeduction: 1 }
  ];
  assert.deepEqual(calculateStockUpdates(lines, [{ id: 'c', stock: 200 }]), [{ id: 'c', newStock: 147 }]);
  assert.throws(() => calculateStockUpdates(lines, [{ id: 'c', stock: 52, name: 'Cigarros' }]), /Estoque insuficiente/);
});

test('rejects fractional or negative sale quantities and removed products', () => {
  for (const quantity of [-1, 0, 1.5]) {
    assert.throws(() => calculateStockUpdates([{ product: { id: 'c' }, quantity, stockDeduction: 20 }], [{ id: 'c', stock: 200 }]), /inválido/);
  }
  assert.throws(() => calculateStockUpdates([{ product: { id: 'c' }, quantity: 1, stockDeduction: 20 }], []), /Estoque insuficiente/);
});
