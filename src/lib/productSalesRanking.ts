import type { Product, SaleItem } from '../types';

/** Compare sales using the same base unit used for each product's inventory. */
export function soldBaseQuantity(item: Pick<SaleItem, 'quantity' | 'format' | 'stockDeduction'>, product?: Pick<Product, 'type' | 'unitsPerPackage'>): number {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return 0;
  let multiplier = item.stockDeduction;
  if (!Number.isFinite(multiplier) || !multiplier || multiplier <= 0) {
    const format = String(item.format || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    multiplier = product?.type === 'cigarro'
      ? /maco|pacote/.test(format) ? 10 : /meia/.test(format) ? 0.5 : /carteira/.test(format) ? 1 : /avulsa|cigarro/.test(format) ? 0.05 : 1
      : /fardo|pacote/.test(format) ? Number(format.match(/\((\d+)/)?.[1]) || product?.unitsPerPackage || 1 : 1;
  }
  return Math.round(item.quantity * multiplier * 10000) / 10000;
}

export function rankProductsBySales<T extends Pick<Product, 'id' | 'name'>>(products: T[], totals: Record<string, number>): T[] {
  return [...products].sort((a, b) => (totals[b.id || ''] || 0) - (totals[a.id || ''] || 0)
    || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    || String(a.id || '').localeCompare(String(b.id || '')));
}
