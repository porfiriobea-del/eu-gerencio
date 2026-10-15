import test from 'node:test';
import assert from 'node:assert/strict';
import { getPackageUnits, getPurchasePackageUnits, getCigaretteFormats, calculateStockUpdates, normalizeCigaretteStock, isValidStockQuantity, formatCigaretteStock, formatProductStock } from '../src/lib/productUnits.ts';

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

test('only explicitly priced cigarette formats are available; basePrice never enables avulso', () => {
  const formats = getCigaretteFormats({ basePrice: 99, priceCart: 13 });
  assert.equal(formats.length, 1);
  assert.equal(formats[0].units, 1);
  assert.equal(formats[0].price, 13);
  assert.deepEqual(calculateStockUpdates([{ product: { id: 'c' }, quantity: 1, stockDeduction: formats[0].units }], [{ id: 'c', stock: 10 }]), [{ id: 'c', newStock: 9 }]);
});

test('empty, missing, zero, negative and non-finite prices disable their formats', () => {
  assert.deepEqual(getCigaretteFormats({ basePrice: 1 }), []);
  assert.deepEqual(getCigaretteFormats({ basePrice: 1, pricePack: '', priceCart: 0, priceHalfCart: undefined, priceUnit: null }), []);
  assert.deepEqual(getCigaretteFormats({ basePrice: 1, pricePack: -1, priceCart: NaN, priceHalfCart: Infinity, priceUnit: 0 }), []);
});

test('clearing an avulso price does not change other prices or stock conversion factors', () => {
  const product = { basePrice: 0.75, pricePack: 100, priceCart: 11, priceHalfCart: 6, priceUnit: 0.75 };
  const disabled = { ...product, priceUnit: 0 };
  assert.deepEqual(getCigaretteFormats(disabled).map(format => [format.units, format.price]), [[10, 100], [1, 11], [0.5, 6]]);
  assert.equal(getCigaretteFormats({ ...disabled, priceCart: 0 }).length, 2);
});

test('supplier half pack is five carteiras without redefining the ten-carteira sale pack',()=>{
 const product={type:'cigarro',stockUnit:'carteira',unitsPerPackage:10,supplierPackageUnits:5,stock:20};
 assert.equal(getPurchasePackageUnits(product),5);
 assert.equal(getPackageUnits(product),10);
 const normalized=normalizeCigaretteStock(product);
 assert.equal(normalized.supplierPackageUnits,5);assert.equal(normalized.stock,20);
 assert.equal(getPurchasePackageUnits({...product,supplierPackageUnits:undefined}),10);
 assert.equal(getPurchasePackageUnits({...product,supplierPackageUnits:7}),10);
 assert.equal(getPurchasePackageUnits({type:'comum',unitsPerPackage:6}),6);
});


test('two carteiras minus half is exactly 1.5 and closed carteira plus three loose is exact',()=>{
 const line=(quantity,stockDeduction)=>({product:{id:'c'},quantity,stockDeduction});
 assert.equal(calculateStockUpdates([line(1,0.5)],[{id:'c',stock:2}])[0].newStock,1.5);
 assert.equal(calculateStockUpdates([line(1,1),line(3,0.05)],[{id:'c',stock:2}])[0].newStock,0.85);
 assert.throws(()=>calculateStockUpdates([line(1,1),line(1,0.05)],[{id:'c',stock:1}]),/insuficiente/);
});

test('stock labels contain exact carteiras and cigarettes, never supplier packages',()=>{
 for(const [value,label] of [[0,'0 carteiras'],[0.05,'1 cigarro'],[0.5,'meia carteira'],[1,'1 carteira'],[1.5,'1 carteira e meia'],[1.95,'1 carteira e 19 cigarros'],[10,'10 carteiras']]){
  assert.equal(formatCigaretteStock(value),label);
  assert.equal(formatProductStock({type:'cigarro',stock:value}),label);
 }
 assert.equal(formatCigaretteStock(1.9000000000000001),'1 carteira e 18 cigarros');
 const product={type:'cigarro',stockUnit:'carteira',stock:1.9000000000000001};
 assert.equal(normalizeCigaretteStock(product).stock,1.9);
 assert.equal(normalizeCigaretteStock({...product,stock:0.03}).stock,0.03);
 assert.ok(getCigaretteFormats({pricePack:10}).every(format=>!/[mp]a[cç]o|pacote/i.test(format.label)));
});
