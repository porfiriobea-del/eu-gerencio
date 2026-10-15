import type { Product } from '../types';
const nonnegative = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? Math.max(0, number) : 0; };
const roundUp = (value: number, step: number) => Math.ceil((value - 1e-9) / step) * step;
const rounded = (value: number) => Number(value.toFixed(2));

/** safetyStock is the buffer, not the entire reorder threshold. */
export function getReorderPoint(product: Pick<Product, 'type' | 'safetyStock' | 'dailyAverageSales' | 'replacementDays'>): number {
  const step = product.type === 'cigarro' ? 0.05 : 1;
  return rounded(Math.max(0, roundUp(nonnegative(product.safetyStock) + nonnegative(product.dailyAverageSales) * nonnegative(product.replacementDays), step)));
}

export function suggestStockLevels(product: Pick<Product, 'type' | 'stock' | 'dailyAverageSales' | 'replacementDays'>, coverageDays = 7) {
  const average = nonnegative(product.dailyAverageSales);
  const current = nonnegative(product.stock);
  const leadTime = nonnegative(product.replacementDays);
  const coverage = Math.max(1, Math.min(365, nonnegative(coverageDays) || 7));
  const step = product.type === 'cigarro' ? 0.05 : 1;
  if (!average) return null;
  const safetyStock = rounded(roundUp(average * leadTime * 0.25, step));
  const minimum = getReorderPoint({ ...product, safetyStock });
  const maximum = rounded(Math.max(minimum, roundUp(average * (leadTime + coverage) + safetyStock, step)));
  return {
    safetyStock, minimum, maximum, coverageDays: coverage,
    daysRemaining: current / average,
    toBuy: rounded(Math.max(0, roundUp(maximum - current, step))),
    excess: rounded(Math.max(0, current - maximum)),
    needsReorder: current <= minimum,
  };
}
