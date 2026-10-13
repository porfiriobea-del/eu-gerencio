import { getStandardCatalog, selectMissingCatalog, toSupabaseCatalogRows, type CatalogProduct } from './standardCatalog';

interface CatalogImportStore {
  readExisting: () => Promise<{ name: string }[]>;
  insertSupabase: (rows: ReturnType<typeof toSupabaseCatalogRows>) => Promise<void>;
  insertStock: (products: CatalogProduct[]) => Promise<number>;
}

/** Do not report success or start Stock writes when Supabase rejects the bulk operation. */
export async function executeCatalogImport(ownerId: string, store: CatalogImportStore): Promise<number> {
  if (!ownerId) throw new Error('Entre na sua conta para importar o catálogo.');
  const existing = await store.readExisting();
  const missing = selectMissingCatalog(getStandardCatalog(), existing);
  if (!missing.length) return 0;
  await store.insertSupabase(toSupabaseCatalogRows(missing, ownerId));
  return await store.insertStock(missing);
}
