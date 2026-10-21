import type { Product, Purchase, SaleItem } from '../types';
import { getPurchasePackageUnits } from './productUnits';
import { soldBaseQuantity } from './productSalesRanking';
import { compareAlphabetical } from './alphabetical';
const DAY = 86400000;
const positive = (n: unknown) => Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0;

export function stockLimitError(product: Pick<Product, 'maxStock' | 'safetyStock'>): boolean {
  return product.maxStock != null && (!Number.isFinite(Number(product.maxStock)) || Number(product.maxStock) < positive(product.safetyStock));
}

export function buildReplenishment(products: Product[], sales: SaleItem[], purchases: Purchase[], now = Date.now()) {
  const aliases = new Map<string, string>();
  for (const product of products) if (product.id && !product.mergedIntoId) {
    aliases.set(product.id, product.id);
    for (const id of product.mergedProductIds || []) aliases.set(id,product.id);
  }
  const quantities = new Map<string, SaleItem[]>();
  for (const item of sales) {
    const id = aliases.get(item.productId) || item.productId;
    const group = quantities.get(id) || [];
    group.push(item); quantities.set(id, group);
  }
  const suppliers = new Map<string, string>();
  for (const purchase of [...purchases].sort((a,b) => b.date.localeCompare(a.date) || b.createdAt-a.createdAt)) {
    const id = aliases.get(purchase.productId) || purchase.productId;
    if (!suppliers.has(id) && purchase.supplier?.trim()) suppliers.set(id, purchase.supplier.trim());
  }
  return products.filter(p => !p.mergedIntoId).map(product => {
    const initial = product.initialStockDate ? new Date(`${product.initialStockDate}T00:00:00`).getTime() : 0;
    const start = Math.max(now - 14 * DAY, Number.isFinite(initial) ? initial : 0);
    const days = Math.max(1, (now - start) / DAY);
    const items = (quantities.get(product.id || '') || []).filter(s => s.createdAt >= start && s.createdAt <= now);
    const sold = items.reduce((sum,item) => sum + soldBaseQuantity(item, product), 0);
    const average = sold > 0 ? sold / days : null;
    const coverage = average ? positive(product.stock) / average : null;
    const desiredDays = Math.max(1, positive(product.stockCoverageDays) || 7);
    const stock = positive(product.stock);
    const isCritical = stock === 0;
    const isBelowSafety = stock < positive(product.safetyStock);
    const maxStock = positive(product.maxStock);
    const target = Math.max(maxStock, (average || 0) * desiredDays);
    const packageUnits = product.type === 'cigarro' || product.purchaseForm !== 'unidade' ? getPurchasePackageUnits(product) : 1;
    const suggestedPackages = Math.max(0, Math.ceil((target - stock - 1e-9) / packageUnits));
    const suggestedBuyUnits = Number((suggestedPackages * packageUnits).toFixed(2));
    return { product, average, coverage, days, desiredDays, maxStock, isCritical, isBelowSafety,
      needsReplenish: isCritical || isBelowSafety || (coverage !== null && coverage < desiredDays),
      suggestedPackages, suggestedBuyUnits, estimatedCost: Number((suggestedBuyUnits * positive(product.unitCost)).toFixed(2)),
      supplier: suppliers.get(product.id || '') || '', invalidLimits: stockLimitError(product), aboveMaximum: maxStock > 0 && stock > maxStock };
  }).filter(item => item.needsReplenish)
    .sort((a,b) => Number(b.isCritical)-Number(a.isCritical) || Number(b.isBelowSafety)-Number(a.isBelowSafety)
      || (a.coverage ?? Infinity)-(b.coverage ?? Infinity) || compareAlphabetical(a.product.name,b.product.name));
}

export function usedSuppliers(purchases: Purchase[]) {
  const names = new Map<string,string>();
  for (const p of purchases) if (p.supplier?.trim()) {
    const name = p.supplier.trim();
    const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();
    if (!names.has(key)) names.set(key,name);
  }
  return [...names.values()].sort(compareAlphabetical);
}
