import { supabase, assertSupabaseConfigured } from './supabase';

export const TABLES: Record<string, string> = {
  settings: 'eu_store_settings', products: 'eu_products', customers: 'eu_customers',
  sales: 'eu_sales', saleItems: 'eu_sale_items', payments: 'eu_payments', purchases: 'eu_purchases',
  cashClosures: 'eu_cash_closures', employees: 'eu_employees', movements: 'eu_movements',
  feedbacks: 'eu_feedbacks', teamInvitations: 'eu_team_invitations', userStores: 'eu_user_stores'
};
export const db = Object.freeze({ provider: 'supabase' });
const writeQueues = new Map<string, Promise<void>>();
export function enqueueCloudWrite<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) || Promise.resolve();
  const result = previous.then(action);
  // A failed click must not prevent later clicks from being processed.
  const tail = result.then(() => {}, () => {});
  writeQueues.set(key, tail);
  void tail.then(() => { if (writeQueues.get(key) === tail) writeQueues.delete(key); });
  return result;
}
export interface Reference { path: string; id: string; collectionPath: string; table: string }
interface Filter { kind: 'where' | 'order'; field: string; operator?: string; value?: unknown; direction?: 'asc' | 'desc' }
interface Query { path: string; table: string; filters: Filter[] }
interface CloudRow { id: string; collection_path: string; owner_id: string; revision: number; data: Record<string, any> }
interface Operation { table: string; path: string; id: string; action: string; data?: Record<string, any>; merge?: boolean }
interface ReadVersion { table: string; path: string; id: string; revision: number }
const localUpdates = new EventTarget();
const removeMarker = Object.freeze({ __eu_delete_field: true });
export const deleteField = () => removeMarker;
const event = (name: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(name)); };

function table(path: string) {
  const key = path.split('/').at(-1)!;
  if (!TABLES[key]) throw new Error(`Coleção não suportada: ${key}`);
  return TABLES[key];
}
export function collection(_db: unknown, path: string): Query { return { path, table: table(path), filters: [] }; }
export function doc(parent: unknown, ...parts: string[]): Reference {
  const base = (parent as Query)?.path;
  const full = base ? [base, parts[0] || crypto.randomUUID()].join('/') : parts.join('/');
  const segments = full.split('/');
  const id = segments.pop()!; const collectionPath = segments.join('/');
  return { id, path: full, collectionPath, table: table(collectionPath) };
}
export const where = (field: string, operator: string, value: unknown): Filter => ({ kind: 'where', field, operator, value });
export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): Filter => ({ kind: 'order', field, direction });
export const query = (source: Query, ...filters: Filter[]): Query => ({ ...source, filters: [...source.filters, ...filters] });

export class DocumentSnapshot {
  constructor(public ref: Reference, private row: CloudRow | null) {}
  get id() { return this.ref.id; }
  get revision() { return this.row?.revision ?? 0; }
  exists() { return this.row !== null; }
  data(): Record<string, any> { return this.row ? structuredClone(this.row.data) : {}; }
}
export class QuerySnapshot {
  constructor(public docs: DocumentSnapshot[]) {}
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
  forEach(callback: (snapshot: DocumentSnapshot) => void) { this.docs.forEach(callback); }
}
function fail(error: any): never {
  if (!error?.code || /fetch|network|connection/i.test(error?.message || '')) event('cloud-offline');
  let message = error?.message || 'Não foi possível acessar os dados na nuvem.';
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) {
    message = 'A estrutura do Supabase ainda não está instalada ou atualizada. Execute a migração 20261014_cloud_source_of_truth.sql no SQL Editor do projeto e tente novamente.';
  } else if (['PGRST301', 'PGRST303'].includes(error?.code)) {
    message = 'O Supabase não reconheceu a sessão. Entre novamente e verifique a integração Firebase em Authentication → Third-Party Auth no projeto Supabase.';
  }
  const result = new Error(message);
  Object.assign(result, { code: error?.code, details: error?.details });
  throw result;
}
export async function verifyCloudIdentity(userId: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc('eu_user_id');
  if (error) fail(error);
  if (data !== userId) throw new Error('A conta Google não foi reconhecida pelo Supabase. Verifique a integração Firebase e a migração do banco antes de cadastrar a loja.');
}

export async function getDoc(ref: Reference): Promise<DocumentSnapshot> {
  assertSupabaseConfigured();
  const { data, error } = await supabase.from(ref.table).select('id,collection_path,owner_id,revision,data').eq('collection_path', ref.collectionPath).eq('id', ref.id).maybeSingle();
  if (error) fail(error);
  event('cloud-online');
  return new DocumentSnapshot(ref, data as CloudRow | null);
}
export async function getDocs(source: Query): Promise<QuerySnapshot> {
  assertSupabaseConfigured();
  const rows: CloudRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let request = supabase.from(source.table).select('id,collection_path,owner_id,revision,data').eq('collection_path', source.path);
    for (const filter of source.filters.filter(item => item.kind === 'where')) {
      const key = filter.field === 'ownerId' ? 'owner_id' : `data->${typeof filter.value === 'number' ? '' : '>'}${filter.field}`;
      const operators: Record<string, string> = { '==': 'eq', '>=': 'gte', '<=': 'lte', '>': 'gt', '<': 'lt', '!=': 'neq' };
      if (!operators[filter.operator!]) throw new Error('Filtro de consulta não suportado.');
      request = request.filter(key, operators[filter.operator!], filter.value);
    }
    const { data, error } = await request.order('id').range(offset, offset + 999);
    if (error) fail(error);
    rows.push(...(data || []) as CloudRow[]);
    if (!data || data.length < 1000) break;
  }
  for (const filter of source.filters.filter(item => item.kind === 'order').reverse()) {
    rows.sort((a, b) => {
      const x = a.data[filter.field], y = b.data[filter.field];
      const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''));
      return filter.direction === 'desc' ? -result : result;
    });
  }
  event('cloud-online');
  return new QuerySnapshot(rows.map(row => new DocumentSnapshot(doc(db, row.collection_path, row.id), row)));
}

async function commit(operations: Operation[], reads: ReadVersion[] = [], requestId = crypto.randomUUID()) {
  assertSupabaseConfigured();
  if (!operations.length) return;
  const { error } = await supabase.rpc('eu_apply_changes', { operations, read_versions: reads, request_id: requestId });
  if (error) fail(error);
  event('cloud-online');
  for (const name of new Set(operations.map(operation => operation.table))) localUpdates.dispatchEvent(new Event(name));
}
export function writeBatch(_db: unknown) {
  const operations: Operation[] = []; const reads: ReadVersion[] = [];
  const requestId = crypto.randomUUID();
  return {
    set(ref: Reference, data: Record<string, any>, options?: { merge?: boolean }) { operations.push({ table: ref.table, path: ref.collectionPath, id: ref.id, action: 'set', data, merge: options?.merge }); },
    update(ref: Reference, data: Record<string, any>) { operations.push({ table: ref.table, path: ref.collectionPath, id: ref.id, action: 'update', data }); },
    delete(ref: Reference) { operations.push({ table: ref.table, path: ref.collectionPath, id: ref.id, action: 'delete' }); },
    expect(snapshot: DocumentSnapshot) { reads.push({ table: snapshot.ref.table, path: snapshot.ref.collectionPath, id: snapshot.id, revision: snapshot.revision }); },
    commit() { return commit(operations, reads, requestId); }
  };
}
export const setDoc = (ref: Reference, data: Record<string, any>, options?: { merge?: boolean }) => { const batch = writeBatch(db); batch.set(ref, data, options); return batch.commit(); };
export const updateDoc = (ref: Reference, data: Record<string, any>) => { const batch = writeBatch(db); batch.update(ref, data); return batch.commit(); };
export const deleteDoc = (ref: Reference) => { const batch = writeBatch(db); batch.delete(ref); return batch.commit(); };
export async function runTransaction<T>(_db: unknown, action: (transaction: ReturnType<typeof writeBatch> & { get: typeof getDoc }) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const batch = writeBatch(db);
    const transaction = { ...batch, get: async (ref: Reference) => { const snapshot = await getDoc(ref); batch.expect(snapshot); return snapshot; } };
    try {
      const result = await action(transaction);
      await batch.commit(); return result;
    } catch (error) {
      const conflict = [String((error as any)?.code), String((error as any)?.message), String((error as any)?.details)].some(value => value.includes('TRANSACTION_CONFLICT'));
      if (!conflict) throw error;
      if (attempt === 2) throw new Error('Não foi possível confirmar a alteração após 3 tentativas. O registro está sendo alterado em outro dispositivo. Atualize os dados e tente novamente.');
    }
  }
  throw new Error('O estoque mudou em outro dispositivo. Atualize os dados e tente novamente.');
}

export function onSnapshot(source: Reference, callback: (snapshot: DocumentSnapshot) => void, onError?: (error: unknown) => void): () => void;
export function onSnapshot(source: Query, callback: (snapshot: QuerySnapshot) => void, onError?: (error: unknown) => void): () => void;
export function onSnapshot(source: Reference | Query, callback: (snapshot: any) => void, onError?: (error: unknown) => void) {
  let active = true; let loading = false; let queued = false; let generation = 0; let lastValue: string | undefined;
  const refresh = async () => {
    if (!active) return;
    if (loading) { queued = true; return; }
    loading = true; const current = ++generation;
    try {
      const snapshot = 'id' in source ? await getDoc(source) : await getDocs(source);
      const serialized = JSON.stringify('id' in source ? (snapshot as DocumentSnapshot).data() : (snapshot as QuerySnapshot).docs.map(item => ({ id: item.id, data: item.data() })));
      if (active && current === generation && lastValue !== serialized) { lastValue = serialized; callback(snapshot); }
    } catch (error) { if (active) { try { if (onError) onError(error); else console.error('[Supabase subscription]', (error as Error).message); } catch {} } }
    finally { loading = false; if (queued && active) { queued = false; void refresh(); } }
  };
  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    assertSupabaseConfigured();
    const owner = 'id' in source && source.table === TABLES.settings ? source.id : 'filters' in source ? source.filters.find(filter => filter.field === 'ownerId' && filter.operator === '==')?.value : undefined;
    channel = supabase.channel(`eu-${source.table}-${crypto.randomUUID()}`).on('postgres_changes', {
      event: '*', schema: 'public', table: source.table, ...(typeof owner === 'string' ? { filter: `owner_id=eq.${owner}` } : {})
    }, () => { void refresh(); }).subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
  } catch { /* refresh reports configuration errors without opening a bogus connection. */ }
  localUpdates.addEventListener(source.table, refresh);
  if (typeof window !== 'undefined') { window.addEventListener('online', refresh); window.addEventListener('cloud-refresh', refresh); window.addEventListener('focus', refresh); }
  const timer = setInterval(refresh, 15000); // Recovery when Realtime is unavailable or the phone resumes.
  void refresh();
  return () => {
    active = false; generation++; clearInterval(timer); localUpdates.removeEventListener(source.table, refresh);
    if (typeof window !== 'undefined') { window.removeEventListener('online', refresh); window.removeEventListener('cloud-refresh', refresh); window.removeEventListener('focus', refresh); }
    if (channel) void supabase.removeChannel(channel);
  };
}
