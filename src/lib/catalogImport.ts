import { normalizeProductName } from './duplicateDetector';
import { getStandardCatalog, selectMissingCatalog, toSupabaseCatalogRows, type CatalogProduct } from './standardCatalog';

interface CatalogImportStore {
  readExisting: () => Promise<{ name: string }[]>;
  insertSupabase: (rows: ReturnType<typeof toSupabaseCatalogRows>) => Promise<void>;
  insertStock: (products: CatalogProduct[]) => Promise<number>;
}

/** Do not report success or start Stock writes when Supabase rejects the bulk operation. */
export async function executeCatalogImport(ownerId: string, store: CatalogImportStore, catalog: CatalogProduct[] = getStandardCatalog()): Promise<number> {
  if (!ownerId) throw new Error('Entre na sua conta para importar o catálogo.');
  const existing = await store.readExisting();
  const missing = selectMissingCatalog(catalog, existing);
  if (!missing.length) return 0;
  await store.insertSupabase(toSupabaseCatalogRows(missing, ownerId));
  return await store.insertStock(missing);
}

/** Compact stable IDs satisfy Firestore's 128-character rule even for long product names/UIDs. */
export async function catalogDocumentId(ownerId: string, name: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${ownerId}\0${normalizeProductName(name)}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `catalog_${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
