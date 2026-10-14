import { normalizeProductName } from './duplicateDetector';
import { getStandardCatalog, selectMissingCatalog, type CatalogProduct } from './standardCatalog';

interface CatalogImportStore {
  readExisting: () => Promise<{ name: string }[]>;
  insertProducts: (products: CatalogProduct[]) => Promise<number>;
}

/** Import only absent names and return the count confirmed by the authoritative cloud transaction. */
export async function executeCatalogImport(ownerId: string, store: CatalogImportStore, catalog: CatalogProduct[] = getStandardCatalog()): Promise<number> {
  if (!ownerId) throw new Error('Entre na sua conta para importar o catálogo.');
  const existing = await store.readExisting();
  const missing = selectMissingCatalog(catalog, existing);
  if (!missing.length) return 0;
  return await store.insertProducts(missing);
}

/** Compact stable IDs satisfy the database's 128-character key constraint even for long product names/UIDs. */
export async function catalogDocumentId(ownerId: string, name: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${ownerId}\0${normalizeProductName(name)}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `catalog_${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
