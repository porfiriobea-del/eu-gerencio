import test from 'node:test';
import assert from 'node:assert/strict';
import {exportFullReportToCSV} from '../src/lib/exportUtils.ts';

test('commercial CSV imports all sections without interpreting decorative separators as formulas', async t => {
  let blob;
  const previous = globalThis.document;
  globalThis.document = {createElement: () => ({click() {}}), body: {appendChild() {}, removeChild() {}}};
  t.after(() => {globalThis.document = previous;});
  t.mock.method(URL, 'createObjectURL', value => {blob = value; return 'blob:report';});
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const product = {name: 'Água mineral', category: 'Bebidas', stock: 12, dailyAverageSales: 1, replacementDays: 3, safetyStock: 2};
  const purchase = {productName: product.name, category: product.category, quantity: 12, unitCost: 2, totalCost: 24, date: '2026-10-23'};
  const sale = {type: 'cash', total: 10, feeAmount: 0, createdAt: Date.UTC(2026, 9, 23, 15), itemsSummary: '2x Água mineral'};
  for (const products of [undefined, [product]]) {
    exportFullReportToCSV({storeName: 'Loja teste', periodLabel: 'Hoje', purchases: [purchase], sales: [sale], customers: [{name: 'João', totalDebt: 15}], products});
    const text = await blob.text();
    const rows = text.replace(/^\uFEFF/, '').split('\r\n');
    // The former "====" rows are formulas even when CSV-quoted by an exporter.
    assert.equal(rows.some(row => /^\s*"?=/.test(row)), false);
    for (const title of ['RESUMO FINANCEIRO DO PERÍODO', '1. DETALHAMENTO DE VENDAS REALIZADAS', '2. COMPRAS E REPOSIÇÕES NO PERÍODO', '3. CLIENTES COM SALDO EM FIADO (CADERNETA)']) {
      assert.ok(rows.includes(title), title);
    }
    assert.ok(text.includes('TOTAL VENDAS;;1 vendas;10,00'));
    assert.ok(text.includes('TOTAL COMPRAS;;;12;;;24,00'));
    assert.ok(text.includes('TOTAL FIADO PENDENTE;;15,00'));
    assert.ok(text.includes('"Água mineral"'));
    assert.ok(text.includes('"João"'));
    assert.equal(text.includes('4. VENDA DIÁRIA E SUGESTÃO DE ESTOQUE DE SEGURANÇA'), !!products);
  }
});
