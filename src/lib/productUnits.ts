import type { Product } from '../types';

export const CIGARETTE_UNITS = { unit: 0.05, halfCart: 0.5, cart: 1, pack: 10 } as const;

export function getPackageUnits(product: Pick<Product, 'type' | 'unitsPerPackage'>): number {
  return product.type === 'cigarro' ? CIGARETTE_UNITS.pack : Math.max(1, Number(product.unitsPerPackage) || 1);
}

export function getCigaretteFormats(product: Pick<Product, 'basePrice' | 'priceUnit' | 'priceHalfCart' | 'priceCart' | 'pricePack'>) {
  const unitPrice = product.priceUnit ?? product.basePrice;
  return [
    { label: 'Maço (10 carteiras)', units: CIGARETTE_UNITS.pack, price: product.pricePack ?? Number((unitPrice * 200).toFixed(2)) },
    { label: 'Carteira (20 un.)', units: CIGARETTE_UNITS.cart, price: product.priceCart ?? Number((unitPrice * 20).toFixed(2)) },
    { label: 'Meia Carteira (10 un.)', units: CIGARETTE_UNITS.halfCart, price: product.priceHalfCart ?? Number((unitPrice * 10).toFixed(2)) },
    { label: 'Unidade Avulsa', units: CIGARETTE_UNITS.unit, price: unitPrice }
  ];
}

interface StockLine {
  product: Pick<Product, 'id' | 'name'>;
  quantity: number;
  stockDeduction: number;
}

/** Compare and subtract in integer twentieths to avoid fractional drift. */
export function calculateStockUpdates(lines: StockLine[], products: Pick<Product, 'id' | 'name' | 'stock'>[]) {
  const deductions = new Map<string, number>();
  for (const line of lines) {
    const id = line.product.id;
    if (!id || !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
        !isValidStockQuantity(line.stockDeduction) || line.stockDeduction <= 0) {
      throw new Error('Quantidade ou formato de venda inválido.');
    }
    deductions.set(id, (deductions.get(id) ?? 0) + line.quantity * Math.round(line.stockDeduction * 20));
  }
  return Array.from(deductions, ([id, units]) => {
    const product = products.find(product => product.id === id);
    if (!product || !isValidStockQuantity(product.stock) || Math.round(product.stock * 20) < units) {
      throw new Error(`Estoque insuficiente para ${product?.name ?? 'este produto'}. Revise o carrinho.`);
    }
    return { id, newStock: (Math.round(product.stock * 20) - units) / 20 };
  });
}


export function isValidStockQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0 &&
    Math.abs(value * 20 - Math.round(value * 20)) < 1e-8;
}

/** Legacy cigarette records use individual cigarettes; convert once using a unit marker. */
export function normalizeCigaretteStock<T extends Partial<Product>>(product: T): T {
  if (product.type !== 'cigarro') return product;
  if (product.stockUnit === 'carteira') return { ...product, unitsPerPackage: 10 };
  const converted: any = { ...product, stockUnit: 'carteira', unitsPerPackage: 10, purchaseForm: 'pacote' };
  for (const field of ['stock', 'initialStock', 'safetyStock', 'maxStock', 'dailyAverageSales'] as const) {
    if (product[field] !== undefined) converted[field] = Number(product[field]) / 20;
  }
  if (product.unitCost !== undefined) converted.unitCost = Number(product.unitCost) * 20;
  return converted;
}

export function cigaretteStockFields(product: Partial<Product>): Partial<Product> {
  if (product.type !== 'cigarro') return {};
  const normalized = normalizeCigaretteStock(product);
  const fields: Partial<Product> = { stockUnit: 'carteira', unitsPerPackage: 10, purchaseForm: 'pacote' };
  for (const key of ['stock', 'initialStock', 'safetyStock', 'maxStock', 'dailyAverageSales', 'unitCost'] as const) {
    if (normalized[key] !== undefined) fields[key] = normalized[key];
  }
  return fields;
}
