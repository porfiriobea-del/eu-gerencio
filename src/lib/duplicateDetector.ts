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
    const normName = normalizeProductName(p.name);
    if (normName) {
      const existing = nameGroups.get(normName) || [];
      existing.push(p);
      nameGroups.set(normName, existing);
    }

    const barcode = (p.barcode || '').trim();
    if (barcode && barcode.length >= 4) {
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
