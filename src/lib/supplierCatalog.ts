import type { Product } from '../types';
import { normalizeProductName } from './duplicateDetector';

export interface SupplierDraft {
  id: string;
  selected: boolean;
  name: string;
  category: string;
  type: 'comum' | 'cigarro';
  purchaseCost: number | '';
  costBasis: 'unidade' | 'carteira' | 'maco' | 'embalagem' | '';
  unitsPerPackage: number | '';
  purchaseForm: 'unidade' | 'fardo' | 'pacote';
  basePrice: number | '';
  pricePack: number | '';
  priceCart: number | '';
  priceHalfCart: number | '';
  priceUnit: number | '';
}

export const blankSupplierDraft = (): SupplierDraft => ({
  id: crypto.randomUUID(), selected: true, name: '', category: 'Diversos', type: 'comum',
  purchaseCost: '', costBasis: '', unitsPerPackage: 1, purchaseForm: 'unidade',
  basePrice: '', pricePack: '', priceCart: '', priceHalfCart: '', priceUnit: ''
});

export function parseSupplierDraft(value: unknown): SupplierDraft {
  const row = value as Record<string, unknown>;
  if (!row || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 100 ||
      typeof row.category !== 'string' || !row.category.trim() || row.category.length > 50 ||
      !['comum', 'cigarro'].includes(String(row.type))) throw new Error('A IA retornou um produto inválido. Tente outro arquivo ou preencha manualmente.');
  const draft = blankSupplierDraft();
  draft.name = row.name.trim(); draft.category = row.category.trim(); draft.type = row.type === 'cigarro' || /cigar/i.test(row.category) ? 'cigarro' : 'comum';
  for (const field of ['purchaseCost', 'basePrice', 'pricePack', 'priceCart', 'priceHalfCart', 'priceUnit'] as const) {
    const value = row[field];
    if (value !== null && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000000)) throw new Error('A IA retornou valores inválidos. Confira o catálogo.');
    draft[field] = typeof value === 'number' ? value : '';
  }
  draft.costBasis = ['unidade', 'carteira', 'maco', 'embalagem'].includes(String(row.costBasis)) ? row.costBasis as SupplierDraft['costBasis'] : '';
  draft.purchaseForm = ['unidade', 'fardo', 'pacote'].includes(String(row.purchaseForm)) ? row.purchaseForm as SupplierDraft['purchaseForm'] : 'unidade';
  draft.unitsPerPackage = draft.type === 'cigarro' ? 10 : typeof row.unitsPerPackage === 'number' && Number.isInteger(row.unitsPerPackage) && row.unitsPerPackage >= 1 && row.unitsPerPackage <= 10000 ? row.unitsPerPackage : '';
  return draft;
}

export function buildSupplierProducts(drafts: SupplierDraft[], existingNames: string[] = []): Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[] {
  const selected = drafts.filter(row => row.selected);
  if (!selected.length || selected.length > 200) throw new Error('Selecione entre 1 e 200 produtos por importação.');
  const names = new Set(existingNames.map(normalizeProductName));
  const products: Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[] = [];
  for (const row of selected) {
    const name = row.name.trim(); const category = row.category.trim();
    if (!name || name.length > 100 || !category || category.length > 50) throw new Error('Preencha nome e categoria de todos os produtos selecionados.');
    const key = normalizeProductName(name);
    if (names.has(key)) continue;
    if (row.purchaseCost === '' || !Number.isFinite(row.purchaseCost) || row.purchaseCost < 0 || !row.costBasis) throw new Error(`Confira o custo e a medida da compra de ${name}.`);
    const cigarette = row.type === 'cigarro';
    const units = cigarette ? 10 : row.unitsPerPackage;
    if (!units || !Number.isSafeInteger(units) || units < 1 || units > 10000) throw new Error(`Informe as unidades por embalagem de ${name}.`);
    let unitCost = row.purchaseCost;
    if (cigarette) {
      if (row.costBasis === 'unidade') unitCost *= 20;
      else if (row.costBasis === 'maco' || row.costBasis === 'embalagem') unitCost /= 10;
      else if (row.costBasis !== 'carteira') throw new Error(`Confira a medida da compra de ${name}.`);
    } else {
      if (row.costBasis === 'embalagem') unitCost /= units;
      else if (row.costBasis !== 'unidade') throw new Error(`Confira a medida da compra de ${name}.`);
    }
    const price = (value: number | '') => {
      if (value === '') return 0;
      if (!Number.isFinite(value) || value < 0 || value > 10000000) throw new Error(`Confira os preços de ${name}.`);
      return value;
    };
    const pricePack = price(row.pricePack), priceCart = price(row.priceCart), priceHalfCart = price(row.priceHalfCart), priceUnit = price(row.priceUnit);
    const basePrice = cigarette ? (priceCart || priceUnit * 20 || priceHalfCart * 2 || pricePack / 10) : price(row.basePrice);
    if (basePrice <= 0) throw new Error(`Informe pelo menos um preço de venda para ${name}.`);
    products.push({ name, category, type: row.type, stockUnit: cigarette ? 'carteira' : 'unidade',
      purchaseForm: cigarette ? 'pacote' : row.purchaseForm, unitsPerPackage: units, unitCost,
      stock: 0, initialStock: 0, initialStockDate: new Date().toISOString().slice(0, 10), safetyStock: 0,
      dailyAverageSales: 0, replacementDays: 3, basePrice,
      ...(cigarette ? { pricePack, priceCart, priceHalfCart, priceUnit } : {}) });
    names.add(key);
  }
  return products;
}
