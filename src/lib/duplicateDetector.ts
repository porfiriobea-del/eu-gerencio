import { Product } from '../types';

/**
 * Normalizes a product name for comparison:
 * - strips accents and diacritics
 * - lowercases
 * - strips punctuation and special symbols
 * - collapses multiple spaces
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DuplicateAnalysis {
  duplicateIdSet: Set<string>;
  duplicateCountById: Map<string, number>;
  duplicateGroupKeyById: Map<string, string>;
  duplicateGroups: Map<string, Product[]>;
  totalDuplicates: number; // number of products that are in duplicate groups
  uniqueDuplicateNamesCount: number; // number of unique items that have duplicates
}

/**
 * Analyzes a list of products and identifies all duplicates:
 * - Products with identical or normalized-equivalent names
 * - Products with the exact same non-empty barcode
 */
export function analyzeDuplicates(products: Product[]): DuplicateAnalysis {
  const nameGroups = new Map<string, Product[]>();
  const barcodeGroups = new Map<string, Product[]>();

  products.forEach(p => {
    if (p.mergedIntoId) return;
    const normName = normalizeProductName(p.name);
    if (normName) {
      const existing = nameGroups.get(normName) || [];
      existing.push(p);
      nameGroups.set(normName, existing);
    }

    const barcode = normalizeBarcode(p.barcode);
    if (barcode) {
      const existing = barcodeGroups.get(barcode) || [];
      existing.push(p);
      barcodeGroups.set(barcode, existing);
    }
  });

  const duplicateIdSet = new Set<string>();
  const duplicateCountById = new Map<string, number>();
  const duplicateGroupKeyById = new Map<string, string>();
  const duplicateGroups = new Map<string, Product[]>();

  // Check name duplicates
  nameGroups.forEach((group, key) => {
    if (group.length > 1) {
      duplicateGroups.set(`name:${key}`, group);
      group.forEach(prod => {
        if (prod.id) {
          duplicateIdSet.add(prod.id);
          duplicateCountById.set(prod.id, group.length);
          duplicateGroupKeyById.set(prod.id, `name:${key}`);
        }
      });
    }
  });

  // Check barcode duplicates
  barcodeGroups.forEach((group, key) => {
    if (group.length > 1) {
      const groupKey = `barcode:${key}`;
      if (!duplicateGroups.has(groupKey)) {
        duplicateGroups.set(groupKey, group);
      }
      group.forEach(prod => {
        if (prod.id) {
          duplicateIdSet.add(prod.id);
          const currentCount = duplicateCountById.get(prod.id) || group.length;
          duplicateCountById.set(prod.id, Math.max(currentCount, group.length));
          if (!duplicateGroupKeyById.has(prod.id)) {
            duplicateGroupKeyById.set(prod.id, groupKey);
          }
        }
      });
    }
  });

  return {
    duplicateIdSet,
    duplicateCountById,
    duplicateGroupKeyById,
    duplicateGroups,
    totalDuplicates: duplicateIdSet.size,
    uniqueDuplicateNamesCount: duplicateGroups.size
  };
}

export function normalizeBarcode(value?: string): string { return (value || '').replace(/\s+/g, '').trim(); }
export function isDuplicateProduct(candidate: Pick<Product, 'name' | 'barcode'>, product: Pick<Product, 'name' | 'barcode'>): boolean {
  const name = normalizeProductName(candidate.name);
  const barcode = normalizeBarcode(candidate.barcode);
  return !!(name && name === normalizeProductName(product.name) || barcode && barcode === normalizeBarcode(product.barcode));
}
export function findDuplicateProducts(candidate: Pick<Product, 'name' | 'barcode'>, products: Product[], excludeId?: string): Product[] {
  return products.filter(product => product.id !== excludeId && !product.mergedIntoId && isDuplicateProduct(candidate, product));
}

/** Ignore accents/case/spacing; allow a single typo, but never conflate sizes or numbers. */
export function similarProductNames(a: string, b: string): boolean {
  const clean = (s: string) => normalizeProductName(s).replace(/\s/g, '');
  const x = clean(a), y = clean(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length,y.length) < 7 || Math.abs(x.length-y.length)>1 || (x.match(/\d+/g)||[]).join() !== (y.match(/\d+/g)||[]).join()) return false;
  let previous = Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++) {
    const next=[i];
    for(let j=1;j<=y.length;j++) next[j]=Math.min(previous[j]+1,next[j-1]+1,previous[j-1]+Number(x[i-1]!==y[j-1]));
    previous=next;
  }
  return previous[y.length]<=1;
}
export function suspiciousProductPairs(products: Product[]): [Product,Product][] {
  const active=products.filter(p=>p.id && !p.mergedIntoId), pairs: [Product,Product][]=[];
  for(let i=0;i<active.length;i++) for(let j=i+1;j<active.length;j++)
    if (isDuplicateProduct(active[i],active[j]) || similarProductNames(active[i].name,active[j].name)) pairs.push([active[i],active[j]]);
  return pairs;
}
