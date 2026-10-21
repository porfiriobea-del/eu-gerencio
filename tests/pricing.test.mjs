import {PreferencesProvider} from '../src/lib/preferencesContext.tsx';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateMargin, priceForMargin, getPricingFormats, isFractionalCigarette } from '../src/lib/pricing.ts';
import { ProductPricingCard } from '../src/components/ProductPricingCard.tsx';

const product = { id: 'p1', name: 'Seda', category: 'Sedas', type: 'comum', unitCost: 1.25, basePrice: 3.5 };

test('profit margin uses sale revenue and suggestions reach 20/30/40 percent after rounding', () => {
  assert.ok(Math.abs(calculateMargin(1.25, 3.5) - 64.285714) < 0.000001);
  assert.equal(priceForMargin(1, 20), 1.25);
  for (const margin of [20, 30, 40]) {
    const price = priceForMargin(1.25, margin);
    assert.ok(calculateMargin(1.25, price) >= margin - 1e-9);
    assert.ok(calculateMargin(1.25, price - 0.01) < margin);
  }
  assert.equal(calculateMargin(2, 1), -100);
  assert.equal(calculateMargin(0, 1), 100);
  for (const price of [0, -1, NaN, Infinity]) assert.equal(calculateMargin(1, price), null);
  for (const cost of [0, -1, NaN, Infinity]) assert.equal(priceForMargin(cost, 20), null);
  assert.equal(priceForMargin(1, 100), null);
});

test('cigarette pricing scales carteira cost for each enabled format without inferred prices', () => {
  const cigarette = { ...product, type: 'cigarro', unitCost: 8, basePrice: 100, pricePack: 100, priceCart: 12, priceHalfCart: 7, priceUnit: 1 };
  const formats = getPricingFormats(cigarette);
  assert.deepEqual(formats.map(({ key, cost, price }) => ({ key, cost, price })), [
    { key: 'pricePack', cost: 80, price: 100 },
    { key: 'priceCart', cost: 8, price: 12 },
    { key: 'priceHalfCart', cost: 4, price: 7 },
    { key: 'priceUnit', cost: 0.4, price: 1 }
  ]);
  assert.equal(formats[0].margin, 20);
  assert.equal(formats[3].margin, 60);
  assert.deepEqual(getPricingFormats({ ...cigarette, pricePack: 0, priceCart: undefined, priceHalfCart: NaN, priceUnit: 1 }).map(format => format.key), ['priceUnit']);
  assert.equal(isFractionalCigarette({ ...product, category: 'Cigarros' }), true);
  assert.equal(isFractionalCigarette({ ...product, priceCart: 10 }), true);
  assert.equal(isFractionalCigarette({ ...product, pricePackage: 20 }), false);
});

test('standard pricing renders a detailed card with suggestions and no table', () => {
  const markup = renderToStaticMarkup(React.createElement(PreferencesProvider,null,React.createElement(ProductPricingCard, { product, isSaving: false, onUpdatePrice() {} })));
  assert.match(markup, /<article/);
  assert.ok(!markup.includes('<table'));
  assert.match(markup, /64,3%/);
  for (const margin of [20, 30, 40]) assert.match(markup, new RegExp(`Sugestão ${margin}%`));
});

test('fractional card shows only priced formats and targets the correct price field', () => {
  const markup = renderToStaticMarkup(React.createElement(PreferencesProvider,null,React.createElement(ProductPricingCard, {
    product: { ...product, category: 'Cigarros', unitCost: 8, priceCart: 12, priceUnit: 0 }, isSaving: false, onUpdatePrice() {}
  })));
  assert.match(markup, /xl:grid-cols-4/);
  assert.match(markup, /20 cigarros/);
  assert.match(markup, /no formato Carteira/);
  assert.ok(!markup.includes('1 cigarro</p>'));
  assert.ok(!markup.includes('10 carteiras</p>'));
  assert.ok(!markup.includes('10 cigarros</p>'));
});
