import { getEffectiveOwnerId } from './api';
import { auth } from './firebase';
import { db } from './cloudStore';
import { collection, getDocs, query, where, doc, getDoc } from './cloudStore';
import { Product, Customer, Sale, Payment, Settings, Purchase } from '../types';

export interface CloudBackupPayload {
  version: string;
  exportedAt: string;
  exportedAtTimestamp: number;
  environment: string;
  store: {
    ownerId: string;
    storeName?: string;
    cnpj?: string;
    email?: string;
    phone?: string;
  };
  data: {
    products: (Product & { id: string })[];
    customers: (Customer & { id: string })[];
    sales: (Sale & { id: string; items?: any[] })[];
    payments: (Payment & { id: string })[];
    purchases: (Purchase & { id: string })[];
    settings: Settings | null;
  };
  metrics: {
    totalProducts: number;
    totalCustomers: number;
    totalSales: number;
    totalPayments: number;
    totalPurchases: number;
  };
}

const BACKUP_SCHEDULE_KEY = 'eu_gerencio_last_daily_backup';

/**
 * Collects the active store Supabase data into a structured backup object.
 */
export async function generateFullUserDataBackup(): Promise<CloudBackupPayload> {
  const uid = getEffectiveOwnerId();
  if (!uid) throw new Error('Usuário não autenticado para realizar o backup.');

  // Fetch Settings
  let settingsData: Settings | null = null;
  try {
    const sDoc = await getDoc(doc(db, 'settings', uid));
    if (sDoc.exists()) {
      settingsData = sDoc.data() as Settings;
    }
  } catch (err) {
    console.warn('Backup: error fetching settings', err);
  }

  // Fetch Products
  const productsSnap = await getDocs(query(collection(db, 'products'), where('ownerId', '==', uid)));
  const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string }));

  // Fetch Customers
  const customersSnap = await getDocs(query(collection(db, 'customers'), where('ownerId', '==', uid)));
  const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer & { id: string }));

  // Fetch Payments
  const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('ownerId', '==', uid)));
  const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment & { id: string }));

  // Fetch Purchases
  const purchasesSnap = await getDocs(query(collection(db, 'purchases'), where('ownerId', '==', uid)));
  const purchases = purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Purchase & { id: string }));

  // Fetch Sales and items
  const salesSnap = await getDocs(query(collection(db, 'sales'), where('ownerId', '==', uid)));
  const sales: (Sale & { id: string; items?: any[] })[] = [];

  for (const sDoc of salesSnap.docs) {
    const saleData = { id: sDoc.id, ...sDoc.data() } as Sale & { id: string; items?: any[] };
    try {
      const itemsSnap = await getDocs(collection(db, `sales/${sDoc.id}/saleItems`));
      saleData.items = itemsSnap.docs.map(idoc => ({ id: idoc.id, ...idoc.data() }));
    } catch {
      saleData.items = [];
    }
    sales.push(saleData);
  }

  const now = new Date();

  return {
    version: '1.0.0',
    exportedAt: now.toISOString(),
    exportedAtTimestamp: now.getTime(),
    environment: 'Supabase Cloud',
    store: {
      ownerId: uid,
      storeName: settingsData?.storeName || 'Meu Comércio',
      cnpj: settingsData?.cnpj || '',
      email: settingsData?.email || auth.currentUser?.email || '',
      phone: settingsData?.phone || '',
    },
    data: {
      products,
      customers,
      sales,
      payments,
      purchases,
      settings: settingsData,
    },
    metrics: {
      totalProducts: products.length,
      totalCustomers: customers.length,
      totalSales: sales.length,
      totalPayments: payments.length,
      totalPurchases: purchases.length,
    }
  };
}

/**
 * Downloads the backup payload directly as a secure JSON snapshot file.
 */
export function downloadBackupJsonFile(backup: CloudBackupPayload) {
  const storeSlug = (backup.store.storeName || 'loja')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-');
  const dateStr = new Date(backup.exportedAtTimestamp).toISOString().split('T')[0];
  const filename = `backup-supabase-${storeSlug}-${dateStr}.json`;

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Checks if a daily automated backup is due (24h after last run).
 * If due, checks the cloud data in the background and records only its last check timestamp.
 * Complete JSON backups are downloaded explicitly, never used as browser database.
 */
export async function checkAndRunDailyAutomatedBackup(): Promise<{ executed: boolean; lastBackupAt: number | null; metrics?: CloudBackupPayload['metrics'] }> {
  const uid = getEffectiveOwnerId();
  if (!uid) return { executed: false, lastBackupAt: null };

  const storageKey = `${BACKUP_SCHEDULE_KEY}_${uid}`;
  const lastRun = localStorage.getItem(storageKey);
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (lastRun) {
    const lastTimestamp = parseInt(lastRun, 10);
    if (!isNaN(lastTimestamp) && (now - lastTimestamp) < ONE_DAY_MS) {
      return { executed: false, lastBackupAt: lastTimestamp };
    }
  }

  // Backup is due or never ran today
  try {
    const backup = await generateFullUserDataBackup();
    localStorage.setItem(storageKey, String(now));
    return { executed: true, lastBackupAt: now, metrics: backup.metrics };
  } catch (err) {
    console.error('Error running automated daily backup:', err);
    return { executed: false, lastBackupAt: lastRun ? parseInt(lastRun, 10) : null };
  }
}

export function getLastBackupTimestamp(): number | null {
  const uid = getEffectiveOwnerId();
  if (!uid) return null;
  const storageKey = `${BACKUP_SCHEDULE_KEY}_${uid}`;
  const last = localStorage.getItem(storageKey);
  return last ? parseInt(last, 10) : null;
}
