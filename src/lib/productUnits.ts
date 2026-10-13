import type { Product } from '../types';

export const CIGARETTE_UNITS = { unit: 1, halfCart: 10, cart: 20, pack: 200 } as const;

export function getPackageUnits(product: Pick<Product, 'type' | 'unitsPerPackage'>): number {
  return product.type === 'cigarro' ? CIGARETTE_UNITS.pack : Math.max(1, Number(product.unitsPerPackage) || 1);
}

export function getCigaretteFormats(product: Pick<Product, 'basePrice' | 'priceUnit' | 'priceHalfCart' | 'priceCart' | 'pricePack'>) {
  const unitPrice = product.priceUnit ?? product.basePrice;
  return [
    { label: 'Pacote/Maço (200 un.)', units: CIGARETTE_UNITS.pack, price: product.pricePack ?? Number((unitPrice * 200).toFixed(2)) },
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

/** All stock balances and deductions are measured in the smallest individual unit. */
export function calculateStockUpdates(lines: StockLine[], products: Pick<Product, 'id' | 'name' | 'stock'>[]) {
  const deductions = new Map<string, number>();
  for (const line of lines) {
    const id = line.product.id;
    if (!id || !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
        !Number.isSafeInteger(line.stockDeduction) || line.stockDeduction < 1) {
      throw new Error('Quantidade ou formato de venda inválido.');
    }
    deductions.set(id, (deductions.get(id) ?? 0) + line.quantity * line.stockDeduction);
  }
  return Array.from(deductions, ([id, units]) => {
    const product = products.find(product => product.id === id);
    if (!product || !Number.isSafeInteger(product.stock) || product.stock < units) {
      throw new Error(`Estoque insuficiente para ${product?.name ?? 'este produto'}. Revise o carrinho.`);
    }
    return { id, newStock: product.stock - units };
  });
}
