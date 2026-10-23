import type { Product } from '../types';
import { getCigaretteFormats } from './productUnits';

export function calculateMargin(cost: number, price: number): number | null {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(price) || price <= 0) return null;
  return (price - cost) / price * 100;
}

/** Round up to a cent so the suggested selling price reaches the desired margin. */
export function priceForMargin(cost: number, margin: number): number | null {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(margin) || margin < 0 || margin >= 100) return null;
  return Math.ceil((cost / (1 - margin / 100) - 1e-9) * 100) / 100;
}

export function isFractionalCigarette(product: Product): boolean {
  return product.type === 'cigarro' || /cigar/i.test(product.category || '') ||
    [product.pricePack, product.priceCart, product.priceHalfCart, product.priceUnit].some(price => Number.isFinite(Number(price)) && Number(price) > 0);
}

export function getPricingFormats(product: Product) {
  const details = {
    10: { key: 'pricePack', label: 'Maço', description: '10 carteiras' },
    1: { key: 'priceCart', label: 'Carteira', description: '20 cigarros' },
    0.5: { key: 'priceHalfCart', label: 'Meia carteira', description: '10 cigarros' },
    0.05: { key: 'priceUnit', label: 'Unidade', description: '1 cigarro' }
  } as const;
  return getCigaretteFormats(product).map(format => {
    const detail = details[format.units];
    const cost = Number(product.unitCost) * format.units;
    return { ...detail, units:format.units, cost, price: format.price, margin: calculateMargin(cost, format.price) };
  });
}
