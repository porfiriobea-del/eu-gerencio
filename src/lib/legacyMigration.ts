import { getApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getDocFromCache, getDocsFromCache, doc as legacyDoc, collection as legacyCollection, query as legacyQuery, where as legacyWhere, getDocFromServer, getDocsFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { db, doc, getDoc, writeBatch } from './cloudStore';
import { normalizeCigaretteStock } from './productUnits';
import { withActionDeadline } from './actionFeedback';
let legacyDatabase: ReturnType<typeof initializeFirestore> | null = null;
async function legacyRead(ref: any, isQuery: boolean, cached: () => void): Promise<any> {
  try { return await withActionDeadline(async () => isQuery ? await getDocsFromServer(ref) : await getDocFromServer(ref), 10000)(); }
  catch (error) {
    try {
      const snapshot = await (isQuery ? getDocsFromCache : getDocFromCache)(ref);
      if (!isQuery && !(snapshot as any).exists()) throw error;
      cached(); return snapshot;
    }
    catch { throw error; }
  }
}

/** One-time authenticated read of the legacy database. All destination writes use Supabase/RLS. */
export async function migrateLegacyStore(ownerId: string): Promise<boolean> {
  legacyDatabase ||= initializeFirestore(getApp(), { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, (firebaseConfig as any).firestoreDatabaseId);
  const legacy = legacyDatabase;
  let usedCache = false;
  const cached = () => { usedCache = true; };
  let profile = await legacyRead(legacyDoc(legacy, 'settings', ownerId), false, cached);
  if (!profile.exists()) {
    try { const cached = await getDocFromCache(legacyDoc(legacy, 'settings', ownerId)); if (cached.exists()) { profile = cached; usedCache = true; } } catch {}
  }
  if (!profile.exists() || !profile.data().storeName) {
    const membership = await legacyRead(legacyDoc(legacy,'userStores',ownerId), false, cached);
    if (membership.exists() && membership.data().ownerId !== ownerId) throw new Error('A loja antiga da sua equipe precisa ser migrada primeiro pelo proprietário. Entre com a conta da loja no aparelho que contém os dados.');
    return false;
  }
  if (profile.data().ownerId !== ownerId) throw new Error('O cadastro antigo não pertence a esta conta.');
  const records: { path: string; id: string; data: Record<string, any> }[] = [];
  for (const path of ['products','customers','sales','payments','purchases','cashClosures','employees','movements','feedbacks','teamInvitations','userStores']) {
    const snapshot = await legacyRead(legacyQuery(legacyCollection(legacy, path), legacyWhere('ownerId','==',ownerId)), true, cached);
    for (const record of snapshot.docs) {
      const value = path === 'products' ? normalizeCigaretteStock(record.data()) : record.data();
      records.push({ path, id: record.id, data: value });
      if (path === 'sales') {
        const itemPath = `sales/${record.id}/saleItems`;
        const items = await legacyRead(legacyQuery(legacyCollection(legacy, itemPath), legacyWhere('ownerId','==',ownerId)), true, cached);
        for (const item of items.docs) records.push({ path: itemPath, id: item.id, data: item.data() });
      }
    }
  }
  // Copy only absent records; retries cannot overwrite live prices, stock or debt.
  for (let offset=0; offset<records.length; offset+=200) {
    const batch = writeBatch(db);
    const chunk = records.slice(offset,offset+200);
    const current = await Promise.all(chunk.map(record => getDoc(doc(db,record.path,record.id))));
    chunk.forEach((record,index) => {
      if (!current[index].exists()) { batch.expect(current[index]); batch.set(current[index].ref,record.data); }
    });
    await batch.commit();
  }
  // Profile is last: a partial migration never falsely marks the store ready.
  const target = await getDoc(doc(db,'settings',ownerId));
  if (!target.exists()) {
    const batch=writeBatch(db);batch.expect(target);batch.set(target.ref,{ ...profile.data(), legacyMigrationPending: usedCache });await batch.commit();
  } else if (!usedCache && target.data().legacyMigrationPending) {
    const batch = writeBatch(db);batch.update(target.ref,{ legacyMigrationPending: false });await batch.commit();
  }
  return true;
}
